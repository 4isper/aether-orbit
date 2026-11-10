import { useCallback, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { RepeatWrapping, SRGBColorSpace, Vector3, type Mesh, type Texture } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { Atmosphere } from './Atmosphere'

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vObjectPosition = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const surfaceFragment = /* glsl */ `
uniform sampler2D uDayMap;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

vec3 perturbNormal(vec3 surfacePosition, vec3 surfaceNormal, float height) {
  vec3 sigmaX = normalize(dFdx(surfacePosition));
  vec3 sigmaY = normalize(dFdy(surfacePosition));
  vec3 R1 = cross(sigmaY, surfaceNormal);
  vec3 R2 = cross(surfaceNormal, sigmaX);
  float det = dot(sigmaX, R1);
  vec3 gradient = sign(det) * (
    dFdx(height) * R1 + dFdy(height) * R2
  );
  return normalize(abs(det) * surfaceNormal - gradient);
}

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
  vec3 color = albedo * (0.008 + diffuse * 1.15);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type CinderProps = {
  reducedMotion: boolean
}

export function Cinder({ reducedMotion }: CinderProps) {
  const surfaceRef = useRef<Mesh>(null)
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

  const sunDirection = useMemo(
    () => new Vector3(-0.82, 0.25, 0.32).normalize(),
    [],
  )
  const surfaceUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uDayMap: { value: dayMap },
    }),
    [sunDirection, dayMap],
  )

  useFrame((_, delta) => {
    if (!reducedMotion && surfaceRef.current) {
      surfaceRef.current.rotation.y += delta * 0.004
    }
  })

  return (
    <group
      position={compact ? [0.45, -1.3, 0] : [1.8, -0.5, 0]}
      scale={compact ? 0.7 : 0.92}
      rotation={[0.08, 0, -0.09]}
    >
      <mesh ref={surfaceRef}>
        <sphereGeometry args={[2, 128, 128]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <Atmosphere sunDirection={sunDirection} dusty />
    </group>
  )
}
