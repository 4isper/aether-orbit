import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  CatmullRomCurve3,
  DoubleSide,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
  type ShaderMaterial,
} from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL } from '../shaders/common'
import { arcPoint, prominenceEnvelope } from '../prominences'
import { glareFactor } from '../glare'

const surfaceFragment = /* glsl */ `
uniform float uTime;
uniform float uSpotTime;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

void main() {
  vec3 p = normalize(vObjectPosition);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  float t = uTime * 0.045;
  vec3 drift = vec3(t, t * 1.31, -t * 0.73);
  float granules = fbm4(p * 6.5 + drift) * 0.5 + 0.5;
  float filaments = ridgedFbm3(p * 3.6 + vec3(-t * 0.6, t * 0.8, t * 0.5));
  float heat = granules * 0.62 + filaments * 0.46 - 0.14;
  heat = pow(max(heat, 0.0), 1.35);

  // Spots live on their own slow clock: real umbrae outlast thousands of
  // granule lifetimes, so their field drifts ~30x slower and carries a
  // fibrous penumbra around the dark core.
  vec3 spotDrift = vec3(uSpotTime * 0.12, -uSpotTime * 0.09, uSpotTime * 0.14);
  float spotField = fbm3(p * 2.6 + vec3(4.8, -2.2, 7.1) + spotDrift);
  // fbm3 tops out around 0.55 (sigma ~0.16): the thresholds below actually
  // fire, giving a few percent of umbra plus its penumbra fringe.
  float umbra = smoothstep(0.32, 0.42, spotField);
  float penumbra = smoothstep(0.2, 0.34, spotField) * (1.0 - umbra);
  float penumbraFibers = penumbra * (0.55 + 0.45 * ridgedFbm3(p * 20.0 + spotDrift * 3.0));
  heat *= 1.0 - umbra * 0.72 - penumbraFibers * 0.3;

  float mu = max(dot(normalize(vWorldNormal), V), 0.0);
  float limb = 0.32 + 0.68 * pow(mu, 0.65);

  // 5800 K photosphere: near-white, granulation varies brightness only —
  // deep intergranular lanes keep the mottling legible where the cells clip.
  float cells = 0.62 + 0.5 * heat;
  vec3 color = mix(vec3(1.0, 0.88, 0.74), vec3(1.0, 0.99, 0.96), clamp(cells, 0.0, 1.0));
  color *= cells;
  // Umbrae are explicitly darker and slightly cooler-red; the fibrous
  // penumbra grades outward from them.
  color *= 1.0 - umbra * 0.5 - penumbraFibers * 0.28;
  color = mix(color, color * vec3(1.25, 0.85, 0.7), umbra);
  color *= limb * 1.45;
  color += vec3(1.0, 0.32, 0.05) * pow(1.0 - mu, 2.4) * 0.55;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const glowVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const glowFragment = /* glsl */ `
uniform float uTime;
uniform float uGlare;
varying vec2 vUv;
${noiseGLSL}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p);
  float t = uTime * 0.32;
  float wisp = fbm3(vec3(p * 2.4, t)) * 0.5 + 0.5;
  float halo = exp(-d * 3.4) * (0.22 + wisp * 0.12);
  float core = exp(-d * 18.0) * 1.35;
  float streak = exp(-abs(p.y) * 44.0) * exp(-abs(p.x) * 3.1) * 0.14;

  // Coronal streamers: cones along slowly rotating magnetic axes (golden
  // angle apart), widening and fading outward, broken up by noise wisps.
  float streamers = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float angle = fi * 2.399 + t * 0.05 * (0.6 + 0.4 * fi);
    vec2 axis = vec2(cos(angle), sin(angle));
    float along = dot(p, axis);
    float perp = abs(dot(p, vec2(-axis.y, axis.x)));
    float outw = smoothstep(0.15, 0.9, along);
    float width = mix(0.05, 0.34, outw);
    float fade = exp(-(along - 0.15) * 2.6) * outw;
    float wobble = 0.6 + 0.8 * fbm3(vec3(p * 3.0, t * 0.5 + fi * 7.3));
    streamers += exp(-pow(perp / width, 2.0)) * fade * wobble;
  }
  streamers *= 0.4;

  float alpha = halo + core + streak + streamers;
  // Looking into the star floods the frame: the glare factor is camera
  // geometry (glare.ts), the flood itself rides this billboard.
  alpha += uGlare * (exp(-d * 7.0) * 0.9 + exp(-d * 2.2) * 0.3);
  vec3 color = mix(vec3(1.0, 0.76, 0.52), vec3(1.0, 0.97, 0.93), core);
  gl_FragColor = vec4(color * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const rimVertex = /* glsl */ `
varying vec3 vViewNormal;
void main() {
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const rimFragment = /* glsl */ `
varying vec3 vViewNormal;

void main() {
  float intensity = pow(max(0.72 - dot(vViewNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.6);
  vec3 color = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.72, 0.36), clamp(intensity * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(color * intensity * 0.95, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const prominenceVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vWorldPosition;
void main() {
  vUv = uv;
  vViewNormal = normalize(normalMatrix * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const prominenceFragment = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uBrightness;
varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vWorldPosition;
${noiseGLSL}

void main() {
  // The star sits at the world origin, so the radial direction of a loop
  // point is its bearing on the photosphere.
  vec3 anchor = normalize(vWorldPosition);
  vec3 view = normalize(cameraPosition - vWorldPosition);
  // Seen head-on a prominence is a dark filament against the disk, so it
  // shows only near the limb and fades out over the bright face.
  float facing = abs(dot(anchor, view));
  float limb = 1.0 - smoothstep(0.42, 0.8, facing);
  // Cylindrical falloff across the tube: glowing gas, not solid geometry.
  float soft = smoothstep(0.0, 0.55, abs(dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0))));

  // Footpoints carry more emission than the thin arch between them.
  float body = 0.55 + 0.45 * pow(1.0 - sin(3.14159 * vUv.x), 1.5);
  float flow = fbm3(vec3(vUv.x * 4.0, vUv.y * 1.5, uTime * 0.22)) * 0.5 + 0.5;

  float alpha = uEnergy * limb * soft * body * (0.5 + 0.5 * flow) * uBrightness;
  vec3 color = mix(vec3(1.0, 0.16, 0.06), vec3(1.0, 0.55, 0.3), clamp(flow * 0.7 + uEnergy * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(color * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const PROMINENCE_RADIUS = 2.35

function buildLoopGeometry(spec: ProminenceSpec) {
  const a = new Vector3(...spec.a).normalize()
  const b = new Vector3(...spec.b).normalize()
  const points: Vector3[] = []
  for (let i = 0; i <= 20; i++) {
    points.push(arcPoint(a, b, spec.apex, i / 20, new Vector3()).multiplyScalar(PROMINENCE_RADIUS))
  }
  return new TubeGeometry(new CatmullRomCurve3(points), 48, spec.tube, 6, false)
}

type ProminenceSpec = {
  a: [number, number, number]
  b: [number, number, number]
  apex: number
  tube: number
  period: number
  offset: number
  brightness: number
}

/**
 * Loops spread across longitudes (~51° apart) so any camera azimuth keeps one
 * or two of them near the visible limb; latitudes and apex heights vary so the
 * limb line never reads as a fence. Periods and offsets are staggered so about
 * half the set is alive at once.
 */
const PROMINENCES: ProminenceSpec[] = [
  { a: [0.98, 0.14, 0.14], b: [0.93, 0.28, 0.26], apex: 0.34, tube: 0.042, period: 34, offset: 0.05, brightness: 2.6 },
  { a: [0.53, 0.78, 0.33], b: [0.62, 0.76, 0.19], apex: 0.24, tube: 0.034, period: 41, offset: 0.35, brightness: 2.0 },
  { a: [-0.28, -0.87, 0.4], b: [-0.12, -0.93, 0.36], apex: 0.4, tube: 0.048, period: 47, offset: 0.6, brightness: 2.8 },
  { a: [-0.83, 0.32, -0.45], b: [-0.68, 0.45, -0.58], apex: 0.26, tube: 0.038, period: 30, offset: 0.8, brightness: 2.2 },
  { a: [-0.12, 0.55, -0.83], b: [0.05, 0.62, -0.78], apex: 0.36, tube: 0.04, period: 44, offset: 0.5, brightness: 2.4 },
  { a: [0.42, -0.72, -0.55], b: [0.56, -0.66, -0.5], apex: 0.3, tube: 0.044, period: 38, offset: 0.72, brightness: 2.9 },
  { a: [-0.96, -0.1, 0.26], b: [-0.9, -0.22, 0.37], apex: 0.22, tube: 0.034, period: 52, offset: 0.22, brightness: 2.1 },
]

function ProminenceLoop({ spec, reducedMotion, timeScale }: {
  spec: ProminenceSpec
  reducedMotion: boolean
  timeScale: number
}) {
  const materialRef = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => buildLoopGeometry(spec), [spec])
  const uniforms = useMemo(() => ({
    uEnergy: { value: 0 },
    uTime: { value: 0 },
    uBrightness: { value: spec.brightness },
  }), [spec])
  const time = useRef(0)

  useFrame((_, rawDelta) => {
    const material = materialRef.current
    if (!material || reducedMotion) return
    time.current += Math.min(rawDelta, 0.1) * timeScale
    material.uniforms.uEnergy.value = prominenceEnvelope(time.current / spec.period - spec.offset)
    material.uniforms.uTime.value = time.current
  })

  return (
    <mesh geometry={geometry} raycast={() => null}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={prominenceVertex}
        fragmentShader={prominenceFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
      />
    </mesh>
  )
}

type StarProps = {
  reducedMotion: boolean
  timeScale: number
}

export function Star({ reducedMotion, timeScale }: StarProps) {
  const rotationRef = useRef<Group>(null)
  const glowRef = useRef<Mesh>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const glowMaterialRef = useRef<ShaderMaterial>(null)
  const surfaceUniforms = useMemo(() => ({ uTime: { value: 0 }, uSpotTime: { value: 0 } }), [])
  const glowUniforms = useMemo(() => ({ uTime: { value: 0 }, uGlare: { value: 0 } }), [])
  const forwardScratch = useMemo(() => new Vector3(), [])
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    // The photosphere and its prominences rotate together: the loops are
    // anchored to the surface, so one clock drives the whole group.
    if (rotationRef.current) rotationRef.current.rotation.y += delta * 0.004 * timeScale
    const glow = glowRef.current
    if (glow) {
      glow.quaternion.copy(state.camera.quaternion)
      glow.position.copy(state.camera.position).normalize().multiplyScalar(2.42)
    }
    // The white-out of looking into the star: not motion, so it applies in
    // every mode, including reduced motion.
    state.camera.getWorldDirection(forwardScratch)
    forwardScratch.negate()
    if (glowMaterialRef.current) {
      glowMaterialRef.current.uniforms.uGlare.value = glareFactor(
        forwardScratch.dot(state.camera.position),
        state.camera.position.length(),
      )
    }
    if (reducedMotion) return
    if (surfaceMaterialRef.current) {
      // Granulation churns every few scene-minutes; spot groups drift for days.
      surfaceMaterialRef.current.uniforms.uTime.value += delta * timeScale
      surfaceMaterialRef.current.uniforms.uSpotTime.value += delta * timeScale * 0.03
    }
    if (glowMaterialRef.current) glowMaterialRef.current.uniforms.uTime.value += delta * timeScale
  })

  return (
    <>
      <mesh ref={glowRef} renderOrder={-1} raycast={() => null}>
        <planeGeometry args={[9, 9]} />
        <shaderMaterial
          ref={glowMaterialRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <group ref={rotationRef}>
        <mesh rotation={[0, 0.6, 0]}>
          <sphereGeometry args={[2.35, 96, 96]} />
          <shaderMaterial
            ref={surfaceMaterialRef}
            vertexShader={bodyVertexGLSL(false)}
            fragmentShader={surfaceFragment}
            uniforms={surfaceUniforms}
          />
        </mesh>
        {PROMINENCES.map((spec, index) => (
          <ProminenceLoop key={index} spec={spec} reducedMotion={reducedMotion} timeScale={timeScale} />
        ))}
      </group>
      <mesh raycast={() => null}>
        <sphereGeometry args={[2.75, 64, 64]} />
        <shaderMaterial
          vertexShader={rimVertex}
          fragmentShader={rimFragment}
          side={BackSide}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </>
  )
}
