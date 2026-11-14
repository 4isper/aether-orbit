import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { bodies, planetIds, type SceneView } from './planets'
import type { EventAnnouncement } from './components/SpaceScene'
import type { FlightTelemetry } from './components/CameraRig'
import { parsePose, type CameraPose } from './camera-math'
import { deepLinkUrl, parseTimeParam } from './deep-link'
import { loadSession, saveSession } from './session'
import { t } from './strings'
import { eventCueTransition, playEventCue, setBoost } from './audio'
import { BodyPanel } from './components/interface/BodyPanel'
import { eventLabel, formatDuration } from './components/interface/event-copy'
import { HelpDialog } from './components/interface/HelpDialog'
import { OrbitMark } from './components/interface/OrbitMark'
import { PlanetNav } from './components/interface/PlanetNav'
import { QrDialog } from './components/interface/QrDialog'
import { SystemPanel } from './components/interface/SystemPanel'
import { TimeControls } from './components/interface/TimeControls'
import { TopBar } from './components/interface/TopBar'
import { useAmbience } from './hooks/useAmbience'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useLocale } from './hooks/useLocale'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useShareLink } from './hooks/useShareLink'
import { useTabVisibility } from './hooks/useTabVisibility'
import { useTour } from './hooks/useTour'
import './App.css'

const SceneCanvas = lazy(() => import('./SceneCanvas'))

const SCENE_VIEWS: SceneView[] = [...planetIds, 'star', 'comet', 'moon', 'belt', 'erebus', 'system']

/** Deep link support: ?view=vesper opens the scene already on that orbit.
 * Without a named view the last session speaks: the visitor returns to
 * where they left off, like the locale and the ambience do. */
function readInitialView(): SceneView {
  const param = new URLSearchParams(window.location.search).get('view')
  if (SCENE_VIEWS.includes(param as SceneView)) return param as SceneView
  return loadSession(window.localStorage, SCENE_VIEWS)?.view ?? 'aurelia'
}

/** Deep link support: ?yaw=…&pitch=…&zoom=… restores the saved camera pose.
 * A pose only pairs with a restored view — a deep link that names a body
 * but no pose starts fresh, not with another body's framing. */
function readInitialPose(): CameraPose | null {
  const params = new URLSearchParams(window.location.search)
  const pose = parsePose(params)
  if (pose) return pose
  if (params.get('view')) return null
  return loadSession(window.localStorage, SCENE_VIEWS)?.pose ?? null
}

/** Deep link support: ?t=… restores the shared simulation moment, with the
 * same rule: only alongside a restored view. */
function readInitialTime(): number | null {
  const params = new URLSearchParams(window.location.search)
  const time = parseTimeParam(params)
  if (time !== null) return time
  if (params.get('view')) return null
  return loadSession(window.localStorage, SCENE_VIEWS)?.time ?? null
}

function detectWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      window.WebGLRenderingContext
        && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    )
  } catch {
    return false
  }
}

function App() {
  const [initialView] = useState(readInitialView)
  const [initialPose] = useState(readInitialPose)
  const [initialTime] = useState(readInitialTime)
  const { locale, toggleLocale } = useLocale()
  const [ready, setReady] = useState(false)
  const [webglSupported] = useState(detectWebGLSupport)
  const [activeView, setActiveView] = useState<SceneView>(initialView)
  const [destination, setDestination] = useState<SceneView>(initialView)
  const [event, setEvent] = useState<EventAnnouncement | null>(null)
  const reducedMotion = useReducedMotion()
  const travelling = activeView !== destination
  const overview = activeView === 'system'
  const isStar = activeView === 'star'
  const body = activeView === 'system' ? null : bodies[activeView]
  const currentName = body ? body.name : t(locale, 'systemOverview')
  const destinationName = destination === 'system'
    ? t(locale, 'systemOverview')
    : bodies[destination].name
  const handleReady = useCallback(() => setReady(true), [])
  const handleArrive = useCallback((arrived: SceneView) => {
    setActiveView(arrived)
    window.history.replaceState(null, '', deepLinkUrl(arrived))
    // The session remembers the view the moment the camera lands.
    saveSession(window.localStorage, { view: arrived })
  }, [])
  // The last shared framing, so "jump to the event" can keep it in the URL.
  const poseRef = useRef<CameraPose | null>(initialPose)
  const handleSharePose = useCallback((view: SceneView, pose: CameraPose, time: number) => {
    poseRef.current = pose
    window.history.replaceState(null, '', deepLinkUrl(view, pose, time))
    // The session remembers the framing and the moment at the same cadence.
    saveSession(window.localStorage, { pose, time })
  }, [])
  const [flightInfo, setFlightInfo] = useState<FlightTelemetry | null>(null)
  const handleFlightTelemetry = useCallback((telemetry: FlightTelemetry) => {
    setFlightInfo(telemetry)
  }, [])
  const announcedRef = useRef<EventAnnouncement | null>(null)
  const handleEvent = useCallback((announcement: EventAnnouncement | null) => {
    // The cue belongs to the moment a window begins, not to the chip's
    // once-per-second re-announcements (eventCueTransition is the judge).
    if (eventCueTransition(announcedRef.current, announcement)) playEventCue()
    announcedRef.current = announcement
    setEvent(announcement)
  }, [])
  const seekToEvent = useCallback(() => {
    if (!event) return
    window.dispatchEvent(new CustomEvent('aether:seek', { detail: { time: event.peakAt } }))
    // The leap lands in the middle of the moment: let it be heard.
    playEventCue()
    // The address bar carries the jumped-to moment too, so a copy right after
    // the leap still reproduces the frame; the pose is the last shared one.
    window.history.replaceState(null, '', deepLinkUrl(activeView, poseRef.current, event.peakAt))
  }, [event, activeView])
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [reversed, setReversed] = useState(false)
  const { sound, toggleSound } = useAmbience()
  const [tour, setTour] = useState(false)
  const [freeFlight, setFreeFlight] = useState(false)
  const [cinema, setCinema] = useState(false)
  const [help, setHelp] = useState(false)
  const [qr, setQr] = useState(false)
  const tabVisible = useTabVisibility()
  const timeScale = paused ? 0 : reversed ? -speed : speed

  useEffect(() => {
    // The opening view is where the session resumes from: remember it right
    // away, even if the pilot never moves the camera (no arrival fires for
    // the view the page opened on).
    saveSession(window.localStorage, { view: initialView })
  }, [initialView])

  const travelTo = useCallback((next: SceneView) => {
    if (!ready) return
    setTour(false)
    // Navigation always ends free flight; the rig flies the usual arc there.
    setFreeFlight(false)
    if (travelling || next === activeView) return
    setDestination(next)
  }, [ready, travelling, activeView])

  // The boost hum follows the pilot's foot, not the render loop.
  const boosting = Boolean(freeFlight && flightInfo?.boosting)
  useEffect(() => {
    setBoost(boosting)
  }, [boosting])

  useKeyboardShortcuts({
    views: SCENE_VIEWS,
    travelTo,
    setPaused,
    setCinema,
    setHelp,
    setFreeFlight,
    setQr,
  })
  useTour({
    tour,
    ready,
    travelling,
    tabVisible,
    activeView,
    setDestination,
  })

  const resetView = useCallback(() => window.dispatchEvent(new Event('aether:reset')), [])
  // The time scrub's jog wheel: relative nudges land on the shared clock.
  const scrubTime = useCallback((delta: number) => {
    window.dispatchEvent(new CustomEvent('aether:scrub', { detail: { delta } }))
  }, [])
  const saveFrame = useCallback(() => {
    // The scene renders the composed frame and reads it back itself: the
    // drawing buffer is not preserved between frames.
    window.dispatchEvent(new CustomEvent('aether:screenshot', {
      detail: { name: `aether-${activeView === 'system' ? 'system' : activeView}.png` },
    }))
  }, [activeView])
  const { copied, shareLink } = useShareLink()

  return (
    <main
      className={`experience ${ready ? 'is-ready' : ''} ${travelling ? 'is-travelling' : ''} ${overview ? 'is-system' : ''} ${cinema ? 'is-cinema' : ''}`}
      data-view={activeView}
      data-reduced-motion={reducedMotion || undefined}
    >
      {webglSupported && (
        <div className="scene">
          <SceneErrorBoundary locale={locale}>
            <Suspense fallback={null}>
              <SceneCanvas
                label={travelling
                  ? t(locale, 'flightLabel', { from: currentName, to: destinationName })
                  : body
                    ? t(locale, isStar
                      ? 'starSceneAria'
                      : activeView === 'comet'
                        ? 'cometSceneAria'
                        : activeView === 'moon'
                          ? 'moonSceneAria'
                          : 'planetSceneAria', { name: body.copy[locale].label })
                    : t(locale, 'systemAria')}
                activeView={activeView}
                destination={destination}
                initialView={initialView}
                initialPose={initialPose}
                initialTime={initialTime}
                timeScale={timeScale}
                locale={locale}
                reducedMotion={reducedMotion}
                freeFlight={freeFlight}
                onReady={handleReady}
                onArrive={handleArrive}
                onSharePose={handleSharePose}
                onSelect={travelTo}
                onEvent={handleEvent}
                onFlightTelemetry={handleFlightTelemetry}
              />
            </Suspense>
          </SceneErrorBoundary>
        </div>
      )}

      <div className="interface" inert={(!webglSupported || cinema) || undefined}>
        <TopBar
          locale={locale}
          travelling={travelling}
          freeFlight={freeFlight}
          overview={overview}
          bodyCode={body ? body.code : null}
          onToggleLocale={toggleLocale}
        />
        <PlanetNav
          locale={locale}
          ready={ready}
          travelling={travelling}
          overview={overview}
          activeView={activeView}
          tour={tour}
          freeFlight={freeFlight}
          onTravel={travelTo}
          onToggleTour={() => setTour((value) => !value)}
          onToggleFreeFlight={() => {
            setTour(false)
            setFreeFlight((value) => !value)
          }}
        />
        <TimeControls
          locale={locale}
          ready={ready}
          paused={paused}
          speed={speed}
          reversed={reversed}
          sound={sound}
          onPause={() => setPaused((value) => !value)}
          onReverse={() => setReversed((value) => !value)}
          onSpeed={setSpeed}
          onToggleSound={toggleSound}
          onScrub={scrubTime}
        />

        <div className="flight-status" role="status" aria-live="polite" aria-atomic="true">
          {travelling ? (
            <><span>{t(locale, 'inFlight')}</span><strong>{currentName} <span aria-hidden="true">→</span> {destinationName}</strong></>
          ) : (
            <span className="sr-only">{ready ? overview ? t(locale, 'overviewHint') : t(locale, 'onOrbit', { name: currentName }) : t(locale, 'loader')}</span>
          )}
        </div>

        {freeFlight && flightInfo && (
          <div className="flight-hud" aria-hidden="true">
            <div>
              <span>{t(locale, 'hudSpeed')}</span>
              <strong>{flightInfo.speed.toFixed(1)} <small>{t(locale, 'hudUnit')}</small></strong>
            </div>
            <div>
              <span>{t(locale, 'hudNearest', { name: bodies[flightInfo.nearestId].name })}</span>
              <strong>{flightInfo.nearestDistance.toFixed(1)} <small>{t(locale, 'hudUnit')}</small></strong>
            </div>
            {flightInfo.boosting && <div className="flight-hud-boost">{t(locale, 'hudBoost')}</div>}
          </div>
        )}

        {body ? (
          <BodyPanel
            body={body}
            activeView={activeView}
            locale={locale}
            travelling={travelling}
            ready={ready}
            event={event}
            onSeekEvent={seekToEvent}
            onReset={resetView}
            onSaveFrame={saveFrame}
            onShare={shareLink}
            onQr={() => setQr(true)}
            copied={copied}
          />
        ) : (
          <SystemPanel locale={locale} travelling={travelling} ready={ready} event={event} onSeekEvent={seekToEvent} />
        )}

        <footer className="footer reveal">
          <span>Real-time experience</span>
          <span className="footer-line" />
          <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">
            Textures · Solar System Scope
          </a>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          <span>{body ? `${body.code} / ${body.name}` : 'SYS / Aether'}</span>
          <span className="footer-keys">{t(locale, 'shortcutsHint')} · 1–9 · Space · R · H · ?</span>
        </footer>
      </div>

      {help && <HelpDialog locale={locale} onClose={() => setHelp(false)} />}
      {qr && <QrDialog locale={locale} onClose={() => setQr(false)} />}

      {/* Cinema mode hides the interface, but the sky keeps talking: a quiet
        * toast carries the announcement until the moment ends. Lives outside
        * the inert interface, never takes a click. */}
      <div
        className={`cinema-toast ${cinema && event && !travelling ? 'is-visible' : ''}`}
        role="status"
        aria-hidden={!cinema || !event || travelling || undefined}
      >
        {event && (
          <>
            <span>{t(locale, eventLabel(event.kind, activeView))}</span>
            <strong>
              {event.inProgress
                ? t(locale, 'eventNow')
                : t(locale, 'eventIn', { time: formatDuration(event.seconds, locale) })}
            </strong>
          </>
        )}
      </div>

      <div className="loader" aria-hidden={ready}>
        <div className="loader-inner">
          <OrbitMark className="loader-mark" />
          <span>{t(locale, 'loader')}</span>
          <div className="loader-track"><span /></div>
        </div>
      </div>

      {!webglSupported && (
        <div className="webgl-fallback" role="alert">
          <div className="webgl-fallback-inner">
            <OrbitMark className="loader-mark" />
            <h2>{t(locale, 'webglTitle')}</h2>
            <p>{t(locale, 'webglBody')}</p>
            <p className="webgl-fallback-hint">
              {t(locale, 'webglHint')}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
