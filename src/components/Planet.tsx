import { useCallback, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useTexture, type MappedTextureType } from '@react-three/drei'
import {
  AdditiveBlending,
  FrontSide,
  NoColorSpace,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  type Group,
  type Mesh,
  type ShaderMaterial,
} from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'
import { FLIGHT_BODY_RADII } from '../camera-math'
import { Atmosphere } from './Atmosphere'
import { Moon } from './Moon'
import { lightningStrikes, LIGHTNING_CELLS, type LightningStrike } from '../lightning'
import { cycloneCenter, cycloneIntensity } from '../cyclone'
import { flareLight } from '../flare'
import { aureliaFrame, aureliaClock, aureliaSpinPhase, moonOrbitLocalQuaternion, moonPhaseAngle, starFlux } from '../orbits'
import { useSunDirection } from '../hooks/useSunDirection'
import { t, type Locale } from '../strings'

const textureUrls = [
  '/textures/earth-day.webp',
  '/textures/earth-night.webp',
  '/textures/earth-normal.webp',
  '/textures/earth-specular.webp',
  '/textures/earth-clouds.webp',
]

const surfaceFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;
uniform sampler2D uCloudMap;
uniform float uCloudOffset;
uniform vec3 uSunDirection;
uniform vec3 uMoonPosition;
uniform float uMoonRadius;
uniform float uSunRadius;
uniform vec3 uPlanetCenter;
uniform float uDeckRadius;
uniform float uDeckSpin;
uniform float uStarFlux;
uniform float uTime;
uniform float uCyclone;
uniform vec2 uCycloneCenter;
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
#include <logdepthbuf_fragment>
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
  float elevation = land * micro * 0.002 * bumpFade;
  vec3 N = perturbNormal(vObjectPosition, mappedN, elevation);

  vec3 L = normalize(uSunDirection);
  float ndl = dot(geometricN, L);
  float daylight = smoothstep(-0.12, 0.25, ndl);
  float diffuse = max(dot(N, L), 0.0);
  // Projected cloud shadow, honest rays: Solis sits at the world origin, so
  // the ray toward the sun from this point crosses the deck 1.25% of the
  // radius above the surface — straight overhead only at the sub-solar
  // point, stretched far along the slant near the terminator. The hit's map
  // UV is read in the deck's own spinning frame.
  vec3 centerToFragment = vWorldPosition - uPlanetCenter;
  vec3 rayDir = normalize(-vWorldPosition);
  float b = dot(centerToFragment, rayDir);
  float tHit = -b + sqrt(max(b * b + uDeckRadius * uDeckRadius - dot(centerToFragment, centerToFragment), 0.0));
  vec3 hitLocal = centerToFragment + rayDir * tHit;
  float cD = cos(uDeckSpin);
  float sD = sin(uDeckSpin);
  vec3 hitDeck = vec3(cD * hitLocal.x - sD * hitLocal.z, hitLocal.y, sD * hitLocal.x + cD * hitLocal.z);
  float hitU = fract(atan(hitDeck.z, -hitDeck.x) / 6.28318530718);
  float hitV = acos(clamp(hitDeck.y / uDeckRadius, -1.0, 1.0)) / 3.14159265359;
  float cloudDensity = texture2D(uCloudMap, vec2(hitU, hitV)).r;
  float cloudShadow = 1.0 - smoothstep(0.06, 0.76, cloudDensity) * 0.42;
  // The cyclone shades the water itself: the same vortex, read in the map
  // frame the projected shadow now uses — the shade rides the decks'
  // rotation drift and sits under the spiral the cloud layer draws.
  vec2 cycloneDelta = vec2(hitU - uCycloneCenter.x, hitV - uCycloneCenter.y);
  float cycloneDu = abs(cycloneDelta.x);
  cycloneDu = min(cycloneDu, 1.0 - cycloneDu);
  float cycloneDistance = length(vec2(cycloneDu * 2.0, cycloneDelta.y)) * 9.0;
  float shade = cloudShadow * (1.0 - uCyclone * exp(-cycloneDistance * cycloneDistance * 0.5) * 0.5);
  vec3 color = albedo * (0.004 + pow(diffuse, 0.78) * 1.18 * shade * uStarFlux);

  // Sun glint on the water: a drifting field of micro-slopes perturbs the
  // ocean normal inside the specular lobe only, so the mirror spot shimmers.
  // At grazing angles the wave slopes spread the reflection the way a real
  // sea does — the compact spot opens into a glittering path along the sun
  // side of the disc. The clock is the shared simulation time — pause and
  // reversal replay the same sea.
  vec3 glintN = N;
  float glintRoughness = roughness;
  if (oceanMask > 0.001) {
    float grazing = pow(1.0 - max(dot(geometricN, V), 0.0), 2.0);
    float wx = fbm3(p * 130.0 + vec3(uTime * 0.4));
    float wy = fbm3(p * 130.0 - vec3(uTime * 0.4) + vec3(4.7, 1.3, 8.1));
    glintN = normalize(N + (tbn[0] * wx + tbn[1] * wy) * (0.055 + grazing * 0.05));
    glintRoughness = clamp(roughness + grazing * 0.55 + (wx * 0.5 + 0.5) * 0.2, 0.06, 0.9);
  }

  vec3 H = normalize(L + V);
  float NoV = max(dot(glintN, V), 0.001);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(glintN, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float D = distributionGGX(NoH, glintRoughness);
  float G = geometrySchlickGGX(NoV, glintRoughness) * geometrySchlickGGX(NoL, glintRoughness);
  vec3 F = vec3(0.02) + vec3(0.98) * pow(1.0 - VoH, 5.0);
  vec3 specular = (D * G * F) / max(4.0 * NoV * NoL, 0.001);
  specular *= NoL * oceanMask * daylight * shade * uStarFlux;
  color += vec3(1.0, 0.96, 0.86) * specular * 1.5;

  float fresnel = pow(1.0 - max(dot(geometricN, V), 0.0), 4.0);
  color += vec3(0.015, 0.045, 0.09) * fresnel * daylight * 0.7 * uStarFlux;

  // The moon's shadow is honest cone geometry: Solis outgrows Nox, so the
  // umbra closes at an apex behind the moon and the annular antumbra
  // diverges past it — a soft ring with a warm refracted rim, never a hard
  // disc. The axis runs sun→moon→out (Solis sits at the world origin): at
  // this compact scale the moon's parallax bends it far off the sun
  // direction the planet sees.
  vec3 toMoonFragment = vWorldPosition - uMoonPosition;
  vec3 shadowAxis = normalize(uMoonPosition);
  float shadowAlong = dot(toMoonFragment, shadowAxis);
  if (shadowAlong > 0.0) {
    float shadowPerp = sqrt(max(dot(toMoonFragment, toMoonFragment) - shadowAlong * shadowAlong, 0.0));
    float sunMoon = length(uMoonPosition);
    float apex = uMoonRadius * sunMoon / (uSunRadius - uMoonRadius);
    float coneInner = uMoonRadius * abs(1.0 - shadowAlong / apex);
    float coneOuter = uMoonRadius + (uSunRadius + uMoonRadius) * shadowAlong / sunMoon;
    float penumbra = 1.0 - smoothstep(coneInner, coneOuter, shadowPerp);
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

const cloudFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uCloudMap;
uniform vec3 uSunDirection;
uniform vec3 uMoonPosition;
uniform float uMoonRadius;
uniform float uSunRadius;
uniform float uStarFlux;
uniform vec4 uStrikes[3];
uniform float uCyclone;
uniform vec2 uCycloneCenter;
uniform float uCycloneSpin;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
#include <logdepthbuf_fragment>
  float density = texture2D(uCloudMap, vUv).r;

  // The cyclone: a spiral wound into the deck around its own eye, pinned to
  // the cloud map's UV frame like the lightning cells, so it rides the air
  // mass the deck rotation carries. The seam wraps like a strike's patch;
  // the u axis doubles to keep the vortex round on the sphere (360 degrees
  // of longitude per u turn against 180 of latitude per v turn).
  vec2 eyeDelta = vUv - uCycloneCenter;
  float eyeDu = abs(eyeDelta.x);
  eyeDu = min(eyeDu, 1.0 - eyeDu);
  float eyeDistance = length(vec2(eyeDu * 2.0, eyeDelta.y)) * 9.0;
  float eyeClear = smoothstep(0.0, 0.16, eyeDistance);
  float spiral = sin(atan(eyeDelta.y, eyeDelta.x) * 3.0 + eyeDistance * 4.2 - uCycloneSpin) * 0.5 + 0.5;
  float vortex = uCyclone * eyeClear * exp(-eyeDistance * eyeDistance * 0.35) * (0.45 + 0.55 * spiral);
  density = clamp(density + vortex * 0.85, 0.0, 1.0);

  float coverage = smoothstep(0.06, 0.76, density);

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  float ndl = dot(N, L);
  float daylight = smoothstep(-0.25, 0.22, ndl);
  float diffuse = max(ndl, 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  // Same cone as the surface shader: the shadow axis runs sun→moon→out and
  // the shade spans the annular ring out to the penumbra edge.
  vec3 toMoonFragment = vWorldPosition - uMoonPosition;
  vec3 shadowAxisCloud = normalize(uMoonPosition);
  float shadowAlongCloud = dot(toMoonFragment, shadowAxisCloud);
  float moonShadow = 1.0;
  if (shadowAlongCloud > 0.0) {
    float shadowPerpCloud = sqrt(max(dot(toMoonFragment, toMoonFragment) - shadowAlongCloud * shadowAlongCloud, 0.0));
    float sunMoon = length(uMoonPosition);
    float apex = uMoonRadius * sunMoon / (uSunRadius - uMoonRadius);
    float coneInner = uMoonRadius * abs(1.0 - shadowAlongCloud / apex);
    float coneOuter = uMoonRadius + (uSunRadius + uMoonRadius) * shadowAlongCloud / sunMoon;
    moonShadow = 1.0 - (1.0 - smoothstep(coneInner, coneOuter, shadowPerpCloud)) * 0.68;
  }

  vec3 color = mix(
    vec3(0.07, 0.09, 0.12),
    vec3(0.72, 0.78, 0.82),
    diffuse * 0.8 * uStarFlux + 0.2
  );
  color += vec3(0.2, 0.35, 0.55) * rim * daylight * 0.25 * uStarFlux;
  color *= moonShadow;
  // Tall storm tops catch the sun: the spiral reads a touch brighter and
  // harder-edged than the surrounding deck.
  color = mix(color, vec3(0.88, 0.92, 0.97), vortex * daylight * 0.4);

  // Night-side lightning: each strike lights its own patch of the deck from
  // within, only where clouds are dense and the sun is down. The schedule
  // comes from the shared clock (lightning.ts); the shader just draws it.
  float night = 1.0 - daylight;
  float glowSum = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 strike = uStrikes[i];
    if (strike.z <= 0.0) continue;
    float du = abs(vUv.x - strike.x);
    du = min(du, 1.0 - du);
    float dv = vUv.y - strike.y;
    float glow = exp(-(du * du * 1.8 + dv * dv) * 130.0) * strike.z * coverage * night;
    color += vec3(0.82, 0.88, 1.0) * glow * 1.5;
    glowSum += glow;
  }

  float alpha = coverage * (0.015 + daylight * 0.66) * mix(1.0, moonShadow, 0.35);
  alpha = min(alpha + glowSum * 0.45 + vortex * daylight * 0.5, 1.0);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const auroraVertex = /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
void main() {
  vObjectPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
#include <logdepthbuf_vertex>
}
`

const auroraFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uSunDirection;
uniform float uTime;
uniform float uStarFlux;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

void main() {
#include <logdepthbuf_fragment>
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

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type PlanetProps = {
  reducedMotion: boolean
  showMoonLabel?: boolean
  locale: Locale
  /** Shared simulation clock, advanced by SpaceScene once per frame. */
  timeRef: { current: number }
  /** Receives the moon's world position every frame, for the camera rig. */
  moonWorldRef?: { current: Vector3 }
}

export function Planet({ reducedMotion, showMoonLabel, locale, timeRef, moonWorldRef }: PlanetProps) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const cloudsRef = useRef<Mesh>(null)
  const moonRef = useRef<Mesh>(null)
  const moonOrbitRef = useRef<Group>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const cloudMaterialRef = useRef<ShaderMaterial>(null)
  const moonMaterialRef = useRef<ShaderMaterial>(null)
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
  const moonOrbitScratch = useMemo(() => new Quaternion(), [])
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
      uMoonRadius: { value: aureliaFrame.moonRadius },
      uSunRadius: { value: FLIGHT_BODY_RADII.star },
      uPlanetCenter: { value: worldPosition },
      uDeckRadius: { value: aureliaFrame.planetRadius * 1.0125 },
      uDeckSpin: { value: 0 },
      uStarFlux: { value: 1 },
      uTime: { value: 0 },
      uCyclone: { value: 0 },
      uCycloneCenter: { value: new Vector2(0.5, 0.5) },
    }),
    [sunDirection, dayMap, nightMap, normalMap, specularMap, cloudMap],
  )
  const cloudUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uCloudMap: { value: cloudMap },
      uMoonPosition: { value: new Vector3() },
      uMoonRadius: { value: aureliaFrame.moonRadius },
      uSunRadius: { value: FLIGHT_BODY_RADII.star },
      uStarFlux: { value: 1 },
      uStrikes: { value: Array.from({ length: LIGHTNING_CELLS }, () => new Vector4()) },
      uCyclone: { value: 0 },
      uCycloneCenter: { value: new Vector2(0.5, 0.5) },
      uCycloneSpin: { value: 0 },
    }),
    [sunDirection, cloudMap],
  )
  const strikeSlots = useMemo<(LightningStrike | null)[]>(
    () => new Array(LIGHTNING_CELLS).fill(null),
    [],
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

  useFrame(() => {
    updateSunDirection()
    const flux = starFlux(worldPosition) * flareLight(timeRef.current)
    // The moon's orbit plane regresses (the honest nodal precession): the
    // group rides the same quaternion eclipse.ts mirrors, so pause,
    // reversal and deep links replay the same sky.
    if (moonOrbitRef.current) {
      moonOrbitLocalQuaternion(timeRef.current, moonOrbitScratch)
      moonOrbitRef.current.quaternion.copy(moonOrbitScratch)
    }

    const surface = surfaceRef.current
    const clouds = cloudsRef.current

    // Ground and gale ride the shared clock as pure phases: a deep link
    // lands on the same continents a live session would have spun around,
    // and pause/reversal come from the one clock. Under reduced motion the
    // surface holds still instead of accumulating.
    if (!reducedMotion) {
      if (surface) surface.rotation.y = aureliaSpinPhase(timeRef.current)
      if (clouds) clouds.rotation.y = aureliaSpinPhase(timeRef.current) * 1.5
    }

    const planetRadius = aureliaFrame.planetRadius
    // The cyclone rides the shared clock like the lightning: pause and
    // reversal replay the same weather, deep links land on the same spiral.
    const cyclone = cycloneIntensity(timeRef.current)
    const cycloneEye = cycloneCenter(timeRef.current)
    if (surfaceMaterialRef.current) {
      surfaceMaterialRef.current.uniforms.uCloudOffset.value =
        surface && clouds ? (surface.rotation.y - clouds.rotation.y) / (Math.PI * 2) : 0
      // The projected cloud shadow reads the deck's live spin.
      if (clouds) surfaceMaterialRef.current.uniforms.uDeckSpin.value = clouds.rotation.y
      surfaceMaterialRef.current.uniforms.uStarFlux.value = flux
      // Waves ride the shared clock: a deep-linked t= lands on the same sea.
      surfaceMaterialRef.current.uniforms.uTime.value = timeRef.current
      surfaceMaterialRef.current.uniforms.uCyclone.value = cyclone
      ;(surfaceMaterialRef.current.uniforms.uCycloneCenter.value as Vector2).set(cycloneEye.u, cycloneEye.v)
    }
    if (cloudMaterialRef.current) {
      cloudMaterialRef.current.uniforms.uStarFlux.value = flux
      // The strike schedule rides the shared clock, so pause and reversal
      // replay the same storm; the flash rides the cloud map's own frame.
      const strikes = lightningStrikes(timeRef.current, strikeSlots)
      const strikeUniforms = cloudMaterialRef.current.uniforms.uStrikes.value as Vector4[]
      for (let i = 0; i < LIGHTNING_CELLS; i++) {
        const strike = strikes[i]
        strikeUniforms[i].set(
          strike ? strike.u : 0,
          strike ? strike.v : 0,
          strike ? strike.strength : 0,
          0,
        )
      }
      const cloudCyclone = cloudMaterialRef.current.uniforms
      cloudCyclone.uCyclone.value = cyclone
      ;(cloudCyclone.uCycloneCenter.value as Vector2).set(cycloneEye.u, cycloneEye.v)
      cloudCyclone.uCycloneSpin.value = timeRef.current * 0.85
    }
    if (auroraMaterialRef.current) {
      // The curtains wave on the shared clock; reduced motion holds them in
      // their resting shape instead of accumulating a private phase.
      auroraMaterialRef.current.uniforms.uTime.value = reducedMotion ? 0 : timeRef.current
      auroraMaterialRef.current.uniforms.uStarFlux.value = flux
    }

    const moon = moonRef.current
    if (moon) {
      // The moon rides the shared simulation clock: pause, reverse and time
      // speed come from one place instead of a private accumulator.
      const moonAngle = moonPhaseAngle(timeRef.current)
      moon.position.set(
        Math.cos(moonAngle) * aureliaClock.moonOrbitRadius,
        0,
        Math.sin(moonAngle) * aureliaClock.moonOrbitRadius,
      )
      moon.rotation.y = moonAngle + 1.2
      moon.getWorldPosition(moonWorld)
      moonWorldRef?.current.copy(moonWorld)

      const moonWorldRadius = aureliaFrame.moonRadius
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
        moonMaterialRef.current.uniforms.uSunRadius.value = FLIGHT_BODY_RADII.star
        moonMaterialRef.current.uniforms.uStarFlux.value = starFlux(moonWorld) * flareLight(timeRef.current)
      }
    }
  })

  return (
    <group ref={groupRef} rotation={aureliaFrame.worldRotation}>
      <mesh ref={surfaceRef} rotation={[0, -1.15, 0]}>
        <sphereGeometry args={[aureliaFrame.planetRadius, 160, 160]} />
        <shaderMaterial
          ref={surfaceMaterialRef}
          vertexShader={bodyVertexGLSL(true)}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh ref={cloudsRef} rotation={[0, -1.1, 0]} renderOrder={1}>
        <sphereGeometry args={[aureliaFrame.planetRadius * 1.0125, 128, 128]} />
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
        <sphereGeometry args={[aureliaFrame.planetRadius * 1.02, 96, 96]} />
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

      <group ref={moonOrbitRef}>
        <Moon ref={moonRef} materialRef={moonMaterialRef}>
          {showMoonLabel && (
            <Html center position={[0, 0.5, 0]} zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
              <span className="moon-label" aria-hidden="true">{t(locale, 'moon')}</span>
            </Html>
          )}
        </Moon>
      </group>

      <Atmosphere sunDirection={sunDirection} />
    </group>
  )
}
