import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { planets, type PlanetId } from '../planets'

const planetIds: PlanetId[] = ['aurelia', 'cinder']

const guideColors: Record<PlanetId, string> = {
  aurelia: '#8197aa',
  cinder: '#a59688',
}

type SystemOverviewProps = {
  onSelect: (id: PlanetId) => void
}

export function SystemOverview({ onSelect }: SystemOverviewProps) {
  const compact = useThree(({ size }) => size.width < 700 || size.width / size.height < 0.9)
  const radius = compact ? 2.6 : 3.2
  const centers = useMemo(
    () => planetIds.map((id): [number, number, number] => {
      const [x, y, z] = planets[id].anchor
      return [x + (compact ? 0.45 : 1.8), y + (compact ? -1.3 : -0.5), z]
    }),
    [compact],
  )

  const positions = useMemo(() => {
    const points = new Float32Array(128 * 3)
    for (let i = 0; i < 128; i++) {
      const angle = (i / 128) * Math.PI * 2
      points[i * 3] = Math.cos(angle) * radius
      points[i * 3 + 2] = Math.sin(angle) * radius
    }
    return points
  }, [radius])

  const connector = useMemo(() => {
    const [start, end] = centers
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const fraction = radius / Math.hypot(dx, dz)
    return [
      [start[0] + dx * fraction, start[1], start[2] + dz * fraction],
      [end[0] - dx * fraction, end[1], end[2] - dz * fraction],
    ] as [number, number, number][]
  }, [centers, radius])

  return (
    <>
      <Line
        points={connector}
        color="#87919d"
        lineWidth={0.6}
        dashed
        dashSize={0.18}
        gapSize={0.28}
        transparent
        opacity={0.12}
        depthWrite={false}
      />
      {planetIds.map((id, index) => (
        <group key={id} position={centers[index]}>
          <lineLoop>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial
              color={guideColors[id]}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </lineLoop>
          <Html center zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
            <button
              type="button"
              className={`system-label system-label--${id}`}
              aria-label={`Исследовать ${planets[id].name}`}
              onClick={() => onSelect(id)}
            >
              <small>{planets[id].code}</small>
              <span>{planets[id].name}</span>
              <small>Выйти на орбиту</small>
            </button>
          </Html>
        </group>
      ))}
    </>
  )
}
