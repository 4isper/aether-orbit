import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  DoubleSide,
  Euler,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type InstancedMesh,
} from 'three'
import { createRandom } from '../random'
import { noiseGLSL } from '../shaders/noise'
import { beltRings, keplerSpeed, type BeltRingConfig } from '../orbits'

const rockVertex = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vInstanceOffset;

void main() {
  vInstanceOffset = instanceMatrix[3].xyz;
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const rockFragment = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vInstanceOffset;

void main() {
  // The derivative-based face normal degenerates on silhouette quads; the
  // radial fallback keeps a single NaN pixel out of the bloom chain, where
  // the blur would otherwise spread it over the whole frame.
  vec3 flatNormal = cross(dFdx(vWorldPosition), dFdy(vWorldPosition));
  vec3 N = length(flatNormal) > 1e-8
    ? normalize(flatNormal)
    : normalize(vWorldPosition - vInstanceOffset);
  vec3 L = normalize(-vWorldPosition);
  float ndl = max(dot(N, L), 0.0);

  // Starlight falloff, unity at Aurelia's 9 u orbit, exponent 1.5 (see orbits.ts).
  float flux = pow(9.0 / max(length(vInstanceOffset), 0.0001), 1.5);
  float h = fract(sin(dot(vInstanceOffset, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 albedo = mix(vec3(0.21, 0.19, 0.17), vec3(0.42, 0.38, 0.33), h);

  vec3 color = albedo * (0.012 + ndl * flux);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

// Zodiacal light: sunlight scattered by the belt's dust, laid in the belt's
// own plane. Brightest just outside the star's corona, gone by the outer
// orbits; kept faint so it reads as haze, not as a solid disc.
const GLOW_INNER = 5
const GLOW_OUTER = 20

const glowVertex = /* glsl */ `
varying vec2 vLocal;
varying float vRadius;
void main() {
  vLocal = position.xy;
  vRadius = length(position.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const glowFragment = /* glsl */ `
uniform float uInner;
uniform float uOuter;
varying vec2 vLocal;
varying float vRadius;
${noiseGLSL}

void main() {
  float t = (vRadius - uInner) / (uOuter - uInner);
  float falloff = exp(-t * 3.6) * smoothstep(0.0, 0.15, t);
  // Broad radial and angular wisps keep it from reading as a flat disc.
  float wisps = fbm3(vec3(vLocal * 0.22, 3.1)) * 0.5 + 0.5;
  float alpha = falloff * (0.35 + 0.65 * wisps) * 0.12;
  vec3 color = vec3(1.0, 0.84, 0.62);
  gl_FragColor = vec4(color * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type BeltRingProps = {
  config: BeltRingConfig
  material: ShaderMaterial
  timeRef: { current: number }
}

function BeltRing({ config, material, timeRef }: BeltRingProps) {
  const ref = useRef<InstancedMesh>(null)
  const rocks = useRef({ base: new Float32Array(0), omega: new Float32Array(0) })
  const lastTime = useRef(Number.NaN)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const random = createRandom(config.seed)
    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const euler = new Euler()
    const scale = new Vector3()
    const base = new Float32Array(config.count * 3)
    const omega = new Float32Array(config.count)

    for (let i = 0; i < config.count; i++) {
      const angle = random() * Math.PI * 2
      const radius = config.inner + (config.outer - config.inner) * random()
      const y = (random() - 0.5) * 2 * config.spread * (0.35 + random() * 0.65)
      position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      base[i * 3] = position.x
      base[i * 3 + 1] = position.y
      base[i * 3 + 2] = position.z
      // Each rock rides its own Kepler lap: the same mean motion law as the
      // planets, so the belt shears — inner rocks overtake outer ones —
      // instead of spinning rigidly. At a ring's midline this lands exactly
      // on the speed the table declares, and rocks there stay companions of
      // the camera anchor.
      omega[i] = keplerSpeed(radius)
      euler.set(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2)
      quaternion.setFromEuler(euler)
      const size = 0.032 + Math.pow(random(), 2.4) * 0.075
      scale.set(size, size * (0.55 + random() * 0.9), size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    rocks.current = { base, omega }
  }, [config])

  // Per-rock laps on the CPU: one cos/sin pair per rock per frame is cheap,
  // and JS math is bit-identical across runs — the goldens could never trust
  // per-vertex SwiftShader transcendentals to hold still. The lap advances
  // only when the shared clock moves, so pause costs nothing.
  useFrame(() => {
    const mesh = ref.current
    const time = timeRef.current
    if (!mesh || time === lastTime.current) return
    lastTime.current = time
    const { base, omega } = rocks.current
    const array = mesh.instanceMatrix.array as Float32Array
    for (let i = 0; i < config.count; i++) {
      const angle = time * omega[i]
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      const x = base[i * 3]
      const z = base[i * 3 + 2]
      array[i * 16 + 12] = c * x - s * z
      array[i * 16 + 14] = s * x + c * z
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, config.count]}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 0]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}

type BeltProps = {
  timeRef: { current: number }
}

export function Belt({ timeRef }: BeltProps) {
  const material = useMemo(
    () => new ShaderMaterial({
      vertexShader: rockVertex,
      fragmentShader: rockFragment,
    }),
    [],
  )
  const glowUniforms = useMemo(
    () => ({ uInner: { value: GLOW_INNER }, uOuter: { value: GLOW_OUTER } }),
    [],
  )

  return (
    <group rotation={[0.035, 0, 0.02]}>
      <mesh rotation-x={-Math.PI / 2} renderOrder={-2} raycast={() => null}>
        <ringGeometry args={[GLOW_INNER, GLOW_OUTER, 160, 1]} />
        <shaderMaterial
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      {beltRings.map((config) => (
        <BeltRing key={config.seed} config={config} material={material} timeRef={timeRef} />
      ))}
    </group>
  )
}
