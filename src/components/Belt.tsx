import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Euler, Matrix4, Quaternion, ShaderMaterial, Vector3, type InstancedMesh } from 'three'

const rockVertex = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vInstanceOffset;

void main() {
  vInstanceOffset = instanceMatrix[3].xyz;
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const rockFragment = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vInstanceOffset;

void main() {
  vec3 N = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  vec3 L = normalize(-vWorldPosition);
  float ndl = max(dot(N, L), 0.0);

  float h = fract(sin(dot(vInstanceOffset, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 albedo = mix(vec3(0.21, 0.19, 0.17), vec3(0.42, 0.38, 0.33), h);

  vec3 color = albedo * (0.012 + ndl * 1.0);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

type RingConfig = {
  inner: number
  outer: number
  count: number
  speed: number
  spread: number
  seed: number
}

const rings: RingConfig[] = [
  { inner: 15.5, outer: 16.7, count: 640, speed: 0.0122, spread: 0.34, seed: 907 },
  { inner: 16.7, outer: 17.7, count: 540, speed: 0.0112, spread: 0.42, seed: 2903 },
  { inner: 17.7, outer: 18.6, count: 440, speed: 0.0103, spread: 0.34, seed: 4409 },
]

type BeltRingProps = {
  config: RingConfig
  material: ShaderMaterial
  timeRef: { current: number }
}

function BeltRing({ config, material, timeRef }: BeltRingProps) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const random = createRandom(config.seed)
    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const euler = new Euler()
    const scale = new Vector3()

    for (let i = 0; i < config.count; i++) {
      const angle = random() * Math.PI * 2
      const radius = config.inner + (config.outer - config.inner) * random()
      const y = (random() - 0.5) * 2 * config.spread * (0.35 + random() * 0.65)
      position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      euler.set(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2)
      quaternion.setFromEuler(euler)
      const size = 0.032 + Math.pow(random(), 2.4) * 0.075
      scale.set(size, size * (0.55 + random() * 0.9), size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [config])

  useFrame(() => {
    if (ref.current) ref.current.rotation.y = timeRef.current * config.speed
  })

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, config.count]}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 0]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}

type BeltProps = {
  timeRef: { current: number }
}

export function Belt({ timeRef }: BeltProps) {
  const material = useMemo(
    () => new ShaderMaterial({
      vertexShader: rockVertex,
      fragmentShader: rockFragment,
    }),
    [],
  )

  return (
    <group rotation={[0.035, 0, 0.02]}>
      {rings.map((config) => (
        <BeltRing key={config.seed} config={config} material={material} timeRef={timeRef} />
      ))}
    </group>
  )
}
