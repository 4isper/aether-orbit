import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DoubleSide, Vector3, type Group, type Mesh } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { Atmosphere } from './Atmosphere'

const surfaceVertexShader = /* glsl */ `
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vObjectPosition = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const surfaceFragment = /* glsl */ `
uniform vec3 uSunDirection;
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
  float warp = fbm4(p * 3.0) * 0.5;
  float bands = fbm4(vec3(p.y * 9.0 + warp, p.x * 0.6, p.z * 0.6));
  bands += 0.06 * sin(p.y * 40.0 + warp * 8.0);
  vec3 albedo = mix(
    vec3(0.40, 0.55, 0.59),
    vec3(0.88, 0.84, 0.72),
    smoothstep(0.32, 0.68, bands)
  );

  vec3 stormOffset = p - normalize(vec3(0.5, -0.25, 0.8));
  float stormDistance = length(vec3(stormOffset.x, stormOffset.y * 2.0, stormOffset.z));
  float storm = 1.0 - smoothstep(0.08, 0.28, stormDistance);
  albedo = mix(albedo, vec3(0.62, 0.42, 0.30) * 0.6, storm);

  vec3 geometricN = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  float micro = fbm4(p * 84.0 + vec3(1.7, 8.2, -3.4));
  float bumpFade = smoothstep(0.08, 0.34, max(dot(geometricN, V), 0.0));
  float elevation = micro * 0.002 * bumpFade;
  vec3 N = perturbNormal(vWorldPosition, geometricN, elevation);

  vec3 L = normalize(uSunDirection);
  float diffuse = max(dot(N, L), 0.0);
  vec3 color = albedo * (0.006 + diffuse * 1.1);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const ringVertexShader = /* glsl */ `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vCenter;
varying float vScale;

void main() {
  vLocalPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vScale = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const ringFragment = /* glsl */ `
uniform vec3 uSunDirection;
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vCenter;
varying float vScale;
${noiseGLSL}

void main() {
  float radius = length(vLocalPosition.xy);
  float t = (radius - 2.5) / 1.5;
  float band = smoothstep(0.25, 0.75, fbm4(vec3(t * 70.0, 3.0, 9.0)) * 0.5 + 0.5);
  float stripes = 0.035 * sin(t * 420.0);
  float cassini = smoothstep(0.60, 0.64, t) * (1.0 - smoothstep(0.70, 0.74, t));
  float density = (0.35 + 0.65 * band + stripes) * (1.0 - 0.85 * cassini);
  float edge = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));

  vec3 L = normalize(uSunDirection);
  float light = abs(dot(normalize(vWorldNormal), L)) * 0.75 + 0.25;

  vec3 d = vWorldPosition - vCenter;
  float along = dot(d, L);
  float perp = length(d - L * along);
  float shadow = along < 0.0
    ? smoothstep(2.0 * vScale * 0.97, 2.0 * vScale * 1.03, perp)
    : 1.0;

  vec3 color = mix(vec3(0.62, 0.60, 0.55), vec3(0.86, 0.84, 0.78), band)
    * light * mix(0.25, 1.0, shadow);
  float alpha = density * edge * (0.22 + 0.45 * light) * mix(0.35, 1.0, shadow);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type VesperProps = {
  reducedMotion: boolean
  timeScale: number
}

export function Vesper({ reducedMotion, timeScale }: VesperProps) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const { width, height } = useThree((state) => state.viewport)
  const compact = useThree((state) => state.size.width < 700) || width / height < 0.9

  const sunDirection = useMemo(() => new Vector3(-1, 0, 0), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const surfaceUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
    }),
    [sunDirection],
  )
  const ringUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
    }),
    [sunDirection],
  )

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.getWorldPosition(worldPosition)
      sunDirection.copy(worldPosition).multiplyScalar(-1).normalize()
    }

    if (!reducedMotion && surfaceRef.current) {
      surfaceRef.current.rotation.y += delta * 0.005 * timeScale
    }
  })

  return (
    <group
      ref={groupRef}
      scale={compact ? 0.8 : 1.08}
      rotation={[0.42, 0, -0.16]}
    >
      <mesh ref={surfaceRef}>
        <sphereGeometry args={[2, 128, 128]} />
        <shaderMaterial
          vertexShader={surfaceVertexShader}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} renderOrder={1}>
        <ringGeometry args={[2.5, 4, 180, 1]} />
        <shaderMaterial
          vertexShader={ringVertexShader}
          fragmentShader={ringFragment}
          uniforms={ringUniforms}
          side={DoubleSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      <Atmosphere sunDirection={sunDirection} variant="ice" />
    </group>
  )
}