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

type RingConfig = {
  inner: number
  outer: number
  count: number
  speed: number
  spread: number
  seed: number
}

const rings: RingConfig[] = [
  { inner: 15.5, outer: 16.7, count: 640, speed: 0.0122, spread: 0.34, seed: 907 },
  { inner: 16.7, outer: 17.7, count: 540, speed: 0.0112, spread: 0.42, seed: 2903 },
  { inner: 17.7, outer: 18.6, count: 440, speed: 0.0103, spread: 0.34, seed: 4409 },
]

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
  config: RingConfig
  material: ShaderMaterial
  timeRef: { current: number }
}

function BeltRing({ config, material, timeRef }: BeltRingProps) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const random = createRandom(config.seed)
    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const euler = new Euler()
    const scale = new Vector3()

    for (let i = 0; i < config.count; i++) {
      const angle = random() * Math.PI * 2
      const radius = config.inner + (config.outer - config.inner) * random()
      const y = (random() - 0.5) * 2 * config.spread * (0.35 + random() * 0.65)
      position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      euler.set(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2)
      quaternion.setFromEuler(euler)
      const size = 0.032 + Math.pow(random(), 2.4) * 0.075
      scale.set(size, size * (0.55 + random() * 0.9), size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [config])

  useFrame(() => {
    if (ref.current) ref.current.rotation.y = timeRef.current * config.speed
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
      {rings.map((config) => (
        <BeltRing key={config.seed} config={config} material={material} timeRef={timeRef} />
      ))}
    </group>
  )
}
