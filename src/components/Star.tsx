import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, type Mesh, type ShaderMaterial } from 'three'
import { noiseGLSL } from '../shaders/noise'

const bodyVertex = /* glsl */ `
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
uniform float uTime;
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
  float filaments = ridgedFbm(p * 3.6 + vec3(-t * 0.6, t * 0.8, t * 0.5));
  float heat = granules * 0.62 + filaments * 0.46 - 0.14;
  heat = pow(max(heat, 0.0), 1.35);

  float spots = smoothstep(0.66, 0.8, fbm(p * 2.6 + vec3(4.8, -2.2, 7.1)));
  heat *= 1.0 - spots * 0.72;

  float mu = max(dot(normalize(vWorldNormal), V), 0.0);
  float limb = 0.32 + 0.68 * pow(mu, 0.65);

  vec3 color = mix(vec3(0.52, 0.13, 0.02), vec3(1.0, 0.45, 0.09), smoothstep(0.04, 0.52, heat));
  color = mix(color, vec3(1.0, 0.88, 0.58), smoothstep(0.52, 0.94, heat));
  color *= limb * 2.5;
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
  float wisp = fbm(vec3(p * 2.4, t)) * 0.5 + 0.5;
  float halo = exp(-d * 3.4) * (0.30 + wisp * 0.20);
  float core = exp(-d * 18.0) * 1.35;
  float streak = exp(-abs(p.y) * 44.0) * exp(-abs(p.x) * 3.1) * 0.14;
  float alpha = halo + core + streak;
  vec3 color = mix(vec3(1.0, 0.5, 0.16), vec3(1.0, 0.93, 0.78), core);
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
  const surfaceUniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
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
    if (surfaceMaterialRef.current) surfaceMaterialRef.current.uniforms.uTime.value += delta * timeScale
    if (glowMaterialRef.current) glowMaterialRef.current.uniforms.uTime.value += delta * timeScale
  })

  return (
    <>
      <mesh ref={glowRef} renderOrder={-1} raycast={() => null}>
        <planeGeometry args={[11, 11]} />
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
          vertexShader={bodyVertex}
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
