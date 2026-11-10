import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, type ShaderMaterial } from 'three'

const starVertex = /* glsl */ `
attribute float aSize;
attribute float aSeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vBrightness;
varying float vTwinkle;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.84 + 0.16 * sin(uTime * (0.45 + aSeed) + aSeed * 40.0);
  gl_PointSize = min(9.0, aSize * uPixelRatio * (85.0 / -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  vColor = aColor;
  vBrightness = max(0.0, (aSize - 0.6) / 2.8);
  vTwinkle = twinkle;
}
`

const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vBrightness;
varying float vTwinkle;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float distanceToCenter = length(uv);
  float core = smoothstep(0.5, 0.0, distanceToCenter);
  core *= core;
  float rays = (
    smoothstep(0.035, 0.0, abs(uv.x)) * smoothstep(0.5, 0.0, abs(uv.y))
    + smoothstep(0.035, 0.0, abs(uv.y)) * smoothstep(0.5, 0.0, abs(uv.x))
  ) * vBrightness * 0.16;
  float alpha = (core + rays) * (0.42 + vBrightness * 0.65) * vTwinkle;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor * (0.72 + vBrightness * 0.7), alpha);
}
`

function createRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

type StarfieldProps = {
  reducedMotion: boolean
}

export function Starfield({ reducedMotion }: StarfieldProps) {
  const materialRef = useRef<ShaderMaterial>(null)
  const compact = useThree((state) => state.size.width < 700)
  const count = compact ? 2800 : 5400

  const geometry = useMemo(() => {
    const random = createRandom(4217)
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const seeds = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const radius = 30 + random() * 62
      const theta = random() * Math.PI * 2
      const phi = Math.acos(2 * random() - 1)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.cos(phi)
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)

      const brightness = Math.pow(random(), 3)
      sizes[i] = 0.6 + brightness * 2.8
      seeds[i] = random()
      const warmth = random()
      const intensity = 0.55 + brightness * 1.1
      colors[i * 3] = intensity * (0.82 + warmth * 0.18)
      colors[i * 3 + 1] = intensity * (0.86 + warmth * 0.08)
      colors[i * 3 + 2] = intensity
    }

    return { positions, sizes, seeds, colors }
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
    }),
    [],
  )

  useFrame((state, delta) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    if (!reducedMotion) materialRef.current.uniforms.uTime.value += delta
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geometry.positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[geometry.sizes, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[geometry.seeds, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[geometry.colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={starVertex}
        fragmentShader={starFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
