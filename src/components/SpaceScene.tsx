import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { Bloom, EffectComposer, EffectComposerContext, Vignette } from '@react-three/postprocessing'
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
import { nextTransit } from '../eclipse'
import type { CameraPose } from '../camera-math'
import type { Locale } from '../strings'

function SceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)

  useFrame(() => {
    frames.current += 1
    if (frames.current === 4) onReady()
  })

  return null
}

/**
 * Lives inside the EffectComposer so it can re-render the effect chain on
 * demand: without preserveDrawingBuffer the canvas may only be read in the
 * same task that drew it.
 */
function ComposerCapture() {
  const { composer } = useContext(EffectComposerContext)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const capture = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name
      if (!name) return
      composer.render()
      const link = document.createElement('a')
      link.download = name
      link.href = gl.domElement.toDataURL('image/png')
      link.click()
    }
    window.addEventListener('aether:screenshot', capture)
    return () => window.removeEventListener('aether:screenshot', capture)
  }, [composer, gl])

  return null
}

/** What the interface needs to announce a transit: a countdown and the
 * absolute peak time the "skip to the moment" button seeks to. */
export type TransitAnnouncement = {
  seconds: number
  peakAt: number
  inProgress: boolean
}

type SpaceSceneProps = {
  activeView: SceneView
  destination: SceneView
  initialView: SceneView
  initialPose?: CameraPose | null
  timeScale: number
  locale: Locale
  reducedMotion: boolean
  lowEnd?: boolean
  onReady: () => void
  onArrive: (view: SceneView) => void
  onSharePose: (view: SceneView, pose: CameraPose) => void
  onSelect: (view: SceneView) => void
  onTransit?: (announcement: TransitAnnouncement | null) => void
}

export function SpaceScene({ activeView, destination, initialView, initialPose, timeScale, locale, reducedMotion, lowEnd = false, onReady, onArrive, onSharePose, onSelect, onTransit }: SpaceSceneProps) {
  const gl = useThree((state) => state.gl)
  const [hovered, setHovered] = useState(false)
  const travelling = activeView !== destination
  const overview = activeView === 'system' && !travelling
  useCursor(overview && hovered, 'pointer', travelling ? 'progress' : overview ? 'default' : 'grab', gl.domElement)

  const orbitTime = useRef(0)
  const moonWorld = useRef(new Vector3())
  const groupRefs = useRef<Record<PlanetId, Group | null>>({ aurelia: null, cinder: null, vesper: null })
  const scratch = useMemo(() => new Vector3(), [])
  const initialPositions = useMemo(
    () => planetIds.map((id) => planetPosition(id, 0, new Vector3()).toArray() as [number, number, number]),
    [],
  )
  const transitTimer = useRef(0)
  const transitRef = useRef<{ seconds: number; peakAt: number; inProgress: boolean } | null>(null)

  useEffect(() => {
    // "Skip to the moment": jump the shared simulation clock. Everything
    // derived from it (orbits, moon phases, the comet) is deterministic and
    // lands on the requested instant exactly.
    const onSeek = (event: Event) => {
      const time = (event as CustomEvent<{ time?: number }>).detail?.time
      if (Number.isFinite(time)) orbitTime.current = time as number
    }
    window.addEventListener('aether:seek', onSeek)
    return () => window.removeEventListener('aether:seek', onSeek)
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    if (!reducedMotion) orbitTime.current += delta * timeScale
    for (const id of planetIds) {
      groupRefs.current[id]?.position.copy(planetPosition(id, orbitTime.current, scratch))
    }

    // Announce the next moon transit at a calm one-update-per-second pace.
    transitTimer.current += delta
    if (onTransit && transitTimer.current >= 1) {
      transitTimer.current = 0
      const event = nextTransit(orbitTime.current)
      const next = event
        ? {
            seconds: event.inProgress ? 0 : Math.max(event.entry - orbitTime.current, 0),
            peakAt: event.peak,
            inProgress: event.inProgress,
          }
        : null
      const prev = transitRef.current
      const changed = (next === null) !== (prev === null)
        || (next && prev && (next.inProgress !== prev.inProgress
          || Math.abs(next.seconds - prev.seconds) >= 0.5
          || Math.abs(next.peakAt - prev.peakAt) > 1))
      if (changed) {
        transitRef.current = next
        onTransit(next)
      }
    }
  })

  const selectBody = (view: SceneView) => {
    setHovered(false)
    onSelect(view)
  }
  const planetEvents = (id: PlanetId) => overview ? {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      if (event.delta <= 5) selectBody(id)
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
        selectBody('star')
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
        <Planet reducedMotion={reducedMotion} timeScale={timeScale} showMoonLabel={overview} locale={locale} timeRef={orbitTime} moonWorldRef={moonWorld} />
      </group>
      <group ref={(node) => { groupRefs.current.cinder = node }} position={initialPositions[1]} {...planetEvents('cinder')}>
        <Cinder reducedMotion={reducedMotion} timeScale={timeScale} />
      </group>
      <group ref={(node) => { groupRefs.current.vesper = node }} position={initialPositions[2]} {...planetEvents('vesper')}>
        <Vesper reducedMotion={reducedMotion} timeScale={timeScale} />
      </group>
      <CameraRig
        initialView={initialView}
        initialPose={initialPose}
        reducedMotion={reducedMotion}
        destination={destination}
        onArrive={onArrive}
        sharePose={onSharePose}
        timeRef={orbitTime}
        moonWorldRef={moonWorld}
      />
      {overview && <SystemOverview onSelect={selectBody} timeRef={orbitTime} locale={locale} />}
      <SceneReady onReady={onReady} />
      <EffectComposer multisampling={0} enabled={!lowEnd}>
        <ComposerCapture />
        {lowEnd ? null : (
          <>
            <Bloom
              mipmapBlur
              intensity={0.7}
              luminanceThreshold={0.72}
              luminanceSmoothing={0.32}
            />
            <Vignette offset={0.2} darkness={0.58} />
          </>
        )}
      </EffectComposer>
    </>
  )
}
