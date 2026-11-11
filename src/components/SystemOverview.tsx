import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import { bodies, planetIds, planets, type PlanetId } from '../planets'
import { orbitPoint, planetPosition } from '../orbits'
import { cometOrbitPoint, cometPosition } from '../comet'
import { t, type Locale } from '../strings'

const guideColors: Record<PlanetId, string> = {
  aurelia: '#8197aa',
  cinder: '#a59688',
  vesper: '#9fb8b4',
}

type SystemOverviewProps = {
  onSelect: (id: PlanetId | 'comet') => void
  timeRef: { current: number }
  locale: Locale
}

export function SystemOverview({ onSelect, timeRef, locale }: SystemOverviewProps) {
  const labelRefs = useRef<Record<PlanetId, Group | null>>({ aurelia: null, cinder: null, vesper: null })
  const cometLabelRef = useRef<Group | null>(null)
  const scratch = useMemo(() => new Vector3(), [])
  const orbits = useMemo(
    () => planetIds.map((id) => {
      const points = new Float32Array(160 * 3)
      const scratch = new Vector3()
      for (let i = 0; i < 160; i++) {
        orbitPoint(id, (i / 160) * Math.PI * 2, scratch)
        points[i * 3] = scratch.x
        points[i * 3 + 1] = scratch.y
        points[i * 3 + 2] = scratch.z
      }
      return points
    }),
    [],
  )
  // Mean anomaly samples cluster near periapsis, which keeps the ellipse
  // smooth exactly where the comet moves fastest.
  const cometOrbitLine = useMemo(() => {
    const points = new Float32Array(160 * 3)
    const scratch = new Vector3()
    for (let i = 0; i < 160; i++) {
      cometOrbitPoint((i / 160) * Math.PI * 2, scratch)
      points[i * 3] = scratch.x
      points[i * 3 + 1] = scratch.y
      points[i * 3 + 2] = scratch.z
    }
    return points
  }, [])
  const initialPositions = useMemo(
    () => planetIds.map((id) => planetPosition(id, 0, new Vector3()).toArray() as [number, number, number]),
    [],
  )
  const initialCometPosition = useMemo(
    () => cometPosition(0, new Vector3()).toArray() as [number, number, number],
    [],
  )

  useFrame(() => {
    for (const id of planetIds) {
      labelRefs.current[id]?.position.copy(planetPosition(id, timeRef.current, scratch))
    }
    cometLabelRef.current?.position.copy(cometPosition(timeRef.current, scratch))
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
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[cometOrbitLine, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#8fa3b8"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </lineLoop>
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
              aria-label={t(locale, 'explorePlanet', { name: planets[id].name })}
              onClick={() => onSelect(id)}
            >
              <small>{planets[id].code}</small>
              <span>{planets[id].name}</span>
              <small>{t(locale, 'toOrbit')}</small>
            </button>
          </Html>
        </group>
      ))}
      <group ref={cometLabelRef} position={initialCometPosition}>
        <Html center zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
          <button
            type="button"
            className="system-label system-label--comet"
            aria-label={t(locale, 'explorePlanet', { name: bodies.comet.name })}
            onClick={() => onSelect('comet')}
          >
            <small>{bodies.comet.code}</small>
            <span>{bodies.comet.name}</span>
            <small>{t(locale, 'toComet')}</small>
          </button>
        </Html>
      </group>
    </>
  )
}
