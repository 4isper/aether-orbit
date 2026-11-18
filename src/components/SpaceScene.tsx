import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { Bloom, EffectComposer, EffectComposerContext, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { MathUtils, Vector3, type Group, type Scene } from 'three'
import { Backdrop } from './Backdrop'
import { Belt } from './Belt'
import { CameraRig } from './CameraRig'
import { Comet } from './Comet'
import { Erebus } from './Erebus'
import { Planet } from './Planet'
import { Star } from './Star'
import { Cinder } from './Cinder'
import { Vesper } from './Vesper'
import { Starfield } from './Starfield'
import { Meteors } from './Meteors'
import { Trojan } from './Trojan'
import { FlightMarkers } from './FlightMarkers'
import { SystemOverview } from './SystemOverview'
import { planetIds, type PlanetId, type SceneView } from '../planets'
import { planetPosition } from '../orbits'
import { nextEclipse, nextTransit, type TransitEvent } from '../eclipse'
import { nextConjunction } from '../conjunction'
import { nextPerihelion } from '../comet'
import { nextErebusPeriapsis } from '../erebus'
import { nextShower } from '../meteors'
import { nextStorm } from '../storms'
import { nextCyclone } from '../cyclone'
import { nextFlare } from '../flare'
import { listEphemerides, pastEphemerides, type EphemerisPayload, type EventKind } from '../ephemerides'
import type { CameraPose } from '../camera-math'
import type { FlightTelemetry } from './CameraRig'
import type { Locale } from '../strings'

function SceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const renderer = useThree((state) => state.gl)
  useEffect(() => {
    // A debug handle: console tools and probes can walk the live scene.
    (window as unknown as { __aetherScene?: Scene; __aetherCamera?: unknown }).__aetherScene = scene;
    (window as unknown as { __aetherCamera?: unknown }).__aetherCamera = camera;
    (window as unknown as { __aetherRenderer?: unknown }).__aetherRenderer = renderer
    return () => { (window as unknown as { __aetherScene?: Scene }).__aetherScene = undefined }
  }, [scene, camera])

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
  const size = useThree((state) => state.size)

  useEffect(() => {
    const capture = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name
      if (!name) return
      // Wallpaper quality: double the pixel ratio for this one frame — the
      // composer's buffers follow the drawing buffer, so the whole chain
      // renders supersampled. The ratio is capped so huge screens cannot
      // spike the framebuffer.
      const savedRatio = gl.getPixelRatio()
      const doubled = Math.min(savedRatio * 2, 3)
      try {
        gl.setPixelRatio(doubled)
        composer.setSize(size.width, size.height, false)
        composer.render()
        const link = document.createElement('a')
        link.download = name
        link.href = gl.domElement.toDataURL('image/png')
        link.click()
        // The logbook keeps a small copy of the same frame: drawn from the
        // fresh buffer before the ratio restore resizes (and clears) it.
        const thumb = document.createElement('canvas')
        const scale = 480 / gl.domElement.width
        thumb.width = 480
        thumb.height = Math.max(1, Math.round(gl.domElement.height * scale))
        const context = thumb.getContext('2d')
        if (context) {
          context.drawImage(gl.domElement, 0, 0, thumb.width, thumb.height)
          const thumbnail = thumb.toDataURL('image/webp', 0.75)
          if (thumbnail.startsWith('data:image/')) {
            window.dispatchEvent(new CustomEvent('aether:frame-captured', { detail: { thumbnail } }))
          }
        }
      } finally {
        gl.setPixelRatio(savedRatio)
        composer.setSize(size.width, size.height, false)
      }
    }
    window.addEventListener('aether:screenshot', capture)
    return () => window.removeEventListener('aether:screenshot', capture)
  }, [composer, gl, size.width, size.height])

  return null
}

/** What the interface needs to announce an event: which one, a countdown
 * and the absolute peak time the "skip to the moment" button seeks to. */
export type EventAnnouncement = {
  kind: EventKind
  seconds: number
  peakAt: number
  inProgress: boolean
}

/** Shape a scanned window into what the chip announces. */
function announce(kind: EventKind, event: TransitEvent | null, now: number): EventAnnouncement | null {
  if (!event) return null
  return {
    kind,
    seconds: event.inProgress ? 0 : Math.max(event.entry - now, 0),
    peakAt: event.peak,
    inProgress: event.inProgress,
  }
}

/** When a view holds several candidate moments, the one in progress or
 * starting first is the one worth the chip. */
function soonestMoment(moments: (EventAnnouncement | null)[]): EventAnnouncement | null {
  const candidates = moments.filter((moment): moment is EventAnnouncement => moment !== null)
  return candidates.reduce<EventAnnouncement | null>((best, moment) => {
    if (!best) return moment
    if (moment.inProgress !== best.inProgress) return moment.inProgress ? moment : best
    return moment.seconds < best.seconds ? moment : best
  }, null)
}

/**
 * The documentary pace: a close-up breathes at a fifth of a day per
 * second — one honest 24-hour turn in twenty seconds, the weather and
 * the moon drifting at a watchable gait — while the wide views run the
 * orbits at full speed. Presentation only: the ratios inside every pace
 * stay honest, this is the projector's gear box, not the sky's.
 */
const VIEW_PACE: Record<SceneView, number> = {
  aurelia: 0.05,
  cinder: 0.05,
  vesper: 0.05,
  erebus: 0.05,
  moon: 0.05,
  comet: 0.25,
  star: 0.25,
  belt: 1,
  system: 1,
}

/** The pilot's time dilation: the sky's fast moments — a transit, an
 * eclipse — last hours of honest time, so their windows ease to play for
 * about eighteen seconds of screen time at the view's own pace, whatever
 * the gear box says. Presentation only: the clock's ratios stay honest,
 * this is the projector's slow motion, not the sky's. */
const DILATION_TARGET_SECONDS = 18
const DILATION_MIN = 0.02
const DILATION_RAMP = 0.5
type DilationWindow = { view: SceneView; event: TransitEvent }

function dilationFactor(now: number, win: DilationWindow | null, pace: number): number {
  if (!win) return 1
  const { entry, exit } = win.event
  const a = entry - DILATION_RAMP
  const d = exit + DILATION_RAMP
  if (now < a || now > d) return 1
  const rampIn = MathUtils.smoothstep(now, a, entry)
  const rampOut = 1 - MathUtils.smoothstep(now, exit, d)
  const depth = Math.min(rampIn, rampOut)
  const scale = MathUtils.clamp((exit - entry) / (DILATION_TARGET_SECONDS * pace), DILATION_MIN, 1)
  return 1 - (1 - scale) * depth
}

/** One own event per view, each on the view where the sky actually shows
 * it: the transit shadow and the cyclone belong to Aurelia's orbit, the
 * eclipse darkens Nox, the periapsis flares on the comet, the conjunctions
 * line up on the views of the outer watcher (Cinder sees Vesper hide behind
 * Solis, Vesper sees Aurelia cross the disc). The worlds also own their
 * weather: the desert's dust storm and the ocean's cyclone compete with the
 * shadow moments, and the nearer one wins. */
function viewMoment(view: SceneView, now: number, cachedShadow: TransitEvent | null): EventAnnouncement | null {
  // The star owns its own outbursts: the flare is the one moment the star's
  // view announces, and its light touches every world at once.
  if (view === 'star') return announce('flare', nextFlare(now), now)
  if (view === 'comet') return announce('perihelion', nextPerihelion(now), now)
  // The dwarf's plunge past Vesper: rare, so the chip waits for it long.
  if (view === 'erebus') return announce('perihelion', nextErebusPeriapsis(now), now)
  // The transit and the eclipse moments ride the dilation's cached window:
  // the scan runs once per window, the chip reads it every frame.
  if (view === 'aurelia') {
    return soonestMoment([
      announce('transit', cachedShadow, now),
      announce('cyclone', nextCyclone(now), now),
    ])
  }
  if (view === 'moon') return announce('eclipse', cachedShadow, now)
  if (view === 'cinder') {
    return soonestMoment([
      announce('storm', nextStorm(now), now),
      announce('conjunction', nextConjunction(view, 'vesper', now), now),
    ])
  }
  if (view === 'vesper') return announce('conjunction', nextConjunction(view, 'aurelia', now), now)
  return null
}

/** The chip's moment: the view's own sky plus the shower — the one sky
 * event that rains on every view — and the nearer of them wins. */
function sceneEvent(view: SceneView, now: number, cachedShadow: TransitEvent | null): EventAnnouncement | null {
  return soonestMoment([
    viewMoment(view, now, cachedShadow),
    announce('shower', nextShower(now), now),
  ])
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
  onEphemeris?: (payload: EphemerisPayload) => void
  /** A frame was just captured: the logbook entry needs the moment it shows,
   * which only this scene's clock knows. */
  onFrameCaptured?: (frame: { time: number; thumbnail: string }) => void
  onFlightTelemetry?: (telemetry: FlightTelemetry) => void
}

export function SpaceScene({ activeView, destination, initialView, initialPose, initialTime, timeScale, locale, reducedMotion, lowEnd = false, freeFlight, onReady, onArrive, onSharePose, onSelect, onEvent, onEphemeris, onFrameCaptured, onFlightTelemetry }: SpaceSceneProps) {
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
  // The dilation window caches the view's next shadow moment: scanned once,
  // checked every frame, rescanned only after it passes, the view changes or
  // a seek moves the clock.
  const dilation = useRef<DilationWindow | null>(null)
  const dilationScanAt = useRef(-1)
  // The ephemerides panel reads the schedule while it is open: the interface
  // turns it on and off, the scene casts it on its own clock.
  const ephemerisWanted = useRef(false)
  const onEphemerisRef = useRef(onEphemeris)
  useEffect(() => {
    onEphemerisRef.current = onEphemeris
  })
  const onFrameCapturedRef = useRef(onFrameCaptured)
  useEffect(() => {
    onFrameCapturedRef.current = onFrameCaptured
  })

  useEffect(() => {
    // The capture's small copy: pair it with the moment on this scene's
    // shared clock, the one field nobody else holds.
    const onFrameCaptured = (event: Event) => {
      const thumbnail = (event as CustomEvent<{ thumbnail?: string }>).detail?.thumbnail
      if (thumbnail) onFrameCapturedRef.current?.({ time: orbitTime.current, thumbnail })
    }
    window.addEventListener('aether:frame-captured', onFrameCaptured)
    return () => window.removeEventListener('aether:frame-captured', onFrameCaptured)
  }, [])
  const emitEphemeris = useCallback(() => {
    const now = orbitTime.current
    onEphemerisRef.current?.({ now, entries: listEphemerides(now), past: pastEphemerides(now) })
  }, [])

  useEffect(() => {
    // "Skip to the moment": jump the shared simulation clock. Everything
    // derived from it (orbits, moon phases, the comet) is deterministic and
    // lands on the requested instant exactly.
    const onSeek = (event: Event) => {
      const time = (event as CustomEvent<{ time?: number }>).detail?.time
      if (Number.isFinite(time)) {
        orbitTime.current = time as number
        // The dilation's cached window belongs to the old moment: recast.
        dilation.current = null
        // The panel's countdowns measure from the clock it knows: a jump
        // recasts the schedule at once.
        if (ephemerisWanted.current) emitEphemeris()
      }
    }
    // The time scrub's jog wheel: relative nudges around the current moment,
    // so the interface never needs the absolute clock to scrub. The URL
    // share picks the new moment up in CameraRig, which owns the pose.
    const onScrub = (event: Event) => {
      const delta = (event as CustomEvent<{ delta?: number }>).detail?.delta
      if (Number.isFinite(delta)) orbitTime.current += delta as number
    }
    // The ephemerides panel asks the scene for its schedule; opening casts
    // it at once, closing only stills the once-per-second recast.
    const onEphemerisToggle = (event: Event) => {
      const open = (event as CustomEvent<{ open?: boolean }>).detail?.open
      ephemerisWanted.current = Boolean(open)
      if (open) emitEphemeris()
    }
    window.addEventListener('aether:seek', onSeek)
    window.addEventListener('aether:scrub', onScrub)
    window.addEventListener('aether:ephemeris', onEphemerisToggle)
    return () => {
      window.removeEventListener('aether:seek', onSeek)
      window.removeEventListener('aether:scrub', onScrub)
      window.removeEventListener('aether:ephemeris', onEphemerisToggle)
    }
  }, [emitEphemeris])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    // The dilation reads the cached window and eases the clock through the
    // moment; the window itself is rescanned only when it is gone past.
    const pace = VIEW_PACE[activeView] ?? 1
    const factor = dilationFactor(orbitTime.current, dilation.current, pace)
    if (!reducedMotion) orbitTime.current += delta * timeScale * pace * factor
    if (!dilation.current || dilation.current.view !== activeView
      || orbitTime.current > dilation.current.event.exit + DILATION_RAMP) {
      const wall = state.clock.elapsedTime
      if (wall - dilationScanAt.current > 0.3) {
        dilationScanAt.current = wall
        const now = orbitTime.current
        if (activeView === 'aurelia') {
          const ev = nextTransit(now)
          dilation.current = ev ? { view: activeView, event: ev } : null
        } else if (activeView === 'moon') {
          const ev = nextEclipse(now)
          dilation.current = ev ? { view: activeView, event: ev } : null
        } else {
          dilation.current = null
        }
      }
    }
    for (const id of planetIds) {
      groupRefs.current[id]?.position.copy(planetPosition(id, orbitTime.current, scratch))
    }

    // Announce the active view's event at a calm one-update-per-second pace;
    // a view change announces immediately so the chip switches without lag.
    // The open ephemerides panel recasts its schedule on the same cadence.
    eventTimer.current += delta
    if (eventTimer.current >= 1 || lastEventView.current !== activeView) {
      eventTimer.current = 0
      lastEventView.current = activeView
      if (onEvent) {
        // The shadow moment rides the dilation's cached window: the scan
        // runs once per window, the chip reads it every frame.
        const shadow = dilation.current && dilation.current.view === activeView ? dilation.current.event : null
        const next = sceneEvent(activeView, orbitTime.current, shadow)
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
      if (ephemerisWanted.current) emitEphemeris()
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
      {/* Meteors are motion — the reduced-motion promise means none at all. */}
      {!reducedMotion && <Meteors timeRef={orbitTime} />}
      <Belt timeRef={orbitTime} />
      <Trojan timeRef={orbitTime} trail={false} />
      <Trojan timeRef={orbitTime} trail />
      <Comet timeRef={orbitTime} />
      <group {...starEvents}>
        <Star timeRef={orbitTime} />
      </group>
      <group ref={(node) => { groupRefs.current.aurelia = node }} position={initialPositions[0]} {...planetEvents('aurelia')}>
        <Planet reducedMotion={reducedMotion} showMoonLabel={false} locale={locale} timeRef={orbitTime} moonWorldRef={moonWorld} />
      </group>
      <group ref={(node) => { groupRefs.current.cinder = node }} position={initialPositions[1]} {...planetEvents('cinder')}>
        <Cinder reducedMotion={reducedMotion} timeRef={orbitTime} />
      </group>
      <group ref={(node) => { groupRefs.current.vesper = node }} position={initialPositions[2]} {...planetEvents('vesper')}>
        <Vesper reducedMotion={reducedMotion} timeRef={orbitTime} />
      </group>
      <Erebus reducedMotion={reducedMotion} timeRef={orbitTime} />
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
      {/* The sky rides the camera: mounted after the rig, so its per-frame
        * follow reads the frame's final camera pose with no one-frame lag. */}
      <Backdrop />
      <Starfield reducedMotion={reducedMotion} timeRef={orbitTime} />
      {/* Names in the void: only while the pilot is detached and flying. */}
      {freeFlight && (
        <FlightMarkers
          timeRef={orbitTime}
          moonWorldRef={moonWorld}
          locale={locale}
          flight={freeFlight}
          onAutopilot={(id) => window.dispatchEvent(new CustomEvent('aether:autopilot', { detail: { id } }))}
        />
      )}
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
            {/* The composer turns the renderer's own tone mapping off while
             * the scene renders — without this pass the ACES curve the
             * materials were written for never runs, and the exposure knob
             * is dead. The chain closes with the tone mapping. */}
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </>
        )}
      </EffectComposer>
    </>
  )
}
