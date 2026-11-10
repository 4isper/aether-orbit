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
import { cometPosition } from '../comet'

const TAIL_COUNT = 44

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
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float alpha = core * core * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(0.62, 0.78, 1.0) * alpha, alpha);
}
`

type CometProps = {
  timeRef: { current: number }
}

export function Comet({ timeRef }: CometProps) {
  const headRef = useRef<Mesh>(null)
  const comaRef = useRef<Mesh>(null)
  const comaMaterialRef = useRef<ShaderMaterial>(null)
  const pointsRef = useRef<Points>(null)
  const materialRef = useRef<ShaderMaterial>(null)

  const positions = useMemo(() => new Float32Array(TAIL_COUNT * 3), [])
  const sizes = useMemo(() => {
    const values = new Float32Array(TAIL_COUNT)
    for (let i = 0; i < TAIL_COUNT; i++) {
      const t = (i + 1) / TAIL_COUNT
      values[i] = 0.72 - t * 0.5
    }
    return values
  }, [])
  const alphas = useMemo(() => new Float32Array(TAIL_COUNT), [])
  const headColor = useMemo(() => new Color(2.4, 3.4, 5.2), [])
  const uniforms = useMemo(
    () => ({
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
    }),
    [],
  )
  const comaUniforms = useMemo(() => ({ uActivity: { value: 1 } }), [])

  const head = useMemo(() => new Vector3(), [])
  const previous = useMemo(() => new Vector3(), [])
  const velocity = useMemo(() => new Vector3(), [])
  const antiSun = useMemo(() => new Vector3(), [])

  useFrame((state) => {
    const time = timeRef.current
    cometPosition(time, head)
    cometPosition(time - 0.6, previous)
    velocity.copy(head).sub(previous)
    antiSun.copy(head).normalize()
    const distance = head.length()
    const tailLength = Math.min(7.5, Math.max(0.9, 130 / (distance * distance)))
    const activity = Math.min(1.3, Math.max(0.14, 150 / (distance * distance)))
    if (comaMaterialRef.current) {
      comaMaterialRef.current.uniforms.uActivity.value = activity
    }

    const geometry = pointsRef.current?.geometry as BufferGeometry | undefined
    if (geometry) {
      const tailPositions = geometry.attributes.position.array as Float32Array
      const tailAlphas = geometry.attributes.aAlpha.array as Float32Array
      const clock = state.clock.elapsedTime
      for (let i = 0; i < TAIL_COUNT; i++) {
        const t = (i + 1) / TAIL_COUNT
        const lag = t * t * tailLength * 0.32
        const seed = i * 12.9898
        const spread = t * tailLength * 0.16 + 0.05
        tailPositions[i * 3] = head.x
          + antiSun.x * (t * tailLength)
          - velocity.x * lag
          + Math.sin(clock * 0.9 + seed) * spread
        tailPositions[i * 3 + 1] = head.y
          + antiSun.y * (t * tailLength)
          - velocity.y * lag
          + Math.cos(clock * 1.3 + seed * 1.7) * spread
        tailPositions[i * 3 + 2] = head.z
          + antiSun.z * (t * tailLength)
          - velocity.z * lag
          + Math.sin(clock * 1.1 + seed * 2.3) * spread
        tailAlphas[i] = Math.pow(1 - t, 1.6) * activity
      }
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.aAlpha.needsUpdate = true
    }

    if (headRef.current) headRef.current.position.copy(head)
    if (comaRef.current) {
      comaRef.current.position.copy(head)
      comaRef.current.quaternion.copy(state.camera.quaternion)
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
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
      <points ref={pointsRef} renderOrder={3} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
          <bufferAttribute attach="attributes-aAlpha" args={[alphas, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={tailVertex}
          fragmentShader={tailFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  )
}
