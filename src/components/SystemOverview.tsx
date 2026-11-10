import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import { planetIds, planets, type PlanetId } from '../planets'
import { orbitConfig, planetPosition } from '../orbits'

const guideColors: Record<PlanetId, string> = {
  aurelia: '#8197aa',
  cinder: '#a59688',
  vesper: '#9fb8b4',
}

type SystemOverviewProps = {
  onSelect: (id: PlanetId) => void
  timeRef: { current: number }
}

export function SystemOverview({ onSelect, timeRef }: SystemOverviewProps) {
  const labelRefs = useRef<Record<PlanetId, Group | null>>({ aurelia: null, cinder: null, vesper: null })
  const scratch = useMemo(() => new Vector3(), [])
  const orbits = useMemo(
    () => planetIds.map((id) => {
      const radius = orbitConfig[id].radius
      const points = new Float32Array(160 * 3)
      for (let i = 0; i < 160; i++) {
        const angle = (i / 160) * Math.PI * 2
        points[i * 3] = Math.cos(angle) * radius
        points[i * 3 + 2] = Math.sin(angle) * radius
      }
      return points
    }),
    [],
  )
  const initialPositions = useMemo(
    () => planetIds.map((id) => planetPosition(id, 0, new Vector3()).toArray() as [number, number, number]),
    [],
  )

  useFrame(() => {
    for (const id of planetIds) {
      labelRefs.current[id]?.position.copy(planetPosition(id, timeRef.current, scratch))
    }
  })

  return (
    <>
      {planetIds.map((id, index) => (
        <lineLoop key={id}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[orbits[index], 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color={guideColors[id]}
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </lineLoop>
      ))}
      {planetIds.map((id, index) => (
        <group
          key={id}
          ref={(node) => { labelRefs.current[id] = node }}
          position={initialPositions[index]}
        >
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
