import { useCallback, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace, type WebGLRenderer } from 'three'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { SpaceScene, type EventAnnouncement } from './components/SpaceScene'
import type { EphemerisPayload } from './ephemerides'
import type { FlightTelemetry } from './components/CameraRig'
import { t } from './strings'
import type { SceneView } from './planets'
import type { CameraPose } from './camera-math'
import type { Locale } from './strings'

/** Drives the renderer's tone-mapping exposure: the pilot's brightness
 * preference lands on the one knob the whole frame obeys. */
function ExposureDrive({ exposure }: { exposure: number }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}

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
  initialPose?: CameraPose | null
  initialTime?: number | null
  /** A deep link's ?dpr= pin: hold the renderer at this resolution and let
   * the quality ladder sleep — the frame must match its address. */
  dprPin?: number | null
  exposure: number
  timeScale: number
  locale: Locale
  reducedMotion: boolean
  freeFlight: boolean
  onReady: () => void
  onArrive: (view: SceneView) => void
  onSharePose: (view: SceneView, pose: CameraPose, time: number) => void
  onSelect: (view: SceneView) => void
  onEvent?: (announcement: EventAnnouncement | null) => void
  onEphemeris?: (payload: EphemerisPayload) => void
  onFrameCaptured?: (frame: { time: number; thumbnail: string }) => void
  onFlightTelemetry?: (telemetry: FlightTelemetry) => void
}

export default function SceneCanvas({
  label,
  activeView,
  destination,
  initialView,
  initialPose,
  initialTime,
  dprPin = null,
  exposure,
  timeScale,
  locale,
  reducedMotion,
  freeFlight,
  onReady,
  onArrive,
  onSharePose,
  onSelect,
  onEvent,
  onEphemeris,
  onFrameCaptured,
  onFlightTelemetry,
}: SceneCanvasProps) {
  const [dpr, setDpr] = useState(() => dprPin ?? getMaxDpr())
  const [lowEnd, setLowEnd] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const handleQualityChange = useCallback(({ factor }: { factor: number }) => {
    // A pinned link holds its resolution: the ladder measures, but the frame
    // must match its address on every machine, every run.
    if (dprPin != null) return
    const nextDpr = MIN_DPR + (getMaxDpr() - MIN_DPR) * factor
    setDpr(Math.round(nextDpr * 20) / 20)
    // Hysteresis: drop the expensive postprocessing below 0.35, restore it
    // only above 0.5 so the toggle cannot flicker around one threshold.
    setLowEnd((prev) => (prev ? factor > 0.5 : factor < 0.35))
  }, [dprPin])
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
      <ExposureDrive exposure={exposure} />
      <SceneErrorBoundary locale={locale}>
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
            initialPose={initialPose}
            initialTime={initialTime}
            timeScale={timeScale}
            locale={locale}
            reducedMotion={reducedMotion}
            lowEnd={lowEnd}
            freeFlight={freeFlight}
            onReady={onReady}
            onArrive={onArrive}
            onSharePose={onSharePose}
            onSelect={onSelect}
            onEvent={onEvent}
            onEphemeris={onEphemeris}
            onFrameCaptured={onFrameCaptured}
            onFlightTelemetry={onFlightTelemetry}
          />
        </PerformanceMonitor>
      </SceneErrorBoundary>
      </Canvas>
      {contextLost && (
        <div className="webgl-fallback webgl-fallback--overlay" role="alert">
          <div className="webgl-fallback-inner">
            <h2>{t(locale, 'contextLostTitle')}</h2>
            <p>{t(locale, 'contextLostBody')}</p>
          </div>
        </div>
      )}
    </>
  )
}
