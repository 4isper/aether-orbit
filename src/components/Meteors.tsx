import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Vector3, type BufferAttribute, type ShaderMaterial } from 'three'
import { SHOWER_SLOTS, meteorAlpha, meteorPhase, meteorPoint, showerIntensity, showerMeteor } from '../meteors'

const meteorVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(6.0, aSize * uPixelRatio * (85.0 / -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = aAlpha;
}
`

const meteorFragment = /* glsl */ `
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float core = smoothstep(0.5, 0.0, length(uv));
  float alpha = core * core * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.8), alpha);
}
`

// Three ambient slots with desynced cycles: usually nothing, occasionally
// one or two streaks — the sky stays quiet, it just blinks once in a while.
const SLOTS = [9127, 3313, 7717]
const TRAIL_SAMPLES = 7

export function Meteors({ timeScale }: { timeScale: number }) {
  const materialRef = useRef<ShaderMaterial>(null)
  const positionRef = useRef<BufferAttribute>(null)
  const alphaRef = useRef<BufferAttribute>(null)
  const clock = useRef(0)
  const point = useMemo(() => new Vector3(), [])

  const buffers = useMemo(() => {
    const count = (SLOTS.length + SHOWER_SLOTS.length) * TRAIL_SAMPLES
    const positions = new Float32Array(count * 3)
    const alphas = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let slot = 0; slot < SLOTS.length + SHOWER_SLOTS.length; slot++) {
      for (let sample = 0; sample < TRAIL_SAMPLES; sample++) {
        sizes[slot * TRAIL_SAMPLES + sample] = 1.6 - (sample / (TRAIL_SAMPLES - 1)) * 1.2
      }
    }
    return { positions, alphas, sizes }
  }, [])

  const uniforms = useMemo(
    () => ({ uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) } }),
    [],
  )

  useFrame((state, rawDelta) => {
    const material = materialRef.current
    const positionAttr = positionRef.current
    const alphaAttr = alphaRef.current
    if (!material || !positionAttr || !alphaAttr) return
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    // The meteor clock rides the shared time scale: pause freezes a streak
    // mid-flight, reversing time replays the same deterministic paths back.
    clock.current += Math.min(rawDelta, 0.1) * timeScale
    const positions = positionAttr.array as Float32Array
    const alphas = alphaAttr.array as Float32Array

    const fillTrail = (slot: number, phase: ReturnType<typeof meteorPhase>, strength: number) => {
      const trailStep = (phase.life * 0.35) / (TRAIL_SAMPLES - 1)
      const headAge = Math.min(Math.max(phase.age, 0), phase.life)
      for (let sample = 0; sample < TRAIL_SAMPLES; sample++) {
        const index = slot * TRAIL_SAMPLES + sample
        const age = Math.max(headAge - sample * trailStep, 0)
        meteorPoint(phase.spawn, age, point)
        positions[index * 3] = point.x
        positions[index * 3 + 1] = point.y
        positions[index * 3 + 2] = point.z
        alphas[index] =
          strength * meteorAlpha(phase.age, phase.life) * (1 - sample / (TRAIL_SAMPLES - 1))
      }
    }

    for (let slot = 0; slot < SLOTS.length; slot++) {
      fillTrail(slot, meteorPhase(SLOTS[slot], clock.current), 1)
    }
    // The rain streams from one radiant, thick and thinning with the veil.
    const rain = showerIntensity(clock.current)
    for (let slot = 0; slot < SHOWER_SLOTS.length; slot++) {
      fillTrail(
        SLOTS.length + slot,
        showerMeteor(SHOWER_SLOTS[slot], clock.current),
        rain,
      )
    }
    positionAttr.needsUpdate = true
    alphaAttr.needsUpdate = true
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          ref={positionRef}
          attach="attributes-position"
          args={[buffers.positions, 3]}
        />
        <bufferAttribute attach="attributes-aSize" args={[buffers.sizes, 1]} />
        <bufferAttribute
          ref={alphaRef}
          attach="attributes-aAlpha"
          args={[buffers.alphas, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={meteorVertex}
        fragmentShader={meteorFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
