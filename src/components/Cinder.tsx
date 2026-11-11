import { useCallback, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { RepeatWrapping, SRGBColorSpace, type Group, type Mesh, type ShaderMaterial, type Texture } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'
import { useSunDirection } from '../hooks/useSunDirection'
import { starFlux } from '../orbits'
import { Atmosphere } from './Atmosphere'

const surfaceFragment = /* glsl */ `
uniform sampler2D uDayMap;
uniform vec3 uSunDirection;
uniform float uStarFlux;
varying vec2 vUv;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}
${perturbNormalGLSL}

void main() {
  vec3 p = normalize(vObjectPosition);
  vec3 albedo = texture2D(uDayMap, vUv).rgb;
  vec3 geometricN = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  float micro = fbm4(p * 84.0 + vec3(1.7, 8.2, -3.4));
  float bumpFade = smoothstep(0.08, 0.34, max(dot(geometricN, V), 0.0));
  float elevation = micro * 0.0035 * bumpFade;
  vec3 N = perturbNormal(vWorldPosition, geometricN, elevation);

  vec3 L = normalize(uSunDirection);
  float diffuse = max(dot(N, L), 0.0);
  vec3 color = albedo * (0.008 + diffuse * 1.15 * uStarFlux);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type CinderProps = {
  reducedMotion: boolean
  timeScale: number
}

export function Cinder({ reducedMotion, timeScale }: CinderProps) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const { width, height } = useThree((state) => state.viewport)
  const compact = useThree((state) => state.size.width < 700) || width / height < 0.9
  const gl = useThree((state) => state.gl)
  const configureTexture = useCallback(
    (texture: Texture) => {
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      texture.wrapS = RepeatWrapping
      texture.needsUpdate = true
    },
    [gl],
  )
  const dayMap = useTexture('/textures/mars-day.webp', configureTexture)

  const { sunDirection, worldPosition, updateSunDirection } = useSunDirection(groupRef)
  const surfaceUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uDayMap: { value: dayMap },
      uStarFlux: { value: 1 },
    }),
    [sunDirection, dayMap],
  )

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    updateSunDirection()
    if (surfaceMaterialRef.current) {
      surfaceMaterialRef.current.uniforms.uStarFlux.value = starFlux(worldPosition)
    }

    if (!reducedMotion && surfaceRef.current) {
      surfaceRef.current.rotation.y += delta * 0.004 * timeScale
    }
  })

  return (
    <group
      ref={groupRef}
      scale={compact ? 0.7 : 0.92}
      rotation={[0.08, 0, -0.09]}
    >
      <mesh ref={surfaceRef}>
        <sphereGeometry args={[2, 128, 128]} />
        <shaderMaterial
          ref={surfaceMaterialRef}
          vertexShader={bodyVertexGLSL(true)}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <Atmosphere sunDirection={sunDirection} variant="dust" />
    </group>
  )
}
