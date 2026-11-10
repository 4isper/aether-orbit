import { useCallback, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture, type MappedTextureType } from '@react-three/drei'
import {
  FrontSide,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type ShaderMaterial,
} from 'three'
import { noiseGLSL } from '../shaders/noise'
import { Atmosphere } from './Atmosphere'
import { Moon } from './Moon'

const textureUrls = [
  '/textures/earth-day.webp',
  '/textures/earth-night.webp',
  '/textures/earth-normal.webp',
  '/textures/earth-specular.webp',
  '/textures/earth-clouds.webp',
]

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
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;
uniform sampler2D uCloudMap;
uniform float uCloudOffset;
uniform vec3 uSunDirection;
uniform vec3 uMoonPosition;
uniform float uMoonRadius;
varying vec2 vUv;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

mat3 getTangentFrame(vec3 surfacePosition, vec3 surfaceNormal, vec2 uv) {
  vec3 q0 = dFdx(surfacePosition);
  vec3 q1 = dFdy(surfacePosition);
  vec2 st0 = dFdx(uv);
  vec2 st1 = dFdy(uv);
  vec3 q1perp = cross(q1, surfaceNormal);
  vec3 q0perp = cross(surfaceNormal, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float frameScale = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * frameScale, B * frameScale, surfaceNormal);
}

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

float distributionGGX(float NoH, float roughness) {
  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;
  float denom = NoH * NoH * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(3.14159265 * denom * denom, 0.00001);
}

float geometrySchlickGGX(float NoV, float roughness) {
  float r = roughness + 1.0;
  float k = r * r * 0.125;
  return NoV / (NoV * (1.0 - k) + k);
}

void main() {
  vec3 p = normalize(vObjectPosition);
  vec3 albedo = texture2D(uDayMap, vUv).rgb;
  float oceanMask = texture2D(uSpecularMap, vUv).r;
  float land = 1.0 - oceanMask;
  float roughness = mix(0.92, 0.18, oceanMask);

  vec3 geometricN = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 mapN = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  mapN.xy *= 1.5;
  mat3 tbn = getTangentFrame(vWorldPosition, geometricN, vUv);
  vec3 mappedN = normalize(tbn * normalize(mapN));

  float micro = fbm4(p * 84.0 + vec3(1.7, 8.2, -3.4));
  float bumpFade = smoothstep(0.08, 0.34, max(dot(geometricN, V), 0.0));
  float elevation = land * micro * 0.0035 * bumpFade;
  vec3 N = perturbNormal(vWorldPosition, mappedN, elevation);

  vec3 L = normalize(uSunDirection);
  float ndl = dot(geometricN, L);
  float daylight = smoothstep(-0.12, 0.25, ndl);
  float diffuse = max(dot(N, L), 0.0);
  float cloudDensity = texture2D(uCloudMap, vec2(vUv.x + uCloudOffset, vUv.y)).r;
  float cloudShadow = 1.0 - smoothstep(0.06, 0.76, cloudDensity) * 0.42;
  vec3 color = albedo * (0.004 + pow(diffuse, 0.78) * 1.18 * cloudShadow);

  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 0.001);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float D = distributionGGX(NoH, roughness);
  float G = geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
  vec3 F = vec3(0.02) + vec3(0.98) * pow(1.0 - VoH, 5.0);
  vec3 specular = (D * G * F) / max(4.0 * NoV * NoL, 0.001);
  specular *= NoL * oceanMask * daylight * cloudShadow;
  color += vec3(0.72, 0.84, 1.0) * specular * 0.85;

  float fresnel = pow(1.0 - max(dot(geometricN, V), 0.0), 4.0);
  color += vec3(0.015, 0.045, 0.09) * fresnel * daylight * 0.7;

  vec3 moonOffset = uMoonPosition - vWorldPosition;
  float moonAlong = dot(moonOffset, L);
  if (moonAlong > 0.0) {
    float moonPerp = sqrt(max(dot(moonOffset, moonOffset) - moonAlong * moonAlong, 0.0));
    float umbra = 1.0 - smoothstep(uMoonRadius * 0.5, uMoonRadius * 1.3, moonPerp);
    color *= 1.0 - umbra * 0.86;
  }

  vec3 nightSample = texture2D(uNightMap, vUv).rgb;
  float lightPeak = max(max(nightSample.r, nightSample.g), nightSample.b);
  float cityMask = smoothstep(0.018, 0.09, lightPeak);
  float night = 1.0 - smoothstep(-0.22, 0.08, ndl);
  color += nightSample * cityMask * night * 4.0;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const cloudFragment = /* glsl */ `
uniform sampler2D uCloudMap;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  float density = texture2D(uCloudMap, vUv).r;
  float coverage = smoothstep(0.06, 0.76, density);

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndl = dot(N, normalize(uSunDirection));
  float daylight = smoothstep(-0.25, 0.22, ndl);
  float diffuse = max(ndl, 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 color = mix(
    vec3(0.07, 0.09, 0.12),
    vec3(0.72, 0.78, 0.82),
    diffuse * 0.8 + 0.2
  );
  color += vec3(0.2, 0.35, 0.55) * rim * daylight * 0.25;
  float alpha = coverage * (0.015 + daylight * 0.66);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type PlanetProps = {
  reducedMotion: boolean
  timeScale: number
}

export function Planet({ reducedMotion, timeScale }: PlanetProps) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const cloudsRef = useRef<Mesh>(null)
  const moonRef = useRef<Mesh>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const { width, height } = useThree((state) => state.viewport)
  const compact = useThree((state) => state.size.width < 700) || width / height < 0.9
  const gl = useThree((state) => state.gl)
  const configureTextures = useCallback(
    (textures: MappedTextureType<typeof textureUrls>) => {
      const [day, night, normal, specular, clouds] = textures
      day.colorSpace = SRGBColorSpace
      night.colorSpace = SRGBColorSpace
      normal.colorSpace = NoColorSpace
      specular.colorSpace = NoColorSpace
      clouds.colorSpace = NoColorSpace

      const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      for (const texture of [day, night, normal, specular, clouds]) {
        texture.anisotropy = anisotropy
        texture.wrapS = RepeatWrapping
        texture.needsUpdate = true
      }
    },
    [gl],
  )
  const [dayMap, nightMap, normalMap, specularMap, cloudMap] = useTexture(
    textureUrls,
    configureTextures,
  )

  const sunDirection = useMemo(() => new Vector3(-1, 0, 0), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const moonWorld = useMemo(() => new Vector3(), [])
  const moonAngle = useRef(2.1)
  const surfaceUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uDayMap: { value: dayMap },
      uNightMap: { value: nightMap },
      uNormalMap: { value: normalMap },
      uSpecularMap: { value: specularMap },
      uCloudMap: { value: cloudMap },
      uCloudOffset: { value: 0 },
      uMoonPosition: { value: new Vector3() },
      uMoonRadius: { value: 0.34 },
    }),
    [sunDirection, dayMap, nightMap, normalMap, specularMap, cloudMap],
  )
  const cloudUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uCloudMap: { value: cloudMap },
    }),
    [sunDirection, cloudMap],
  )

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.getWorldPosition(worldPosition)
      sunDirection.copy(worldPosition).multiplyScalar(-1).normalize()
    }

    const surface = surfaceRef.current
    const clouds = cloudsRef.current

    if (!reducedMotion) {
      if (surface) surface.rotation.y += delta * 0.006 * timeScale
      if (clouds) clouds.rotation.y += delta * 0.009 * timeScale
    }

    if (surfaceMaterialRef.current && surface && clouds) {
      surfaceMaterialRef.current.uniforms.uCloudOffset.value =
        (surface.rotation.y - clouds.rotation.y) / (Math.PI * 2)
    }

    const moon = moonRef.current
    if (moon && surfaceMaterialRef.current) {
      if (!reducedMotion) moonAngle.current += delta * 0.35 * timeScale
      moon.position.set(
        Math.cos(moonAngle.current) * 3.6,
        0,
        Math.sin(moonAngle.current) * 3.6,
      )
      moon.rotation.y = moonAngle.current + 1.2
      moon.getWorldPosition(moonWorld)
      surfaceMaterialRef.current.uniforms.uMoonPosition.value.copy(moonWorld)
      surfaceMaterialRef.current.uniforms.uMoonRadius.value = 0.34 * (compact ? 0.76 : 1)
    }
  })

  return (
    <group
      ref={groupRef}
      scale={compact ? 0.76 : 1}
      rotation={[0.08, 0, -0.09]}
    >
      <mesh ref={surfaceRef} rotation={[0, -1.15, 0]}>
        <sphereGeometry args={[2, 160, 160]} />
        <shaderMaterial
          ref={surfaceMaterialRef}
          vertexShader={vertexShader}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh ref={cloudsRef} rotation={[0, -1.1, 0]} renderOrder={1}>
        <sphereGeometry args={[2.025, 128, 128]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={cloudFragment}
          uniforms={cloudUniforms}
          side={FrontSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      <group rotation={[0.24, 0, 0.09]}>
        <Moon ref={moonRef} />
      </group>

      <Atmosphere sunDirection={sunDirection} />
    </group>
  )
}
