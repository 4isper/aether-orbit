import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, type Mesh, type ShaderMaterial } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL } from '../shaders/common'

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
varying vec2 vUv;
${noiseGLSL}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p);
  float t = uTime * 0.32;
  float wisp = fbm3(vec3(p * 2.4, t)) * 0.5 + 0.5;
  float halo = exp(-d * 3.4) * (0.30 + wisp * 0.20);
  float core = exp(-d * 18.0) * 1.35;
  float streak = exp(-abs(p.y) * 44.0) * exp(-abs(p.x) * 3.1) * 0.14;
  float alpha = halo + core + streak;
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

type StarProps = {
  reducedMotion: boolean
  timeScale: number
}

export function Star({ reducedMotion, timeScale }: StarProps) {
  const surfaceRef = useRef<Mesh>(null)
  const glowRef = useRef<Mesh>(null)
  const surfaceMaterialRef = useRef<ShaderMaterial>(null)
  const glowMaterialRef = useRef<ShaderMaterial>(null)
  const surfaceUniforms = useMemo(() => ({ uTime: { value: 0 }, uSpotTime: { value: 0 } }), [])
  const glowUniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const glow = glowRef.current
    if (glow) {
      glow.quaternion.copy(state.camera.quaternion)
      glow.position.copy(state.camera.position).normalize().multiplyScalar(2.42)
    }
    if (reducedMotion) return
    if (surfaceRef.current) surfaceRef.current.rotation.y += delta * 0.004 * timeScale
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
      <mesh ref={surfaceRef} rotation={[0, 0.6, 0]}>
        <sphereGeometry args={[2.35, 96, 96]} />
        <shaderMaterial
          ref={surfaceMaterialRef}
          vertexShader={bodyVertexGLSL(false)}
          fragmentShader={surfaceFragment}
          uniforms={surfaceUniforms}
        />
      </mesh>
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
