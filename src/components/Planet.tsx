import { useCallback, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useTexture, type MappedTextureType } from '@react-three/drei'
import {
  AdditiveBlending,
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
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'
import { Atmosphere } from './Atmosphere'
import { Moon, MOON_RADIUS } from './Moon'
import { aureliaClock, starFlux } from '../orbits'
import { useSunDirection } from '../hooks/useSunDirection'
import { t, type Locale } from '../strings'

const textureUrls = [
  '/textures/earth-day.webp',
  '/textures/earth-night.webp',
  '/textures/earth-normal.webp',
  '/textures/earth-specular.webp',
  '/textures/earth-clouds.webp',
]

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
uniform float uStarFlux;
varying vec2 vUv;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}
${perturbNormalGLSL}

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
  vec3 color = albedo * (0.004 + pow(diffuse, 0.78) * 1.18 * cloudShadow * uStarFlux);

  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 0.001);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float D = distributionGGX(NoH, roughness);
  float G = geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
  vec3 F = vec3(0.02) + vec3(0.98) * pow(1.0 - VoH, 5.0);
  vec3 specular = (D * G * F) / max(4.0 * NoV * NoL, 0.001);
  specular *= NoL * oceanMask * daylight * cloudShadow * uStarFlux;
  color += vec3(0.72, 0.84, 1.0) * specular * 0.85;

  float fresnel = pow(1.0 - max(dot(geometricN, V), 0.0), 4.0);
  color += vec3(0.015, 0.045, 0.09) * fresnel * daylight * 0.7 * uStarFlux;

  vec3 moonOffset = uMoonPosition - vWorldPosition;
  float moonAlong = dot(moonOffset, L);
  if (moonAlong > 0.0) {
    float moonPerp = sqrt(max(dot(moonOffset, moonOffset) - moonAlong * moonAlong, 0.0));
    // The moon is angularly smaller than Solis from the surface, so its shadow
    // is a wide soft penumbra (annular eclipse) with a warm refracted rim,
    // not a hard umbra disc.
    float penumbra = 1.0 - smoothstep(uMoonRadius * 1.2, uMoonRadius * 3.3, moonPerp);
    color *= 1.0 - penumbra * 0.68;
    color *= mix(vec3(1.0), vec3(1.35, 0.78, 0.6), penumbra);
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
uniform vec3 uMoonPosition;
uniform float uMoonRadius;
uniform float uStarFlux;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  float density = texture2D(uCloudMap, vUv).r;
  float coverage = smoothstep(0.06, 0.76, density);

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  float ndl = dot(N, L);
  float daylight = smoothstep(-0.25, 0.22, ndl);
  float diffuse = max(ndl, 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 moonOffset = uMoonPosition - vWorldPosition;
  float moonAlong = dot(moonOffset, L);
  float moonShadow = 1.0;
  if (moonAlong > 0.0) {
    float moonPerp = sqrt(max(dot(moonOffset, moonOffset) - moonAlong * moonAlong, 0.0));
    moonShadow = 1.0 - (1.0 - smoothstep(uMoonRadius * 1.2, uMoonRadius * 3.3, moonPerp)) * 0.68;
  }

  vec3 color = mix(
    vec3(0.07, 0.09, 0.12),
    vec3(0.72, 0.78, 0.82),
    diffuse * 0.8 * uStarFlux + 0.2
  );
  color += vec3(0.2, 0.35, 0.55) * rim * daylight * 0.25 * uStarFlux;
  color *= moonShadow;
  float alpha = coverage * (0.015 + daylight * 0.66) * mix(1.0, moonShadow, 0.35);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const auroraVertex = /* glsl */ `
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
void main() {
  vObjectPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const auroraFragment = /* glsl */ `
uniform vec3 uSunDirection;
uniform float uTime;
uniform float uStarFlux;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

void main() {
  vec3 p = normalize(vObjectPosition);
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDirection);

  // Auroras wash out in daylight. The mask tracks local daylight, not the
  // disk's night half: at the poles the sun grazes the horizon and the ovals
  // still show through the twilight.
  float night = 1.0 - smoothstep(-0.05, 0.3, dot(N, L));

  // The magnetic oval wraps each pole around +-72 deg latitude with a wavy
  // edge; curtains shimmer along it on their own clock.
  float oval = exp(-pow((abs(p.y) - 0.92) * 9.0, 2.0));
  float angle = atan(p.z, p.x);
  float curtain = fbm3(vec3(cos(angle) * 2.6, sin(angle) * 2.6, uTime * 0.3)) * 0.5 + 0.5;
  float streaks = smoothstep(0.3, 0.85, curtain);

  float energy = night * oval * (0.3 + 0.7 * streaks) * uStarFlux;
  vec3 color = mix(vec3(0.25, 1.0, 0.55), vec3(0.5, 0.3, 1.0), streaks * 0.8);
  float alpha = energy * 0.55;

  gl_FragColor = vec4(color * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type PlanetProps = {
  reducedMotion: boolean
  timeScale: number
  showMoonLabel?: boolean
  locale: Locale
}

export function Planet({ reducedMotion, timeScale, showMoonLabel, locale }: PlanetProps) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const cloudsRef = useRef<Mesh>(null)
  const moonRef = useRef<Mesh>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const cloudMaterialRef = useRef<ShaderMaterial>(null)
  const moonMaterialRef = useRef<ShaderMaterial>(null)
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

  const { sunDirection, worldPosition, updateSunDirection } = useSunDirection(groupRef)
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
      uStarFlux: { value: 1 },
    }),
    [sunDirection, dayMap, nightMap, normalMap, specularMap, cloudMap],
  )
  const cloudUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uCloudMap: { value: cloudMap },
      uMoonPosition: { value: new Vector3() },
      uMoonRadius: { value: MOON_RADIUS },
      uStarFlux: { value: 1 },
    }),
    [sunDirection, cloudMap],
  )
  const auroraMaterialRef = useRef<ShaderMaterial>(null)
  const auroraUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uTime: { value: 0 },
      uStarFlux: { value: 1 },
    }),
    [sunDirection],
  )
  const auroraTime = useRef(0)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    updateSunDirection()
    const flux = starFlux(worldPosition)

    const surface = surfaceRef.current
    const clouds = cloudsRef.current

    if (!reducedMotion) {
      if (surface) surface.rotation.y += delta * aureliaClock.spin * timeScale
      if (clouds) clouds.rotation.y += delta * aureliaClock.spin * 1.5 * timeScale
    }

    const planetRadius = 2 * (compact ? 0.76 : 1)
    if (surfaceMaterialRef.current) {
      surfaceMaterialRef.current.uniforms.uCloudOffset.value =
        surface && clouds ? (surface.rotation.y - clouds.rotation.y) / (Math.PI * 2) : 0
      surfaceMaterialRef.current.uniforms.uStarFlux.value = flux
    }
    if (cloudMaterialRef.current) {
      cloudMaterialRef.current.uniforms.uStarFlux.value = flux
    }
    if (!reducedMotion) auroraTime.current += delta * timeScale
    if (auroraMaterialRef.current) {
      auroraMaterialRef.current.uniforms.uTime.value = auroraTime.current
      auroraMaterialRef.current.uniforms.uStarFlux.value = flux
    }

    const moon = moonRef.current
    if (moon) {
      if (!reducedMotion) moonAngle.current += delta * aureliaClock.moonAngularSpeed * timeScale
      moon.position.set(
        Math.cos(moonAngle.current) * aureliaClock.moonOrbitRadius,
        0,
        Math.sin(moonAngle.current) * aureliaClock.moonOrbitRadius,
      )
      moon.rotation.y = moonAngle.current + 1.2
      moon.getWorldPosition(moonWorld)

      const moonWorldRadius = MOON_RADIUS * (compact ? 0.76 : 1)
      if (surfaceMaterialRef.current) {
        surfaceMaterialRef.current.uniforms.uMoonPosition.value.copy(moonWorld)
        surfaceMaterialRef.current.uniforms.uMoonRadius.value = moonWorldRadius
      }
      if (cloudMaterialRef.current) {
        cloudMaterialRef.current.uniforms.uMoonPosition.value.copy(moonWorld)
        cloudMaterialRef.current.uniforms.uMoonRadius.value = moonWorldRadius
      }
      if (moonMaterialRef.current) {
        moonMaterialRef.current.uniforms.uPlanetPosition.value.copy(worldPosition)
        moonMaterialRef.current.uniforms.uPlanetRadius.value = planetRadius
        moonMaterialRef.current.uniforms.uStarFlux.value = starFlux(moonWorld)
      }
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
          vertexShader={bodyVertexGLSL(true)}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh ref={cloudsRef} rotation={[0, -1.1, 0]} renderOrder={1}>
        <sphereGeometry args={[2.025, 128, 128]} />
        <shaderMaterial
          ref={cloudMaterialRef}
          vertexShader={bodyVertexGLSL(true)}
          fragmentShader={cloudFragment}
          uniforms={cloudUniforms}
          side={FrontSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      <mesh renderOrder={2} raycast={() => null}>
        <sphereGeometry args={[2.04, 96, 96]} />
        <shaderMaterial
          ref={auroraMaterialRef}
          vertexShader={auroraVertex}
          fragmentShader={auroraFragment}
          uniforms={auroraUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <group rotation={[0.24, 0, 0.09]}>
        <Moon ref={moonRef} materialRef={moonMaterialRef}>
          {showMoonLabel && (
            <Html center position={[0, 2.4, 0]} zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
              <span className="moon-label" aria-hidden="true">{t(locale, 'moon')}</span>
            </Html>
          )}
        </Moon>
      </group>

      <Atmosphere sunDirection={sunDirection} />
    </group>
  )
}
