import { AdditiveBlending } from 'three'
import { noiseGLSL } from '../shaders/noise'

const planeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const nebulaFragment = /* glsl */ `
varying vec2 vUv;
${noiseGLSL}

void main() {
  vec2 p = vUv - 0.5;
  p.x *= 1.6;
  float ribbon = exp(-pow((p.y + p.x * 0.18) * 4.5, 2.0));
  float cloud = fbm(vec3(vUv * vec2(5.0, 3.0), 2.4)) * 0.5 + 0.5;
  float filament = snoise(vec3(vUv * vec2(14.0, 8.0), 7.0)) * 0.5 + 0.5;
  float density = ribbon * smoothstep(0.35, 0.8, cloud + filament * 0.2);
  float edge = 1.0 - smoothstep(0.15, 0.72, length(p));
  float alpha = density * edge * 0.16;
  vec3 color = mix(vec3(0.03, 0.08, 0.16), vec3(0.12, 0.055, 0.18), cloud);
  gl_FragColor = vec4(color * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const sunFragment = /* glsl */ `
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p);
  float halo = exp(-d * 5.0) * 0.32;
  float core = exp(-d * 45.0) * 2.0;
  float streak = exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 4.0) * 0.16;
  float alpha = halo + core + streak;
  vec3 color = mix(vec3(1.0, 0.67, 0.38), vec3(1.0, 0.94, 0.8), core);
  gl_FragColor = vec4(color * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function Backdrop() {
  return (
    <>
      <mesh position={[0, 0, -38]}>
        <planeGeometry args={[90, 55]} />
        <shaderMaterial
          vertexShader={planeVertex}
          fragmentShader={nebulaFragment}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh position={[-7.5, 3, -10]} renderOrder={-1}>
        <planeGeometry args={[14, 14]} />
        <shaderMaterial
          vertexShader={planeVertex}
          fragmentShader={sunFragment}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </>
  )
}
