import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, Quaternion, Vector3, type Group, type Mesh, type ShaderMaterial } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'
import { Atmosphere } from './Atmosphere'
import { RingRocks } from './RingRocks'
import { BODY_RADII, shepherdLocalPosition, starFlux, vesperSpinPhase, VESPER_RING_INNER, VESPER_RING_OUTER } from '../orbits'
import { RING_INNER, RING_OUTER } from '../ring-rocks'
import { plumeStrength, plumeVentLocal, PLUME_VENTS, SHEPHERD_RADIUS } from '../plumes'
import { flareLight } from '../flare'
import { useSunDirection } from '../hooks/useSunDirection'

/**
 * Ring density as a function of the normalized radius t = (r − inner)/span
 * of the honest ring span, shared by the ring shader and the planet's
 * ring-shadow term so the shadow carries the same bands and Cassini gap the
 * rings themselves show. The band pattern is exposed separately: the ring
 * color grades by it directly.
 */
const RING_CONSTANTS_GLSL = /* glsl */ `
const float RING_INNER = ${VESPER_RING_INNER.toFixed(6)};
const float RING_SPAN = ${(VESPER_RING_OUTER - VESPER_RING_INNER).toFixed(6)};
const float PLANET_R = ${BODY_RADII.vesper.toFixed(6)};
`
const ringDensityGLSL = /* glsl */ `
float vesperRingBand(float t) {
  return smoothstep(0.25, 0.75, fbm4(vec3(t * 70.0, 3.0, 9.0)) * 0.5 + 0.5);
}
float vesperRingDensity(float t) {
  float stripes = 0.035 * sin(t * 420.0);
  float cassini = smoothstep(0.60, 0.64, t) * (1.0 - smoothstep(0.70, 0.74, t));
  return (0.35 + 0.65 * vesperRingBand(t) + stripes) * (1.0 - 0.85 * cassini);
}
float vesperRingEdge(float t) {
  return smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));
}
`

const surfaceFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uSunDirection;
uniform float uStarFlux;
uniform vec3 uRingNormal;
uniform vec3 uRingCenter;
uniform float uGroupScale;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}
${perturbNormalGLSL}
${RING_CONSTANTS_GLSL}
${ringDensityGLSL}

void main() {
#include <logdepthbuf_fragment>
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
  float elevation = micro * 0.0012 * bumpFade;
  vec3 N = perturbNormal(vObjectPosition, geometricN, elevation);

  vec3 L = normalize(uSunDirection);
  float diffuse = max(dot(N, L), 0.0);

  // Ring shadow: where the sun ray from this point crosses the ring plane
  // inside the annulus, the rings dim the light by their own density - the
  // Cassini gap lets a bright line through the shadow band.
  float planeDot = dot(L, uRingNormal);
  float crossingT = -dot(vWorldPosition - uRingCenter, uRingNormal) / planeDot;
  float crosses = step(1e-4, abs(planeDot)) * step(0.0, crossingT);
  vec3 crossing = vWorldPosition + L * crossingT;
  float ringRadius = length(crossing - uRingCenter) / uGroupScale;
  float ringT = (ringRadius - RING_INNER) / RING_SPAN;
  float shadow = 1.0 - crosses * vesperRingEdge(ringT) * vesperRingDensity(ringT) * 0.75;

  vec3 color = albedo * (0.006 + diffuse * shadow * 1.1 * uStarFlux);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const ringVertexShader = /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>

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
#include <logdepthbuf_vertex>
}
`

const shepherdFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uSunDirection;
uniform float uStarFlux;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

void main() {
#include <logdepthbuf_fragment>
  // A small iced world: marble bands from the same noise family as the
  // rings it herds, lit from the star with the same flux falloff.
  float marble = fbm4(normalize(vObjectPosition) * 6.0);
  vec3 albedo = mix(vec3(0.70, 0.72, 0.76), vec3(0.90, 0.88, 0.82), smoothstep(0.3, 0.7, marble));
  float diffuse = max(dot(normalize(vWorldNormal), normalize(uSunDirection)), 0.0);
  vec3 color = albedo * (0.012 + diffuse * uStarFlux);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const ringFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uSunDirection;
uniform float uStarFlux;
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vCenter;
varying float vScale;
${noiseGLSL}
${RING_CONSTANTS_GLSL}
${ringDensityGLSL}

void main() {
#include <logdepthbuf_fragment>
  float radius = length(vLocalPosition.xy);
  float t = (radius - RING_INNER) / RING_SPAN;
  float band = vesperRingBand(t);
  float density = vesperRingDensity(t);
  float edge = vesperRingEdge(t);

  vec3 L = normalize(uSunDirection);
  float light = abs(dot(normalize(vWorldNormal), L)) * 0.75 * uStarFlux + 0.25;

  vec3 d = vWorldPosition - vCenter;
  float along = dot(d, L);
  float perp = length(d - L * along);
  float shadow = along < 0.0
    ? smoothstep(PLANET_R * vScale * 0.97, PLANET_R * vScale * 1.03, perp)
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
  timeRef: { current: number }
}

/**
 * One cryo-plume on the shepherd: a thin additive cone anchored at its
 * vent, growing out along the surface normal as the vent's turn comes.
 * The shepherd never rotates, so the vent's spot and direction are fixed
 * in the mesh's frame and the clock only breathes the scale and the
 * opacity.
 */
function ShepherdPlume({ vent, timeRef }: {
  vent: number
  timeRef: { current: number }
}) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () => new MeshBasicMaterial({
      color: new Color(0.72, 0.84, 1.0),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
    [],
  )
  const { base, normal, orientation } = useMemo(() => {
    const local = plumeVentLocal(vent, new Vector3())
    const normal = local.clone().normalize()
    return {
      base: local,
      normal,
      orientation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
    }
  }, [vent])
  const PLUME_HEIGHT = 0.18

  useFrame(() => {
    if (!ref.current) return
    const strength = plumeStrength(vent, timeRef.current)
    // The cone is centered on its own height: anchoring the base to the
    // surface means the position rides half the height outward as the
    // plume grows.
    ref.current.scale.set(0.55 + strength * 0.7, Math.max(strength, 0.001), 0.55 + strength * 0.7)
    ref.current.position.copy(base).addScaledVector(normal, (PLUME_HEIGHT / 2) * Math.max(strength, 0.001))
    material.opacity = strength * 0.8
  })

  return (
    <mesh
      ref={ref}
      position={base}
      quaternion={orientation}
      raycast={() => null}
      renderOrder={3}
    >
      <coneGeometry args={[0.02, PLUME_HEIGHT, 10, 1, true]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

export function Vesper({ reducedMotion, timeRef }: VesperProps) {
  const groupRef = useRef<Group>(null)
  const surfaceRef = useRef<Mesh>(null)
  const shepherdRef = useRef<Mesh>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const ringMaterialRef = useRef<ShaderMaterial>(null)
  const shepherdMaterialRef = useRef<ShaderMaterial>(null)

  const { sunDirection, worldPosition, updateSunDirection } = useSunDirection(groupRef)
  const surfaceUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uStarFlux: { value: 1 },
      uRingNormal: { value: new Vector3(0, 1, 0) },
      uRingCenter: { value: worldPosition },
      uGroupScale: { value: 1.08 },
    }),
    [sunDirection, worldPosition],
  )
  const ringUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uStarFlux: { value: 1 },
    }),
    [sunDirection],
  )
  const shepherdUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uStarFlux: { value: 1 },
    }),
    [sunDirection],
  )
  const shepherdScratch = useMemo(() => new Vector3(), [])

  useFrame(() => {
    updateSunDirection()
    const flux = starFlux(worldPosition) * flareLight(timeRef.current)
    if (surfaceMaterialRef.current) surfaceMaterialRef.current.uniforms.uStarFlux.value = flux
    if (ringMaterialRef.current) ringMaterialRef.current.uniforms.uStarFlux.value = flux
    if (shepherdMaterialRef.current) shepherdMaterialRef.current.uniforms.uStarFlux.value = flux
    if (shepherdRef.current) {
      shepherdRef.current.position.copy(shepherdLocalPosition(timeRef.current, shepherdScratch))
    }
    if (groupRef.current && surfaceMaterialRef.current) {
      // The ring plane's world axis and scale feed the planet's shadow term.
      surfaceMaterialRef.current.uniforms.uRingNormal.value
        .setFromMatrixColumn(groupRef.current.matrixWorld, 1)
        .normalize()
      surfaceMaterialRef.current.uniforms.uGroupScale.value
        = groupRef.current.matrixWorld.getMaxScaleOnAxis()
    }

    if (!reducedMotion && surfaceRef.current) {
      surfaceRef.current.rotation.y = vesperSpinPhase(timeRef.current)
    }
  })

  return (
    <group
      ref={groupRef}
      rotation={[0.42, 0, -0.16]}
    >
      <mesh ref={surfaceRef}>
        <sphereGeometry args={[BODY_RADII.vesper, 128, 128]} />
        <shaderMaterial
          ref={surfaceMaterialRef}
          vertexShader={bodyVertexGLSL(false)}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} renderOrder={1}>
        <ringGeometry args={[RING_INNER, RING_OUTER, 180, 1]} />
        <shaderMaterial
          ref={ringMaterialRef}
          vertexShader={ringVertexShader}
          fragmentShader={ringFragment}
          uniforms={ringUniforms}
          side={DoubleSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* The shepherd: a small iced moon keeping the Cassini gap swept,
        * riding the ring plane on the shared clock. */}
      <mesh ref={shepherdRef}>
        <sphereGeometry args={[SHEPHERD_RADIUS, 32, 24]} />
        {Array.from({ length: PLUME_VENTS }, (_, vent) => (
          <ShepherdPlume key={vent} vent={vent} timeRef={timeRef} />
        ))}
        <shaderMaterial
          ref={shepherdMaterialRef}
          vertexShader={bodyVertexGLSL(false)}
          fragmentShader={shepherdFragment}
          uniforms={shepherdUniforms}
        />
      </mesh>

      {/* Coarse cargo inside the annulus: rocks a close flight can thread
        * between; invisible from the orbiting distances of the fixed views. */}
      <RingRocks timeRef={timeRef} worldPosition={worldPosition} />

      <Atmosphere sunDirection={sunDirection} variant="ice" />
    </group>
  )
}