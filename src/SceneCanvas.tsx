import { useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace, type WebGLRenderer } from 'three'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { SpaceScene } from './components/SpaceScene'
import type { SceneView } from './planets'

const MIN_DPR = 0.85
const MAX_DPR = 1.75

function getMaxDpr() {
  return Math.max(MIN_DPR, Math.min(window.devicePixelRatio, MAX_DPR))
}

type SceneCanvasProps = {
  label: string
  activeView: SceneView
  destination: SceneView
  initialView: SceneView
  timeScale: number
  reducedMotion: boolean
  onReady: () => void
  onArrive: (view: SceneView) => void
  onSelect: (view: SceneView) => void
}

export default function SceneCanvas({
  label,
  activeView,
  destination,
  initialView,
  timeScale,
  reducedMotion,
  onReady,
  onArrive,
  onSelect,
}: SceneCanvasProps) {
  const [dpr, setDpr] = useState(getMaxDpr)
  const [lowEnd, setLowEnd] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const handleQualityChange = useCallback(({ factor }: { factor: number }) => {
    const nextDpr = MIN_DPR + (getMaxDpr() - MIN_DPR) * factor
    setDpr(Math.round(nextDpr * 20) / 20)
    // Hysteresis: drop the expensive postprocessing below 0.35, restore it
    // only above 0.5 so the toggle cannot flicker around one threshold.
    setLowEnd((prev) => (prev ? factor > 0.5 : factor < 0.35))
  }, [])
  const handleCreated = useCallback(({ gl }: { gl: WebGLRenderer }) => {
    gl.domElement.tabIndex = 0
    gl.toneMapping = ACESFilmicToneMapping
    gl.toneMappingExposure = 1.1
    gl.outputColorSpace = SRGBColorSpace
    gl.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      setContextLost(true)
    })
    gl.domElement.addEventListener('webglcontextrestored', () => setContextLost(false))
  }, [])

  return (
    <>
      <Canvas
        aria-label={label}
        camera={{ position: [0, 0, 11.4], fov: 36, near: 0.1, far: 160 }}
        dpr={dpr}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={handleCreated}
      >
      <SceneErrorBoundary>
        <PerformanceMonitor
          factor={1}
          step={0.2}
          iterations={8}
          ms={250}
          threshold={0.75}
          bounds={(refreshRate) => (refreshRate > 100 ? [50, 100] : [42, 56])}
          onChange={handleQualityChange}
        >
          <SpaceScene
            activeView={activeView}
            destination={destination}
            initialView={initialView}
            timeScale={timeScale}
            reducedMotion={reducedMotion}
            lowEnd={lowEnd}
            onReady={onReady}
            onArrive={onArrive}
            onSelect={onSelect}
          />
        </PerformanceMonitor>
      </SceneErrorBoundary>
      </Canvas>
      {contextLost && (
        <div className="webgl-fallback webgl-fallback--overlay" role="alert">
          <div className="webgl-fallback-inner">
            <h2>Контекст WebGL потерян</h2>
            <p>Перезагрузите страницу, чтобы вернуть сцену. Если проблема повторяется — обновите видеодрайвер.</p>
          </div>
        </div>
      )}
    </>
  )
}
