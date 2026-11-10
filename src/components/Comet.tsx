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

const TAIL_COUNT = 44
const TAIL_LENGTH_FACTOR = 130
const TAIL_ACTIVITY_FACTOR = 150
const MIN_TAIL_LENGTH = 2.2
const MAX_TAIL_LENGTH = 7.5
const MIN_TAIL_ACTIVITY = 0.45
const MAX_TAIL_ACTIVITY = 1.3
// The ion tail hugs the anti-sun line; the dust tail lags far harder behind
// the path of motion, which is what curves it along the orbit's wake, and
// spreads into a broader, dimmer, warmer cloud.
const TAIL_LAG_CURVE = 0.32
const TAIL_SPREAD = 0.16
const DUST_COUNT = 52
const DUST_LAG_CURVE = 1.05
const DUST_SPREAD = 0.35

const comaVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const comaFragment = /* glsl */ `
uniform float uActivity;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p);
  float glow = (exp(-d * 6.5) * 0.55 + exp(-d * 2.2) * 0.12) * uActivity;
  vec3 color = vec3(0.62, 0.78, 1.0) * glow;
  gl_FragColor = vec4(color, glow);
}
`

const tailVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(14.0, aSize * uPixelRatio * (60.0 / -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = aAlpha;
}
`

const tailFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float alpha = core * core * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor * alpha, alpha);
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
      values[i] = 0.72 - t * 0.5
    }
    return values
  }, [])
  const ionAlphas = useMemo(() => new Float32Array(TAIL_COUNT), [])
  const dustPositions = useMemo(() => new Float32Array(DUST_COUNT * 3), [])
  const dustSizes = useMemo(() => {
    const values = new Float32Array(DUST_COUNT)
    for (let i = 0; i < DUST_COUNT; i++) {
      const t = (i + 1) / DUST_COUNT
      values[i] = 0.95 - t * 0.4
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
  const previous = useMemo(() => new Vector3(), [])
  const velocity = useMemo(() => new Vector3(), [])
  const antiSun = useMemo(() => new Vector3(), [])
  const scratch = useMemo(() => new Vector3(), [])

  useFrame((state) => {
    const time = timeRef.current
    cometPosition(time, head)
    cometPosition(time - 0.6, previous)
    velocity.copy(head).sub(previous)
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
        const spread = t * tailLength * TAIL_SPREAD + 0.05
        tailParticlePosition(t, tailLength, TAIL_LAG_CURVE, spread, head, velocity, antiSun, time, seed, scratch)
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
        const spread = t * tailLength * DUST_SPREAD + 0.06
        tailParticlePosition(t, tailLength, DUST_LAG_CURVE, spread, head, velocity, antiSun, time, seed, scratch)
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
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshBasicMaterial color={headColor} toneMapped={false} />
      </mesh>
      <mesh ref={comaRef} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[2.6, 2.6]} />
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
