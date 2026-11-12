import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Matrix4, Quaternion, ShaderMaterial, Vector3, type InstancedMesh } from 'three'
import { ringRockLayout } from '../ring-rocks'

const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uCenter;
varying vec3 vWorldPosition;

void main() {
  // The derivative-based face normal degenerates on silhouette quads; the
  // radial fallback keeps a single NaN pixel out of the bloom chain, where
  // the blur would otherwise spread it over the whole frame.
  vec3 flatNormal = cross(dFdx(vWorldPosition), dFdy(vWorldPosition));
  vec3 N = length(flatNormal) > 1e-8
    ? normalize(flatNormal)
    : normalize(vWorldPosition - uCenter);
  vec3 L = normalize(-vWorldPosition);
  float ndl = max(dot(N, L), 0.0);

  // Starlight falloff, unity at Aurelia's 9 u orbit, exponent 1.5 (see orbits.ts).
  float flux = pow(9.0 / max(length(uCenter), 0.0001), 1.5);
  vec3 albedo = vec3(0.62, 0.64, 0.68);

  vec3 color = albedo * (0.012 + ndl * flux);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const ROCK_COUNT = 420
const ROCK_SEED = 2026
/** One lap of the ring's slow revolution, radians per time unit. */
const REVOLVE_SPEED = 0.045
/** Level of detail: the layer lives for close flights only. Zero size past
 * FADE_FAR, full size inside FADE_NEAR — the rocks grow in as the pilot
 * descends on the plane, with no transparency to sort against the rings. */
const FADE_FAR = 7
const FADE_NEAR = 5

/**
 * The ring's coarse cargo: instanced ice blocks in Vesper's ring plane, the
 * through-the-rings texture for free flight. Hidden entirely at orbiting
 * distances — the shader plane carries the rings from afar.
 */
export function RingRocks({ timeRef, worldPosition }: { timeRef: { current: number }, worldPosition: Vector3 }) {
  const ref = useRef<InstancedMesh>(null)
  const camera = useThree((state) => state.camera)
  const layout = useMemo(() => ringRockLayout(ROCK_COUNT, ROCK_SEED), [])
  const material = useMemo(
    () => new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uCenter: { value: new Vector3() } },
    }),
    [],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new Matrix4()
    const quaternion = new Quaternion()
    const euler = new Euler()
    const position = new Vector3()
    const scale = new Vector3()
    const random = (() => {
      // A second stream for the tumble, kept local to the visual so the
      // tested layout file stays about placement, not orientation.
      let seed = ROCK_SEED * 2 + 1
      return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed / 2147483648
      }
    })()
    for (let i = 0; i < layout.count; i++) {
      position.set(layout.positions[i * 3], layout.positions[i * 3 + 1], layout.positions[i * 3 + 2])
      euler.set(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2)
      quaternion.setFromEuler(euler)
      const size = layout.scales[i]
      scale.set(size, size * (0.55 + random() * 0.9), size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [layout])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const distance = camera.position.distanceTo(worldPosition)
    const fade = Math.min(Math.max((FADE_FAR - distance) / (FADE_FAR - FADE_NEAR), 0), 1)
    mesh.visible = fade > 0
    mesh.scale.setScalar(Math.max(fade, 1e-4))
    material.uniforms.uCenter.value.copy(worldPosition)
    mesh.rotation.y = timeRef.current * REVOLVE_SPEED
  })

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, ROCK_COUNT]}
      frustumCulled={false}
      raycast={() => null}
      visible={false}
    >
      <icosahedronGeometry args={[1, 0]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}
