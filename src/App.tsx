import { Suspense, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { SpaceScene } from './components/SpaceScene'
import { planetIds, planets, starInfo, type SceneView } from './planets'
import './App.css'

const MIN_DPR = 0.85
const MAX_DPR = 1.75
const SPEEDS = [1, 2, 4, 0.5]

function getMaxDpr() {
  return Math.max(MIN_DPR, Math.min(window.devicePixelRatio, MAX_DPR))
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

function App() {
  const [ready, setReady] = useState(false)
  const [dpr, setDpr] = useState(getMaxDpr)
  const [activeView, setActiveView] = useState<SceneView>('aurelia')
  const [destination, setDestination] = useState<SceneView>('aurelia')
  const travelling = activeView !== destination
  const overview = activeView === 'system'
  const isStar = activeView === 'star'
  const body = overview ? null : isStar ? starInfo : planets[activeView]
  const currentName = body ? body.name : 'Система'
  const destinationName = destination === 'system'
    ? 'Система'
    : destination === 'star' ? starInfo.name : planets[destination].name
  const handleReady = useCallback(() => setReady(true), [])
  const handleArrive = useCallback((arrived: SceneView) => setActiveView(arrived), [])
  const travelTo = (next: SceneView) => {
    if (!ready || travelling || next === activeView) return
    setDestination(next)
  }
  const handleQualityChange = useCallback(({ factor }: { factor: number }) => {
    const nextDpr = MIN_DPR + (getMaxDpr() - MIN_DPR) * factor
    setDpr(Math.round(nextDpr * 20) / 20)
  }, [])
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const timeScale = paused ? 0 : speed
  const cycleSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])
  const resetView = () => window.dispatchEvent(new Event('aether:reset'))

  return (
    <main className={`experience ${ready ? 'is-ready' : ''} ${travelling ? 'is-travelling' : ''} ${overview ? 'is-system' : ''}`} data-view={activeView}>
      <div className="scene">
        <Canvas
          aria-label={travelling
            ? `Перелёт: ${currentName} — ${destinationName}`
            : body
              ? `${isStar ? 'Интерактивная сцена звезды' : 'Интерактивная сцена планеты'} ${body.label}. Перетаскивайте для вращения и используйте колесо для масштабирования.`
              : 'Обзор системы. Выберите мир или звезду нажатием на сферу или подпись.'}
          camera={{ position: [0, 0, 11.4], fov: 36, near: 0.1, far: 160 }}
          dpr={dpr}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.domElement.tabIndex = 0
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.1
            gl.outputColorSpace = SRGBColorSpace
          }}
        >
          <Suspense fallback={null}>
            <PerformanceMonitor
              factor={1}
              step={0.2}
              iterations={8}
              ms={250}
              threshold={0.75}
              bounds={(refreshRate) => (refreshRate > 100 ? [50, 100] : [42, 56])}
              onChange={handleQualityChange}
            >
              <SpaceScene activeView={activeView} destination={destination} timeScale={timeScale} onReady={handleReady} onArrive={handleArrive} onSelect={travelTo} />
            </PerformanceMonitor>
          </Suspense>
        </Canvas>
      </div>

      <div className="interface">
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
            className="planet-link planet-link--star"
            aria-pressed={isStar}
            aria-label={`Перелёт к звезде ${starInfo.name}`}
            disabled={!ready || travelling}
            onClick={() => travelTo('star')}
          >
            <span className="planet-dot" aria-hidden="true" />
            <span className="planet-number">{starInfo.code}</span>
            {starInfo.name}
          </button>
          {planetIds.map((id) => (
            <button
              key={id}
              type="button"
              className={`planet-link planet-link--${id}`}
              aria-pressed={activeView === id}
              aria-label={`Перелёт к планете ${planets[id].name}`}
              disabled={!ready || travelling}
              onClick={() => travelTo(id)}
            >
              <span className="planet-dot" aria-hidden="true" />
              <span className="planet-number">{planets[id].code}</span>
              {planets[id].name}
            </button>
          ))}
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
            className="time-button time-button--speed"
            aria-label={`Скорость времени ×${speed}`}
            disabled={!ready}
            onClick={cycleSpeed}
          >
            <span>Время</span>
            <strong>×{speed === 0.5 ? '½' : speed}</strong>
          </button>
        </div>

        <div className="flight-status" role="status" aria-live="polite" aria-atomic="true">
          {travelling ? (
            <><span>Межорбитальный перелёт</span><strong>{currentName} <span aria-hidden="true">→</span> {destinationName}</strong></>
          ) : (
            <span className="sr-only">{ready ? overview ? 'Обзор системы. Два мира доступны для исследования.' : `На орбите ${currentName}` : 'Формируем орбиту'}</span>
          )}
        </div>

        {body ? (
          <>
            <section className="intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
              <p className="eyebrow"><span />{body.name} / {activeView === 'star' ? 'Звезда системы' : activeView === 'cinder' ? 'Пустынный мир' : activeView === 'vesper' ? 'Газовый гигант' : 'Экзопланета'}</p>
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

            <button className="reset-view reveal" type="button" onClick={resetView} disabled={!ready || travelling} aria-label="Сбросить ракурс камеры">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4.8 8.2A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M4.8 3.8v4.4h4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Сбросить ракурс</span>
            </button>
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
    </main>
  )
}

export default App
