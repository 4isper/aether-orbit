import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group, type Mesh, type ShaderMaterial } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'
import { starFlux } from '../orbits'
import { erebusPosition } from '../erebus'
import { useSunDirection } from '../hooks/useSunDirection'

const surfaceFragment = /* glsl */ `
uniform vec3 uSunDirection;
uniform float uStarFlux;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}
${perturbNormalGLSL}

void main() {
  vec3 p = normalize(vObjectPosition);
  vec3 geometricN = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // A dwarf's face: dark regolith patched with frost, the light spent
  // sparingly so the world reads cold at this distance from Solis.
  float regolith = fbm4(p * 30.0 + vec3(2.1, 7.3, -4.6));
  float frost = smoothstep(0.15, 0.75, fbm3(p * 9.0 + vec3(-3.2, 1.4, 5.5)) * 0.5 + 0.5);
  vec3 albedo = mix(vec3(0.13, 0.12, 0.11), vec3(0.72, 0.78, 0.82), frost * 0.75);
  albedo *= 0.9 + regolith * 0.25;

  float micro = regolith * 0.0032;
  vec3 N = perturbNormal(vWorldPosition, geometricN, micro);

  vec3 L = normalize(uSunDirection);
  float diffuse = max(dot(N, L), 0.0);
  // Frost scatters a little blue around the terminator: an icy wrap.
  float wrap = pow(max(dot(geometricN, L) * 0.5 + 0.5, 0.0), 2.5) * frost * 0.1;
  vec3 color = albedo * (0.006 + (diffuse + wrap) * 1.5 * uStarFlux);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function Erebus({ reducedMotion, timeScale, timeRef }: {
  reducedMotion: boolean
  timeScale: number
  timeRef: { current: number }
}) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const materialRef = useRef<ShaderMaterial>(null)
  const worldPosition = useMemo(() => new Vector3(), [])
  const { sunDirection, updateSunDirection } = useSunDirection(groupRef)
  const uniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uStarFlux: { value: 1 },
    }),
    [sunDirection],
  )

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    // The dwarf rides the shared clock like every body: pause, reverse and
    // ?t= land it on the same point of the ellipse.
    erebusPosition(timeRef.current, worldPosition)
    groupRef.current?.position.copy(worldPosition)
    updateSunDirection()
    if (materialRef.current) {
      materialRef.current.uniforms.uStarFlux.value = starFlux(worldPosition)
    }
    if (!reducedMotion && surfaceRef.current) {
      surfaceRef.current.rotation.y += delta * 0.02 * timeScale
    }
  })

  return (
    <group ref={groupRef}>
      <mesh ref={surfaceRef} rotation={[0.12, 0, 0.07]}>
        <sphereGeometry args={[0.55, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={bodyVertexGLSL(true)}
          fragmentShader={surfaceFragment}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  )
}
