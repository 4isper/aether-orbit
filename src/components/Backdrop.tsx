import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, type Group } from 'three'
import { noiseGLSL } from '../shaders/noise'

const planeVertex = /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>

varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}
`

const nebulaFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

varying vec2 vUv;
${noiseGLSL}

void main() {
#include <logdepthbuf_fragment>
  vec2 p = vUv - 0.5;
  p.x *= 1.6;
  float ribbon = exp(-pow((p.y + p.x * 0.18) * 4.5, 2.0));
  float cloud = fbm(vec3(vUv * vec2(5.0, 3.0), 2.4)) * 0.5 + 0.5;
  float filament = snoise(vec3(vUv * vec2(14.0, 8.0), 7.0)) * 0.5 + 0.5;
  float density = ribbon * smoothstep(0.35, 0.8, cloud + filament * 0.2);
  float edge = 1.0 - smoothstep(0.15, 0.72, length(p));
  float alpha = density * edge * 0.16;
  vec3 color = mix(vec3(0.03, 0.08, 0.16), vec3(0.12, 0.055, 0.18), cloud);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * The deep-sky nebula lives on the sky: the ribbon follows the camera's
 * position every frame (it is infinitely far — no parallax) while keeping
 * its world orientation, and renders before everything else so opaque
 * bodies still cover it.
 */
const SKY_RENDER_ORDER = -11

export function Backdrop() {
  const groupRef = useRef<Group>(null)
  useFrame((state) => {
    // Runs after CameraRig by mount order — the frame's final camera pose.
    groupRef.current?.position.copy(state.camera.position)
  })
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -38]} renderOrder={SKY_RENDER_ORDER}>
        <planeGeometry args={[90, 55]} />
        <shaderMaterial
          vertexShader={planeVertex}
          fragmentShader={nebulaFragment}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
