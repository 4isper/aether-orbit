import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DoubleSide, Vector3, type Group, type Mesh, type ShaderMaterial } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'
import { Atmosphere } from './Atmosphere'
import { starFlux } from '../orbits'
import { useSunDirection } from '../hooks/useSunDirection'

/**
 * Ring density as a function of the normalized radius t = (r - 2.5) / 1.5,
 * shared by the ring shader and the planet's ring-shadow term so the shadow
 * carries the same bands and Cassini gap the rings themselves show.
 */
const ringDensityGLSL = /* glsl */ `
float vesperRingDensity(float t) {
  float band = smoothstep(0.25, 0.75, fbm4(vec3(t * 70.0, 3.0, 9.0)) * 0.5 + 0.5);
  float stripes = 0.035 * sin(t * 420.0);
  float cassini = smoothstep(0.60, 0.64, t) * (1.0 - smoothstep(0.70, 0.74, t));
  return (0.35 + 0.65 * band + stripes) * (1.0 - 0.85 * cassini);
}
float vesperRingEdge(float t) {
  return smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));
}
`

const surfaceFragment = /* glsl */ `
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
${ringDensityGLSL}

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

  // Ring shadow: where the sun ray from this point crosses the ring plane
  // inside the annulus, the rings dim the light by their own density - the
  // Cassini gap lets a bright line through the shadow band.
  float planeDot = dot(L, uRingNormal);
  float crossingT = -dot(vWorldPosition - uRingCenter, uRingNormal) / planeDot;
  float crosses = step(1e-4, abs(planeDot)) * step(0.0, crossingT);
  vec3 crossing = vWorldPosition + L * crossingT;
  float ringRadius = length(crossing - uRingCenter) / uGroupScale;
  float ringT = (ringRadius - 2.5) / 1.5;
  float shadow = 1.0 - crosses * vesperRingEdge(ringT) * vesperRingDensity(ringT) * 0.75;

  vec3 color = albedo * (0.006 + diffuse * shadow * 1.1 * uStarFlux);

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
uniform float uStarFlux;
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vCenter;
varying float vScale;
${noiseGLSL}
${ringDensityGLSL}

void main() {
  float radius = length(vLocalPosition.xy);
  float t = (radius - 2.5) / 1.5;
  float density = vesperRingDensity(t);
  float edge = vesperRingEdge(t);

  vec3 L = normalize(uSunDirection);
  float light = abs(dot(normalize(vWorldNormal), L)) * 0.75 * uStarFlux + 0.25;

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
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const ringMaterialRef = useRef<ShaderMaterial>(null)
  const { width, height } = useThree((state) => state.viewport)
  const compact = useThree((state) => state.size.width < 700) || width / height < 0.9

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

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    updateSunDirection()
    const flux = starFlux(worldPosition)
    if (surfaceMaterialRef.current) surfaceMaterialRef.current.uniforms.uStarFlux.value = flux
    if (ringMaterialRef.current) ringMaterialRef.current.uniforms.uStarFlux.value = flux
    if (groupRef.current && surfaceMaterialRef.current) {
      // The ring plane's world axis and scale feed the planet's shadow term.
      surfaceMaterialRef.current.uniforms.uRingNormal.value
        .setFromMatrixColumn(groupRef.current.matrixWorld, 1)
        .normalize()
      surfaceMaterialRef.current.uniforms.uGroupScale.value
        = groupRef.current.matrixWorld.getMaxScaleOnAxis()
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
          ref={surfaceMaterialRef}
          vertexShader={bodyVertexGLSL(false)}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} renderOrder={1}>
        <ringGeometry args={[2.5, 4, 180, 1]} />
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

      <Atmosphere sunDirection={sunDirection} variant="ice" />
    </group>
  )
}