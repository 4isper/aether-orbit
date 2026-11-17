import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { BufferGeometry, CanvasTexture, SRGBColorSpace, Vector3, type Group } from 'three'
import { bodies, planetIds, planets, type PlanetId } from '../planets'
import { orbitPoint, planetPosition, trojanPosition, trojanTrailingPosition } from '../orbits'
import { cometOrbitPoint, cometPosition } from '../comet'
import { erebusOrbitPoint, erebusPosition } from '../erebus'
import { t, type Locale } from '../strings'

const guideColors: Record<PlanetId, string> = {
  aurelia: '#8197aa',
  cinder: '#a59688',
  vesper: '#9fb8b4',
}

/**
 * The honest spheres are sub-pixel from the overview, so each wandering
 * body — and Solis itself — carries a fixed-size marker dot the eye can
 * anchor on; the labels ride the same positions and stay the click targets.
 */
const MARKER_COLORS = ['#fff6e8', '#8197aa', '#a59688', '#9fb8b4', '#8fa3b8', '#7d8ba0', '#b9c4d4', '#b9c4d4']
const MARKER_COUNT = MARKER_COLORS.length

/** A soft round dot for the markers, drawn once on a canvas. */
const markerDot = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 32, 32)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
})()

type SystemOverviewProps = {
  onSelect: (id: PlanetId | 'comet' | 'erebus') => void
  timeRef: { current: number }
  locale: Locale
}

export function SystemOverview({ onSelect, timeRef, locale }: SystemOverviewProps) {
  const labelRefs = useRef<Record<PlanetId, Group | null>>({ aurelia: null, cinder: null, vesper: null })
  const cometLabelRef = useRef<Group | null>(null)
  const erebusLabelRef = useRef<Group | null>(null)
  const trojanLabelRef = useRef<Group | null>(null)
  const trojanTrailLabelRef = useRef<Group | null>(null)
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
  const erebusOrbitLine = useMemo(() => {
    const points = new Float32Array(160 * 3)
    const scratch = new Vector3()
    for (let i = 0; i < 160; i++) {
      erebusOrbitPoint((i / 160) * Math.PI * 2, scratch)
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
  const initialErebusPosition = useMemo(
    () => erebusPosition(0, new Vector3()).toArray() as [number, number, number],
    [],
  )
  const initialTrojanPosition = useMemo(
    () => trojanPosition(0, new Vector3()).toArray() as [number, number, number],
    [],
  )
  const initialTrojanTrailPosition = useMemo(
    () => trojanTrailingPosition(0, new Vector3()).toArray() as [number, number, number],
    [],
  )

  const markerRef = useRef<BufferGeometry>(null)
  const markerColors = useMemo(() => {
    const colors = new Float32Array(MARKER_COUNT * 3)
    MARKER_COLORS.forEach((hex, i) => {
      colors[i * 3] = parseInt(hex.slice(1, 3), 16) / 255
      colors[i * 3 + 1] = parseInt(hex.slice(3, 5), 16) / 255
      colors[i * 3 + 2] = parseInt(hex.slice(5, 7), 16) / 255
    })
    return colors
  }, [])

  useFrame(() => {
    const t = timeRef.current
    for (const id of planetIds) {
      labelRefs.current[id]?.position.copy(planetPosition(id, t, scratch))
    }
    cometLabelRef.current?.position.copy(cometPosition(t, scratch))
    erebusLabelRef.current?.position.copy(erebusPosition(t, scratch))
    trojanLabelRef.current?.position.copy(trojanPosition(t, scratch))
    trojanTrailLabelRef.current?.position.copy(trojanTrailingPosition(t, scratch))
    // The marker dots ride the same live positions; slot 0 is Solis at the
    // origin, parked once by the zero-filled array.
    const attribute = markerRef.current?.attributes.position
    if (attribute) {
      const array = attribute.array as Float32Array
      planetIds.forEach((id, i) => {
        planetPosition(id, t, scratch)
        array[(i + 1) * 3] = scratch.x
        array[(i + 1) * 3 + 1] = scratch.y
        array[(i + 1) * 3 + 2] = scratch.z
      })
      cometPosition(t, scratch)
      array[12] = scratch.x
      array[13] = scratch.y
      array[14] = scratch.z
      erebusPosition(t, scratch)
      array[15] = scratch.x
      array[16] = scratch.y
      array[17] = scratch.z
      trojanPosition(t, scratch)
      array[18] = scratch.x
      array[19] = scratch.y
      array[20] = scratch.z
      trojanTrailingPosition(t, scratch)
      array[21] = scratch.x
      array[22] = scratch.y
      array[23] = scratch.z
      attribute.needsUpdate = true
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
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[erebusOrbitLine, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#7d8ba0"
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </lineLoop>
      {/* Fixed-size marker dots: the honest bodies are sub-pixel out here.
        * The first marker is Solis itself, parked at the origin. */}
      <points frustumCulled={false} raycast={() => null}>
        <bufferGeometry ref={markerRef}>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(MARKER_COUNT * 3), 3]} />
          <bufferAttribute attach="attributes-color" args={[markerColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={7}
          sizeAttenuation={false}
          vertexColors
          map={markerDot}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </points>
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
      <group ref={erebusLabelRef} position={initialErebusPosition}>
        <Html center zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
          <button
            type="button"
            className="system-label system-label--erebus"
            aria-label={t(locale, 'explorePlanet', { name: bodies.erebus.name })}
            onClick={() => onSelect('erebus')}
          >
            <small>{bodies.erebus.code}</small>
            <span>{bodies.erebus.name}</span>
            <small>{t(locale, 'toOrbit')}</small>
          </button>
        </Html>
      </group>
      {/* The trojan is a point of light on Aurelia's line: named, not flown
        * to — the tag just marks the gravity balance it keeps. */}
      <group ref={trojanLabelRef} position={initialTrojanPosition}>
        <Html center zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
          <span className="system-tag">{t(locale, 'trojanTag')}</span>
        </Html>
      </group>
      <group ref={trojanTrailLabelRef} position={initialTrojanTrailPosition}>
        <Html center zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
          <span className="system-tag">{t(locale, 'trojanTagTrail')}</span>
        </Html>
      </group>
    </>
  )
}
