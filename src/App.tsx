import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { bodies, planetIds, type SceneView } from './planets'
import { parsePose, poseParams, type CameraPose } from './camera-math'
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
  const [ready, setReady] = useState(false)
  const [webglSupported] = useState(detectWebGLSupport)
  const [activeView, setActiveView] = useState<SceneView>(initialView)
  const [destination, setDestination] = useState<SceneView>(initialView)
  const reducedMotion = useReducedMotion()
  const travelling = activeView !== destination
  const overview = activeView === 'system'
  const isStar = activeView === 'star'
  const body = activeView === 'system' ? null : bodies[activeView]
  const currentName = body ? body.name : 'Система'
  const destinationName = destination === 'system'
    ? 'Система'
    : bodies[destination].name
  const handleReady = useCallback(() => setReady(true), [])
  const handleArrive = useCallback((arrived: SceneView) => {
    setActiveView(arrived)
    window.history.replaceState(null, '', urlFor(arrived))
  }, [])
  const handleSharePose = useCallback((view: SceneView, pose: CameraPose) => {
    window.history.replaceState(null, '', urlFor(view, pose))
  }, [])
  const travelTo = (next: SceneView) => {
    if (!ready) return
    setTour(false)
    if (travelling || next === activeView) return
    setDestination(next)
  }
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [reversed, setReversed] = useState(false)
  const [tour, setTour] = useState(false)
  const [cinema, setCinema] = useState(false)
  const [tabVisible, setTabVisible] = useState(() => !document.hidden)
  const timeScale = paused ? 0 : reversed ? -speed : speed
  const resetView = () => window.dispatchEvent(new Event('aether:reset'))
  const saveFrame = () => {
    // The scene renders the composed frame and reads it back itself: the
    // drawing buffer is not preserved between frames.
    window.dispatchEvent(new CustomEvent('aether:screenshot', {
      detail: { name: `aether-${activeView === 'system' ? 'system' : activeView}.png` },
    }))
  }

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
          <SceneErrorBoundary>
              <Suspense fallback={null}>
              <SceneCanvas
                label={travelling
                  ? `Перелёт: ${currentName} — ${destinationName}`
                  : body
                    ? `${isStar ? 'Интерактивная сцена звезды' : activeView === 'comet' ? 'Интерактивная сцена кометы' : 'Интерактивная сцена планеты'} ${body.label}. Перетаскивайте для вращения и используйте колесо для масштабирования.`
                    : 'Обзор системы. Выберите мир или звезду нажатием на сферу или подпись.'}
              activeView={activeView}
              destination={destination}
              initialView={initialView}
              initialPose={initialPose}
              timeScale={timeScale}
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
            <span>{travelling ? 'Межорбитальный перелёт' : overview ? 'Обзор системы' : 'Симуляция активна'}</span>
            <span className="status-code">{body ? `SC—${body.code}` : 'SYS—01'}</span>
          </div>
        </header>

        <nav className="planet-nav reveal" aria-label="Навигация по системе" aria-busy={travelling}>
          <button
            type="button"
            className="planet-link system-link"
            aria-pressed={overview}
            aria-label="Обзор системы"
            disabled={!ready || travelling}
            onClick={() => travelTo('system')}
          >
            <OrbitMark className="system-icon" />
            Обзор
          </button>
          <button
            type="button"
            className="planet-link tour-link"
            aria-pressed={tour}
            aria-label={tour ? 'Остановить тур по системе' : 'Автоматический тур по системе'}
            disabled={!ready}
            onClick={() => setTour((value) => !value)}
          >
            Тур
          </button>
          <button
            type="button"
            className="planet-link planet-link--star"
            aria-pressed={isStar}
            aria-label={`Перелёт к звезде ${bodies.star.name}`}
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
              aria-label={`Перелёт к планете ${bodies[id].name}`}
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
            aria-label={`Перелёт к комете ${bodies.comet.name}`}
            disabled={!ready || travelling}
            onClick={() => travelTo('comet')}
          >
            <span className="planet-dot" aria-hidden="true" />
            <span className="planet-number">{bodies.comet.code}</span>
            {bodies.comet.name}
          </button>
        </nav>

        <div className="time-controls reveal" role="group" aria-label="Управление временем">
          <button
            type="button"
            className="time-button"
            aria-pressed={paused}
            aria-label={paused ? 'Возобновить время' : 'Остановить время'}
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
            aria-label={reversed ? 'Вернуть обычный ход времени' : 'Обратить ход времени'}
            disabled={!ready}
            onClick={() => setReversed((value) => !value)}
          >
            <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6.4 1.6v8.8L1.6 6z" fill="currentColor" />
              <path d="M11 1.6v8.8L6.2 6z" fill="currentColor" />
            </svg>
          </button>
          <div className="speed-group" role="group" aria-label="Скорость времени">
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className="time-button speed-option"
                aria-pressed={speed === option}
                aria-label={`Скорость времени ×${formatSpeed(option)}`}
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
            <><span>Межорбитальный перелёт</span><strong>{currentName} <span aria-hidden="true">→</span> {destinationName}</strong></>
          ) : (
            <span className="sr-only">{ready ? overview ? 'Обзор системы. Три мира доступны для исследования.' : `На орбите ${currentName}` : 'Формируем орбиту'}</span>
          )}
        </div>

        {body ? (
          <>
            <section className="intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
              <p className="eyebrow"><span />{body.name} / {activeView === 'star' ? 'Звезда системы' : activeView === 'cinder' ? 'Пустынный мир' : activeView === 'vesper' ? 'Мини-нептун' : activeView === 'comet' ? 'Комета' : 'Экзопланета'}</p>
              <h1 id="scene-title">
                <span>{body.title[0]}</span>
                <em>{body.title[1]}</em>
              </h1>
              <p className="intro-copy">
                {body.description[0]}<br />
                {body.description[1]}
              </p>
            </section>

            <aside className="telemetry reveal" aria-label="Параметры небесного тела" aria-hidden={travelling}>
              <div className="telemetry-item">
                <span className="telemetry-label">Радиус</span>
                <strong>{body.radius} <small>{isStar ? 'R☉' : 'R⊕'}</small></strong>
              </div>
              <span className="telemetry-divider" />
              <div className="telemetry-item">
                <span className="telemetry-label">{body.metric[0]}</span>
                <strong>{body.metric[1]} <small>{body.metric[2]}</small></strong>
              </div>
              <span className="telemetry-divider" />
              <div className="telemetry-item telemetry-item--facts">
                <span className="telemetry-label">Наблюдения</span>
                {body.facts.map((fact) => (
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
                <span>Исследуйте орбиту</span>
                <small>Движение · масштаб · вращение</small>
              </div>
            </div>

            <div className="view-actions reveal">
              <button className="reset-view" type="button" onClick={resetView} disabled={!ready || travelling} aria-label="Сбросить ракурс камеры">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4.8 8.2A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M4.8 3.8v4.4h4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Сбросить ракурс</span>
              </button>
              <span className="view-actions-divider" aria-hidden="true" />
              <button className="reset-view" type="button" onClick={saveFrame} disabled={!ready} aria-label="Сохранить кадр как PNG">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3.5" y="6" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M9 6l1.2-2h3.6L15 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Сохранить кадр</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <section className="system-intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
              <p className="eyebrow">Aether / Три мира</p>
              <h1 id="scene-title">Обзор системы</h1>
              <p>Выберите планету, чтобы выйти на орбиту.</p>
            </section>
            <p className="system-note reveal" aria-hidden={travelling}>Орбиты вокруг звезды · Масштаб условный</p>
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
          <span>Формируем орбиту</span>
          <div className="loader-track"><span /></div>
        </div>
      </div>

      {!webglSupported && (
        <div className="webgl-fallback" role="alert">
          <div className="webgl-fallback-inner">
            <OrbitMark className="loader-mark" />
            <h2>WebGL недоступен</h2>
            <p>Сцена считается на вашем устройстве в реальном времени — для неё нужен WebGL2 или WebGL.</p>
            <p className="webgl-fallback-hint">
              Включите аппаратное ускорение в настройках браузера, обновите видеодрайвер и перезагрузите страницу.
            </p>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
