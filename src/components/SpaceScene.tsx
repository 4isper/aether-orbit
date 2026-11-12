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
import { Meteors } from './Meteors'
import { Trojan } from './Trojan'
import { SystemOverview } from './SystemOverview'
import { planetIds, type PlanetId, type SceneView } from '../planets'
import { planetPosition } from '../orbits'
import { nextEclipse, nextTransit } from '../eclipse'
import { nextConjunction } from '../conjunction'
import { nextPerihelion } from '../comet'
import type { CameraPose } from '../camera-math'
import type { FlightTelemetry } from './CameraRig'
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

/** What the interface needs to announce an event: which one, a countdown
 * and the absolute peak time the "skip to the moment" button seeks to. */
export type EventKind = 'transit' | 'eclipse' | 'perihelion' | 'conjunction'
export type EventAnnouncement = {
  kind: EventKind
  seconds: number
  peakAt: number
  inProgress: boolean
}

/** One event per view, each on the view where the sky actually shows it:
 * the transit shadow belongs to Aurelia's orbit, the eclipse darkens Nox,
 * the periapsis flares on the comet, the conjunctions line up on the views
 * of the outer watcher (Cinder sees Vesper hide behind Solis, Vesper sees
 * Aurelia cross the disc). */
function sceneEvent(view: SceneView, now: number): EventAnnouncement | null {
  const shadowEvent = view === 'aurelia'
    ? nextTransit(now)
    : view === 'moon'
      ? nextEclipse(now)
      : null
  if (shadowEvent) {
    return {
      kind: view === 'aurelia' ? 'transit' : 'eclipse',
      seconds: shadowEvent.inProgress ? 0 : Math.max(shadowEvent.entry - now, 0),
      peakAt: shadowEvent.peak,
      inProgress: shadowEvent.inProgress,
    }
  }
  if (view === 'comet') {
    const event = nextPerihelion(now)
    return {
      kind: 'perihelion',
      seconds: event.inProgress ? 0 : Math.max(event.entry - now, 0),
      peakAt: event.peak,
      inProgress: event.inProgress,
    }
  }
  if (view === 'cinder' || view === 'vesper') {
    const target = view === 'cinder' ? 'vesper' : 'aurelia'
    const event = nextConjunction(view, target, now)
    if (event) {
      return {
        kind: 'conjunction',
        seconds: event.inProgress ? 0 : Math.max(event.entry - now, 0),
        peakAt: event.peak,
        inProgress: event.inProgress,
      }
    }
  }
  return null
}

type SpaceSceneProps = {
  activeView: SceneView
  destination: SceneView
  initialView: SceneView
  initialPose?: CameraPose | null
  /** Restored shared moment: the deep-linked t= parameter, seconds on the
   * deterministic clock. Everything derived from the clock lands on it. */
  initialTime?: number | null
  timeScale: number
  locale: Locale
  reducedMotion: boolean
  lowEnd?: boolean
  freeFlight: boolean
  onReady: () => void
  onArrive: (view: SceneView) => void
  onSharePose: (view: SceneView, pose: CameraPose, time: number) => void
  onSelect: (view: SceneView) => void
  onEvent?: (announcement: EventAnnouncement | null) => void
  onFlightTelemetry?: (telemetry: FlightTelemetry) => void
}

export function SpaceScene({ activeView, destination, initialView, initialPose, initialTime, timeScale, locale, reducedMotion, lowEnd = false, freeFlight, onReady, onArrive, onSharePose, onSelect, onEvent, onFlightTelemetry }: SpaceSceneProps) {
  const gl = useThree((state) => state.gl)
  const [hovered, setHovered] = useState(false)
  const travelling = activeView !== destination
  const overview = activeView === 'system' && !travelling
  useCursor(overview && hovered, 'pointer', travelling ? 'progress' : overview ? 'default' : 'grab', gl.domElement)

  const orbitTime = useRef(initialTime ?? 0)
  const moonWorld = useRef(new Vector3())
  const groupRefs = useRef<Record<PlanetId, Group | null>>({ aurelia: null, cinder: null, vesper: null })
  const scratch = useMemo(() => new Vector3(), [])
  const initialPositions = useMemo(
    () => planetIds.map((id) => planetPosition(id, 0, new Vector3()).toArray() as [number, number, number]),
    [],
  )
  const eventTimer = useRef(0)
  const lastEventView = useRef(initialView)
  const eventRef = useRef<EventAnnouncement | null>(null)

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

    // Announce the active view's event at a calm one-update-per-second pace;
    // a view change announces immediately so the chip switches without lag.
    eventTimer.current += delta
    if (onEvent && (eventTimer.current >= 1 || lastEventView.current !== activeView)) {
      eventTimer.current = 0
      lastEventView.current = activeView
      const next = sceneEvent(activeView, orbitTime.current)
      const prev = eventRef.current
      const changed = (next === null) !== (prev === null)
        || (next && prev && (next.kind !== prev.kind
          || next.inProgress !== prev.inProgress
          || Math.abs(next.seconds - prev.seconds) >= 0.5
          || Math.abs(next.peakAt - prev.peakAt) > 1))
      if (changed) {
        eventRef.current = next
        onEvent(next)
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
      {/* Meteors are motion — the reduced-motion promise means none at all. */}
      {!reducedMotion && <Meteors timeScale={timeScale} />}
      <Belt timeRef={orbitTime} />
      <Trojan timeRef={orbitTime} />
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
        <Vesper reducedMotion={reducedMotion} timeScale={timeScale} timeRef={orbitTime} />
      </group>
      <CameraRig
        initialView={initialView}
        initialPose={initialPose}
        reducedMotion={reducedMotion}
        destination={destination}
        freeFlight={freeFlight}
        onArrive={onArrive}
        sharePose={onSharePose}
        onFlightTelemetry={onFlightTelemetry}
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
