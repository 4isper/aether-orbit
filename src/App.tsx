import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { bodies, planetIds, type SceneView } from './planets'
import { parsePose, poseParams, type CameraPose } from './camera-math'
import { readStoredLocale, storeLocale, t, type Locale } from './strings'
import './App.css'

const SceneCanvas = lazy(() => import('./SceneCanvas'))

const SPEED_OPTIONS = [0.5, 1, 2, 4]
const TOUR_STOPS: SceneView[] = ['aurelia', 'cinder', 'vesper', 'comet', 'star', 'system']
const TOUR_DWELL_MS = 7000
const SCENE_VIEWS: SceneView[] = [...planetIds, 'star', 'comet', 'system']

/** Deep link support: ?view=vesper opens the scene already on that orbit. */
function readInitialView(): SceneView {
  const param = new URLSearchParams(window.location.search).get('view')
  return SCENE_VIEWS.includes(param as SceneView) ? (param as SceneView) : 'aurelia'
}

/** Deep link support: ?yaw=…&pitch=…&zoom=… restores the saved camera pose. */
function readInitialPose(): CameraPose | null {
  return parsePose(new URLSearchParams(window.location.search))
}

function urlFor(view: SceneView, pose?: CameraPose) {
  const suffix = pose ? `?${poseParams(pose)}` : ''
  if (view === 'aurelia') return suffix ? `/${suffix}` : '/'
  return pose ? `/?view=${view}&${poseParams(pose)}` : `/?view=${view}`
}

function formatSpeed(speed: number) {
  return speed === 0.5 ? '½' : String(speed)
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

function OrbitMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="20" cy="20" rx="17" ry="8.5" transform="rotate(-35 20 20)" stroke="currentColor" strokeWidth="1" />
      <circle cx="32.5" cy="10.5" r="1.8" fill="currentColor" />
    </svg>
  )
}

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

function App() {
  const [initialView] = useState(readInitialView)
  const [initialPose] = useState(readInitialPose)
  const [locale, setLocale] = useState<Locale>(readStoredLocale)
  const [ready, setReady] = useState(false)
  const [webglSupported] = useState(detectWebGLSupport)
  const [activeView, setActiveView] = useState<SceneView>(initialView)
  const [destination, setDestination] = useState<SceneView>(initialView)
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
    window.history.replaceState(null, '', urlFor(arrived))
  }, [])
  const handleSharePose = useCallback((view: SceneView, pose: CameraPose) => {
    window.history.replaceState(null, '', urlFor(view, pose))
  }, [])
  const travelTo = useCallback((next: SceneView) => {
    if (!ready) return
    setTour(false)
    if (travelling || next === activeView) return
    setDestination(next)
  }, [ready, travelling, activeView])
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [reversed, setReversed] = useState(false)
  const [tour, setTour] = useState(false)
  const [cinema, setCinema] = useState(false)
  const [tabVisible, setTabVisible] = useState(() => !document.hidden)
  const timeScale = paused ? 0 : reversed ? -speed : speed

  const toggleLocale = useCallback(() => {
    setLocale((value) => {
      const next: Locale = value === 'ru' ? 'en' : 'ru'
      storeLocale(next)
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = locale === 'ru'
      ? 'Aether — Тихая орбита'
      : 'Aether — The Quiet Orbit'
  }, [locale])
  const resetView = useCallback(() => window.dispatchEvent(new Event('aether:reset')), [])
  const saveFrame = useCallback(() => {
    // The scene renders the composed frame and reads it back itself: the
    // drawing buffer is not preserved between frames.
    window.dispatchEvent(new CustomEvent('aether:screenshot', {
      detail: { name: `aether-${activeView === 'system' ? 'system' : activeView}.png` },
    }))
  }, [activeView])
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(0)
  const shareFrame = useCallback(() => {
    // The address bar already carries the current view and camera pose, kept
    // fresh by the camera rig, so the URL alone is enough to reproduce a view.
    const url = window.location.href
    const markCopied = () => {
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2400)
    }
    if (navigator.canShare?.({ url })) {
      navigator.share({ url, title: document.title })
        .catch((error: unknown) => {
          if ((error as DOMException)?.name === 'AbortError') return
          navigator.clipboard?.writeText(url).then(markCopied).catch(() => {})
        })
    } else {
      navigator.clipboard?.writeText(url).then(markCopied).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    // H works on both layouts: latin H and Cyrillic Р sit on the same key.
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'h' || key === 'р') setCinema((value) => !value)
      if (event.key === 'Escape') setCinema(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!tour || !ready || travelling || !tabVisible) return
    const timer = window.setTimeout(() => {
      const index = TOUR_STOPS.indexOf(activeView)
      setDestination(TOUR_STOPS[(index + 1) % TOUR_STOPS.length])
    }, TOUR_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [tour, ready, travelling, activeView, tabVisible])

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
                    ? t(locale, isStar ? 'starSceneAria' : activeView === 'comet' ? 'cometSceneAria' : 'planetSceneAria', { name: body.copy[locale].label })
                    : t(locale, 'systemAria')}
              activeView={activeView}
              destination={destination}
              initialView={initialView}
              initialPose={initialPose}
              timeScale={timeScale}
                locale={locale}
                reducedMotion={reducedMotion}
                onReady={handleReady}
                onArrive={handleArrive}
                onSharePose={handleSharePose}
                onSelect={travelTo}
              />
            </Suspense>
          </SceneErrorBoundary>
        </div>
      )}

      <div className="interface" inert={(!webglSupported || cinema) || undefined}>
        <header className="topbar reveal">
          <div className="brand">
            <OrbitMark className="brand-mark" />
            <span>AETHER</span>
          </div>
          <div className="scene-status">
            <span className="status-dot" />
            <span>{travelling ? t(locale, 'inFlight') : overview ? t(locale, 'systemOverview') : t(locale, 'simActive')}</span>
            <span className="status-code">{body ? `SC—${body.code}` : 'SYS—01'}</span>
          </div>
          <button
            type="button"
            className="locale-toggle"
            aria-label={t(locale, 'localeSwitch')}
            onClick={toggleLocale}
          >
            <span className={locale === 'ru' ? 'is-active' : ''}>RU</span>
            <span className={locale === 'en' ? 'is-active' : ''}>EN</span>
          </button>
        </header>

        <nav className="planet-nav reveal" aria-label={t(locale, 'navLabel')} aria-busy={travelling}>
          <button
            type="button"
            className="planet-link system-link"
            aria-pressed={overview}
            aria-label={t(locale, 'systemOverview')}
            disabled={!ready || travelling}
            onClick={() => travelTo('system')}
          >
            <OrbitMark className="system-icon" />
            {t(locale, 'systemOverviewLabel')}
          </button>
          <button
            type="button"
            className="planet-link tour-link"
            aria-pressed={tour}
            aria-label={tour ? t(locale, 'tourStop') : t(locale, 'tourStart')}
            disabled={!ready}
            onClick={() => setTour((value) => !value)}
          >
            {t(locale, 'tour')}
          </button>
          <button
            type="button"
            className="planet-link planet-link--star"
            aria-pressed={isStar}
            aria-label={t(locale, 'flyToStar', { name: bodies.star.name })}
            disabled={!ready || travelling}
            onClick={() => travelTo('star')}
          >
            <span className="planet-dot" aria-hidden="true" />
            <span className="planet-number">{bodies.star.code}</span>
            {bodies.star.name}
          </button>
          {planetIds.map((id) => (
            <button
              key={id}
              type="button"
              className={`planet-link planet-link--${id}`}
              aria-pressed={activeView === id}
              aria-label={t(locale, 'flyToPlanet', { name: bodies[id].name })}
              disabled={!ready || travelling}
              onClick={() => travelTo(id)}
            >
              <span className="planet-dot" aria-hidden="true" />
              <span className="planet-number">{bodies[id].code}</span>
              {bodies[id].name}
            </button>
          ))}
          <button
            type="button"
            className="planet-link planet-link--comet"
            aria-pressed={activeView === 'comet'}
            aria-label={t(locale, 'flyToComet', { name: bodies.comet.name })}
            disabled={!ready || travelling}
            onClick={() => travelTo('comet')}
          >
            <span className="planet-dot" aria-hidden="true" />
            <span className="planet-number">{bodies.comet.code}</span>
            {bodies.comet.name}
          </button>
        </nav>

        <div className="time-controls reveal" role="group" aria-label={t(locale, 'timeControls')}>
          <button
            type="button"
            className="time-button"
            aria-pressed={paused}
            aria-label={paused ? t(locale, 'resume') : t(locale, 'pause')}
            disabled={!ready}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 1.4v9.2L10.2 6z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="2.4" y="1.8" width="2.4" height="8.4" fill="currentColor" />
                <rect x="7.2" y="1.8" width="2.4" height="8.4" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="time-button"
            aria-pressed={reversed}
            aria-label={reversed ? t(locale, 'unreverse') : t(locale, 'reverse')}
            disabled={!ready}
            onClick={() => setReversed((value) => !value)}
          >
            <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6.4 1.6v8.8L1.6 6z" fill="currentColor" />
              <path d="M11 1.6v8.8L6.2 6z" fill="currentColor" />
            </svg>
          </button>
          <div className="speed-group" role="group" aria-label={t(locale, 'speedGroup')}>
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className="time-button speed-option"
                aria-pressed={speed === option}
                aria-label={t(locale, 'speed', { value: formatSpeed(option) })}
                disabled={!ready}
                onClick={() => setSpeed(option)}
              >
                <strong>×{formatSpeed(option)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="flight-status" role="status" aria-live="polite" aria-atomic="true">
          {travelling ? (
            <><span>{t(locale, 'inFlight')}</span><strong>{currentName} <span aria-hidden="true">→</span> {destinationName}</strong></>
          ) : (
            <span className="sr-only">{ready ? overview ? t(locale, 'overviewHint') : t(locale, 'onOrbit', { name: currentName }) : t(locale, 'loader')}</span>
          )}
        </div>

        {body ? (
          <>
            <section className="intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
              <p className="eyebrow"><span />{body.name} / {activeView === 'star' ? t(locale, 'orbitOfStar') : activeView === 'cinder' ? t(locale, 'worldDesert') : activeView === 'vesper' ? t(locale, 'worldIce') : activeView === 'comet' ? t(locale, 'worldComet') : t(locale, 'worldExo')}</p>
              <h1 id="scene-title">
                <span>{body.copy[locale].title[0]}</span>
                <em>{body.copy[locale].title[1]}</em>
              </h1>
              <p className="intro-copy">
                {body.copy[locale].description[0]}<br />
                {body.copy[locale].description[1]}
              </p>
            </section>

            <aside className="telemetry reveal" aria-label={t(locale, 'bodyTelemetry')} aria-hidden={travelling}>
              <div className="telemetry-item">
                <span className="telemetry-label">{t(locale, 'radius')}</span>
                <strong>{body.radius} <small>{isStar ? 'R☉' : 'R⊕'}</small></strong>
              </div>
              <span className="telemetry-divider" />
              <div className="telemetry-item">
                <span className="telemetry-label">{body.copy[locale].metricLabel}</span>
                <strong>{body.metricValue} <small>{body.copy[locale].metricUnit}</small></strong>
              </div>
              <span className="telemetry-divider" />
              <div className="telemetry-item telemetry-item--facts">
                <span className="telemetry-label">{t(locale, 'observations')}</span>
                {body.copy[locale].facts.map((fact) => (
                  <span className="telemetry-fact" key={fact}>{fact}</span>
                ))}
              </div>
            </aside>

            <div className="control-hint reveal" aria-hidden="true">
              <svg viewBox="0 0 24 32" fill="none">
                <rect x="4.5" y="2.5" width="15" height="25" rx="7.5" stroke="currentColor" />
                <path d="M12 7v5" stroke="currentColor" strokeLinecap="round" />
              </svg>
              <div>
                <span>{t(locale, 'exploreOrbit')}</span>
                <small>{t(locale, 'exploreHint')}</small>
              </div>
            </div>

            <div className="view-actions reveal">
              <button className="reset-view" type="button" onClick={resetView} disabled={!ready || travelling} aria-label={t(locale, 'resetCamera')}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4.8 8.2A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M4.8 3.8v4.4h4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{t(locale, 'resetCameraShort')}</span>
              </button>
              <span className="view-actions-divider" aria-hidden="true" />
              <button className="reset-view" type="button" onClick={saveFrame} disabled={!ready} aria-label={t(locale, 'saveFrame')}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3.5" y="6" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M9 6l1.2-2h3.6L15 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{t(locale, 'saveFrameShort')}</span>
              </button>
              <span className="view-actions-divider" aria-hidden="true" />
              <button
                className="reset-view"
                type="button"
                onClick={shareFrame}
                disabled={!ready}
                aria-label={t(locale, copied ? 'linkCopied' : 'shareFrame')}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="17" cy="5.5" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="17" cy="18.5" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8.1 10.9l6.8-4M8.1 13.1l6.8 4" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                <span>{copied ? t(locale, 'linkCopied') : t(locale, 'shareFrameShort')}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <section className="system-intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
              <p className="eyebrow">{t(locale, 'threeWorlds')}</p>
              <h1 id="scene-title">{t(locale, 'systemOverview')}</h1>
              <p>{t(locale, 'choosePlanet')}</p>
            </section>
            <p className="system-note reveal" aria-hidden={travelling}>{t(locale, 'orbitsNote')}</p>
          </>
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
        </footer>
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
