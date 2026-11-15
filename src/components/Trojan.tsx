import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Vector3, type Mesh } from 'three'
import { trojanPosition, trojanTrailingPosition } from '../orbits'

const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
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
  vec3 albedo = vec3(0.36, 0.33, 0.29);

  vec3 color = albedo * (0.012 + ndl * flux);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * The trojan twins at Aurelia's L4 and L5: same orbit, sixty degrees ahead
 * and behind, each tumbling slowly on the shared clock so pause, reversal
 * and deep links hold them still.
 */
export function Trojan({ timeRef, trail = false }: { timeRef: { current: number }; trail?: boolean }) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () => new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uCenter: { value: new Vector3() } },
    }),
    [],
  )
  const scratch = useMemo(() => new Vector3(), [])

  useFrame(() => {
    if (!ref.current) return
    if (trail) trojanTrailingPosition(timeRef.current, scratch)
    else trojanPosition(timeRef.current, scratch)
    ref.current.position.copy(scratch)
    material.uniforms.uCenter.value.copy(scratch)
    // Two stones, two tumbles: the twin's rates differ by a hair so they
    // never look like copies of one mesh.
    const spin = trail ? 0.17 : 0.21
    const wobble = trail ? 0.11 : 0.13
    ref.current.rotation.set(timeRef.current * spin, timeRef.current * wobble, 0)
  })

  return (
    <mesh ref={ref} raycast={() => null}>
      <icosahedronGeometry args={[0.16, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
