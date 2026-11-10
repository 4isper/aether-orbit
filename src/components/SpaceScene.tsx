import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Vector3, type Group } from 'three'
import { Backdrop } from './Backdrop'
import { Belt } from './Belt'
import { CameraRig } from './CameraRig'
import { Comet } from './Comet'
import { Planet } from './Planet'
import { Star } from './Star'
import { Cinder } from './Cinder'
import { Vesper } from './Vesper'
import { Starfield } from './Starfield'
import { SystemOverview } from './SystemOverview'
import { planetIds, type PlanetId, type SceneView } from '../planets'
import { planetPosition } from '../orbits'

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

function SceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)

  useFrame(() => {
    frames.current += 1
    if (frames.current === 4) onReady()
  })

  return null
}

type SpaceSceneProps = {
  activeView: SceneView
  destination: SceneView
  timeScale: number
  onReady: () => void
  onArrive: (view: SceneView) => void
  onSelect: (view: SceneView) => void
}

export function SpaceScene({ activeView, destination, timeScale, onReady, onArrive, onSelect }: SpaceSceneProps) {
  const reducedMotion = useReducedMotion()
  const gl = useThree((state) => state.gl)
  const [hovered, setHovered] = useState(false)
  const travelling = activeView !== destination
  const overview = activeView === 'system' && !travelling
  useCursor(overview && hovered, 'pointer', travelling ? 'progress' : overview ? 'default' : 'grab', gl.domElement)

  const orbitTime = useRef(0)
  const groupRefs = useRef<Record<PlanetId, Group | null>>({ aurelia: null, cinder: null, vesper: null })
  const scratch = useMemo(() => new Vector3(), [])
  const initialPositions = useMemo(
    () => planetIds.map((id) => planetPosition(id, 0, new Vector3()).toArray() as [number, number, number]),
    [],
  )

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    if (!reducedMotion) orbitTime.current += delta * timeScale
    for (const id of planetIds) {
      groupRefs.current[id]?.position.copy(planetPosition(id, orbitTime.current, scratch))
    }
  })

  const selectPlanet = (id: PlanetId) => {
    setHovered(false)
    onSelect(id)
  }
  const planetEvents = (id: PlanetId) => overview ? {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      if (event.delta <= 5) selectPlanet(id)
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      setHovered(true)
    },
    onPointerOut: () => setHovered(false),
  } : {}
  const starEvents = overview ? {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      if (event.delta <= 5) {
        setHovered(false)
        onSelect('star')
      }
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      setHovered(true)
    },
    onPointerOut: () => setHovered(false),
  } : {}

  return (
    <>
      <color attach="background" args={['#010205']} />
      <Backdrop />
      <Starfield reducedMotion={reducedMotion} timeScale={timeScale} />
      <Belt timeRef={orbitTime} />
      <Comet timeRef={orbitTime} />
      <group {...starEvents}>
        <Star reducedMotion={reducedMotion} timeScale={timeScale} />
      </group>
      <group ref={(node) => { groupRefs.current.aurelia = node }} position={initialPositions[0]} {...planetEvents('aurelia')}>
        <Planet reducedMotion={reducedMotion} timeScale={timeScale} showMoonLabel={overview} />
      </group>
      <group ref={(node) => { groupRefs.current.cinder = node }} position={initialPositions[1]} {...planetEvents('cinder')}>
        <Cinder reducedMotion={reducedMotion} timeScale={timeScale} />
      </group>
      <group ref={(node) => { groupRefs.current.vesper = node }} position={initialPositions[2]} {...planetEvents('vesper')}>
        <Vesper reducedMotion={reducedMotion} timeScale={timeScale} />
      </group>
      <CameraRig reducedMotion={reducedMotion} destination={destination} onArrive={onArrive} timeRef={orbitTime} />
      {overview && <SystemOverview onSelect={selectPlanet} timeRef={orbitTime} />}
      <SceneReady onReady={onReady} />
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={0.7}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.32}
        />
        <Vignette offset={0.2} darkness={0.58} />
      </EffectComposer>
    </>
  )
}
