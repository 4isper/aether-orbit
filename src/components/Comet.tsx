import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type Points,
  type ShaderMaterial,
} from 'three'
import { cometPosition, tailParticlePosition } from '../comet'
import { BODY_RADII } from '../orbits'
import { cometDustPosition } from '../dust'

const TAIL_COUNT = 120
// Honest tails: the ion tail reaches ~0.6 AU at perihelion (14 000 Earth
// radii) and collapses with the inverse square as the comet climbs out.
const TAIL_LENGTH_FACTOR = 2.0e12
const TAIL_ACTIVITY_FACTOR = 1.87e8
const MIN_TAIL_LENGTH = 0
const MAX_TAIL_LENGTH = 14_000
const MIN_TAIL_ACTIVITY = 0.02
const MAX_TAIL_ACTIVITY = 1.3
// The ion tail hugs the anti-sun line, straight from the solar wind: the
// wind is radial, so no lag along the path of motion. The dust tail is
// ballistic: every grain left the nucleus with the comet's own motion and
// flies its private Kepler orbit under radiation-reduced gravity, so the
// curve along the orbit's wake comes from the physics, not from a lag
// factor.
// The ion tail is a narrow cone: real ion tails stay within a few degrees
// of the anti-sun line.
const TAIL_SPREAD = 0.05
const DUST_COUNT = 140
const DUST_BETA_MIN = 0.12
const DUST_BETA_MAX = 0.42
/** Grains in flight left the nucleus over the last 24 time units: near
 * perihelion the comet covers that arc fast, so the trail is long there,
 * and far out it collapses — as a real dust tail does. */
const DUST_RELEASE_WINDOW = 24

const comaVertex = /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>

varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}
`

const comaFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform float uActivity;
varying vec2 vUv;

void main() {
#include <logdepthbuf_fragment>
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p);
  float glow = (exp(-d * 6.5) * 0.55 + exp(-d * 2.2) * 0.12) * uActivity;
  vec3 color = vec3(0.62, 0.78, 1.0) * glow;
  gl_FragColor = vec4(color, glow);
}
`

const tailVertex = /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>

attribute float aSize;
attribute float aAlpha;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // The honest tail spans thousands of units, so the glow sprites keep a
  // constant screen size — a streak of beads, not a shrinking trail.
  gl_PointSize = min(16.0, aSize * uPixelRatio);
  gl_Position = projectionMatrix * mvPosition;
#include <logdepthbuf_vertex>
  vAlpha = aAlpha;
}
`

const tailFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;
varying float vAlpha;

void main() {
#include <logdepthbuf_fragment>
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float alpha = core * core * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`

type CometProps = {
  timeRef: { current: number }
}

export function Comet({ timeRef }: CometProps) {
  const headRef = useRef<Mesh>(null)
  const comaRef = useRef<Mesh>(null)
  const comaMaterialRef = useRef<ShaderMaterial>(null)
  const ionPointsRef = useRef<Points>(null)
  const ionMaterialRef = useRef<ShaderMaterial>(null)
  const dustPointsRef = useRef<Points>(null)
  const dustMaterialRef = useRef<ShaderMaterial>(null)

  const ionPositions = useMemo(() => new Float32Array(TAIL_COUNT * 3), [])
  const ionSizes = useMemo(() => {
    const values = new Float32Array(TAIL_COUNT)
    for (let i = 0; i < TAIL_COUNT; i++) {
      const t = (i + 1) / TAIL_COUNT
      // Screen-space bead sizes: the honest tail is a long streak of glow.
      values[i] = (0.72 - t * 0.5) * 14
    }
    return values
  }, [])
  const ionAlphas = useMemo(() => new Float32Array(TAIL_COUNT), [])
  const dustPositions = useMemo(() => new Float32Array(DUST_COUNT * 3), [])
  const dustSizes = useMemo(() => {
    const values = new Float32Array(DUST_COUNT)
    for (let i = 0; i < DUST_COUNT; i++) {
      const t = (i + 1) / DUST_COUNT
      values[i] = (0.95 - t * 0.4) * 12
    }
    return values
  }, [])
  const dustAlphas = useMemo(() => new Float32Array(DUST_COUNT), [])
  const ionColor = useMemo(() => new Color(0.62, 0.78, 1.0), [])
  const dustColor = useMemo(() => new Color(1.0, 0.85, 0.62), [])
  const headColor = useMemo(() => new Color(2.4, 3.4, 5.2), [])
  const ionUniforms = useMemo(
    () => ({
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
      uColor: { value: ionColor },
    }),
    [ionColor],
  )
  const dustUniforms = useMemo(
    () => ({
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
      uColor: { value: dustColor },
    }),
    [dustColor],
  )
  const comaUniforms = useMemo(() => ({ uActivity: { value: 1 } }), [])

  const head = useMemo(() => new Vector3(), [])
  const antiSun = useMemo(() => new Vector3(), [])
  const scratch = useMemo(() => new Vector3(), [])

  useFrame((state) => {
    const time = timeRef.current
    cometPosition(time, head)
    antiSun.copy(head).normalize()
    const distance = head.length()
    const tailLength = Math.min(MAX_TAIL_LENGTH, Math.max(MIN_TAIL_LENGTH, TAIL_LENGTH_FACTOR / (distance * distance)))
    const activity = Math.min(MAX_TAIL_ACTIVITY, Math.max(MIN_TAIL_ACTIVITY, TAIL_ACTIVITY_FACTOR / (distance * distance)))
    if (comaMaterialRef.current) {
      comaMaterialRef.current.uniforms.uActivity.value = activity
    }

    const ionGeometry = ionPointsRef.current?.geometry as BufferGeometry | undefined
    if (ionGeometry) {
      const tailPositions = ionGeometry.attributes.position.array as Float32Array
      const tailAlphas = ionGeometry.attributes.aAlpha.array as Float32Array
      for (let i = 0; i < TAIL_COUNT; i++) {
        const t = (i + 1) / TAIL_COUNT
        const seed = i * 12.9898
        const spread = t * tailLength * TAIL_SPREAD + tailLength * 0.01
        tailParticlePosition(t, tailLength, spread, head, antiSun, time, seed, scratch)
        tailPositions[i * 3] = scratch.x
        tailPositions[i * 3 + 1] = scratch.y
        tailPositions[i * 3 + 2] = scratch.z
        tailAlphas[i] = Math.pow(1 - t, 1.6) * activity
      }
      ionGeometry.attributes.position.needsUpdate = true
      ionGeometry.attributes.aAlpha.needsUpdate = true
    }

    const dustGeometry = dustPointsRef.current?.geometry as BufferGeometry | undefined
    if (dustGeometry) {
      const tailPositions = dustGeometry.attributes.position.array as Float32Array
      const tailAlphas = dustGeometry.attributes.aAlpha.array as Float32Array
      for (let i = 0; i < DUST_COUNT; i++) {
        const t = (i + 1) / DUST_COUNT
        const seed = 40 + i * 7.31
        // One grain per slot: released `t` of the release window ago, with
        // its own radiation-pressure β — the spread of β fans the syndyne
        // curve the way real dust tails fan.
        const beta = DUST_BETA_MIN
          + (Math.abs(Math.sin(seed) * 43758.5453) % 1) * (DUST_BETA_MAX - DUST_BETA_MIN)
        cometDustPosition(time - t * DUST_RELEASE_WINDOW, beta, time, scratch)
        // A whisper of scatter keeps the grains off a mathematically exact
        // curve: real dust clumps and drifts as it leaves the nucleus.
        const scatter = tailLength * (0.04 * t + 0.01)
        scratch.x += Math.sin(time * 0.9 + seed) * scatter
        scratch.y += Math.cos(time * 1.3 + seed * 1.7) * scatter
        scratch.z += Math.sin(time * 1.1 + seed * 2.3) * scatter
        tailPositions[i * 3] = scratch.x
        tailPositions[i * 3 + 1] = scratch.y
        tailPositions[i * 3 + 2] = scratch.z
        tailAlphas[i] = Math.pow(1 - t, 1.1) * activity * 0.85
      }
      dustGeometry.attributes.position.needsUpdate = true
      dustGeometry.attributes.aAlpha.needsUpdate = true
    }

    if (headRef.current) headRef.current.position.copy(head)
    if (comaRef.current) {
      comaRef.current.position.copy(head)
      comaRef.current.quaternion.copy(state.camera.quaternion)
      // The coma swells with the comet's activity: a bright perihelion coma
      // spans ~1.5 units (~100 000 km), far out it shrinks to a haze.
      comaRef.current.scale.setScalar(0.15 + activity * 0.85)
    }
    if (ionMaterialRef.current) {
      ionMaterialRef.current.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    }
    if (dustMaterialRef.current) {
      dustMaterialRef.current.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    }
  })

  return (
    <group>
      <mesh ref={headRef} raycast={() => null}>
        {/* The honest nucleus: ~13 km across, a dot the coma outshines. */}
        <sphereGeometry args={[BODY_RADII.comet, 16, 16]} />
        <meshBasicMaterial color={headColor} toneMapped={false} />
      </mesh>
      <mesh ref={comaRef} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[1.8, 1.8]} />
        <shaderMaterial
          ref={comaMaterialRef}
          vertexShader={comaVertex}
          fragmentShader={comaFragment}
          uniforms={comaUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <points ref={dustPointsRef} renderOrder={3} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustPositions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[dustSizes, 1]} />
          <bufferAttribute attach="attributes-aAlpha" args={[dustAlphas, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={dustMaterialRef}
          vertexShader={tailVertex}
          fragmentShader={tailFragment}
          uniforms={dustUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <points ref={ionPointsRef} renderOrder={4} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[ionPositions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[ionSizes, 1]} />
          <bufferAttribute attach="attributes-aAlpha" args={[ionAlphas, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={ionMaterialRef}
          vertexShader={tailVertex}
          fragmentShader={tailFragment}
          uniforms={ionUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  )
}
