import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { type SceneView } from '../planets'
import { planetPosition } from '../orbits'
import { cometPosition } from '../comet'
import {
  clampPose,
  computeOverviewPose,
  FLIGHT_DURATION,
  INTRO_DURATION,
  nearestFlightBody,
  orbitOffset,
  OVERVIEW_MAX_ZOOM,
  OVERVIEW_MIN_ZOOM,
  pinchZoom,
  rotateOverviewPose,
  shiftIntoFrame,
  stepFreeFlight,
  viewZoomBounds,
  type CameraPose,
  type FlightBodyId,
  type FreeFlightInput,
  type FreeFlightState,
} from '../camera-math'

/** What the interface's flight HUD needs: the live speed and how far the
 * pilot is from the nearest surface, published at a calm throttle. */
export type FlightTelemetry = {
  speed: number
  nearestId: FlightBodyId
  nearestDistance: number
  boosting: boolean
}

type CameraRigProps = {
  initialView: SceneView
  initialPose?: CameraPose | null
  reducedMotion: boolean
  destination: SceneView
  /** Free-flight mode: the camera detaches from the bodies and flies by hand. */
  freeFlight: boolean
  onArrive: (view: SceneView) => void
  sharePose?: (view: SceneView, pose: CameraPose, time: number) => void
  /** Throttled free-flight readout for the HUD (null-capable consumers). */
  onFlightTelemetry?: (telemetry: FlightTelemetry) => void
  timeRef: { current: number }
  /** The moon's live world position, published by Planet every frame. */
  moonWorldRef: { current: Vector3 }
}

const MAX_STEP = 0.1
const SHARE_INTERVAL = 1.5
const FLIGHT_INFO_INTERVAL = 0.25
const BASE_FOV = 36

/** Free-flight tuning: system scale runs from the 8.4-unit star out to the
 * overview framing, so the bounds keep the camera off the star's surface and
 * inside a comfortable sphere. */
const FREE_FLIGHT_PARAMS = {
  accel: 16,
  damping: 2.6,
  maxSpeed: 13,
  minRadius: 9.5,
  maxRadius: 65,
  lookRate: 7,
  boost: 3,
}

/**
 * Screen-space framing for the small bodies, in half-frame fractions
 * (+x right, +y up). Unlike the planets' world-space compOffset this holds
 * the body on its side of the frame over the whole orbit.
 */
const SMALL_BODY_FRAMING = {
  comet: { x: 0.12, y: -0.31 },
  moon: { x: 0.25, y: -0.15 },
} as const

export function CameraRig({ initialView, initialPose, reducedMotion, destination, freeFlight, onArrive, sharePose, onFlightTelemetry, timeRef, moonWorldRef }: CameraRigProps) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const cameraRef = useThree((state) => state.camera)
  const overviewPose = useMemo(
    () => computeOverviewPose(size.width, size.height),
    [size.width, size.height],
  )
  const restored = useMemo(
    () => (initialPose ? clampPose(initialPose, initialView) : null),
    [initialPose, initialView],
  )
  const initial = useMemo(
    () => ({
      yaw: restored?.yaw ?? 0,
      pitch: restored?.pitch ?? 0,
      zoom: restored?.zoom ?? viewZoomBounds(initialView).distance,
    }),
    [restored, initialView],
  )
  const target = useRef({ ...initial })
  const current = useRef({ ...initial })
  const pointer = useRef({ x: 0, y: 0 })
  const drag = useRef({ active: false, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ startDistance: number; startZoom: number; lastDistance: number } | null>(null)
  const intro = useRef(reducedMotion ? 1 : 0)
  const orbitTime = useRef(0)
  const currentView = useRef<SceneView>(initialView)
  const requestedView = useRef<SceneView>(initialView)
  const lookAt = useRef(new Vector3())
  const scratch = useMemo(() => new Vector3(), [])
  const overviewRotated = useMemo(() => ({ position: new Vector3(), up: new Vector3() }), [])
  const overviewTarget = useRef({ yaw: 0, pitch: 0, zoom: 1 })
  const overviewCurrent = useRef({ yaw: 0, pitch: 0, zoom: 1 })
  const compOffset = useMemo(() => new Vector3(), [])
  const shareTimer = useRef(0)
  const sharedPose = useRef({ yaw: NaN, pitch: NaN, zoom: NaN })
  const flightInfoTimer = useRef(0)
  const flightInfoSent = useRef<FlightTelemetry | null>(null)
  const flight = useRef({
    active: false,
    elapsed: 0,
    startPosition: new Vector3(),
    startLook: new Vector3(),
    startUp: new Vector3(),
    endPosition: new Vector3(),
    endLook: new Vector3(),
    endUp: new Vector3(),
  })
  const free = useRef({
    active: false,
    keys: new Set<string>(),
    look: { yaw: 0, pitch: 0 },
    state: {
      position: new Vector3(),
      velocity: new Vector3(),
      yaw: 0,
      pitch: 0,
    } as FreeFlightState,
  })

  /** Shared journey initialization: destination changes and exiting free
   * flight both land here, so both reuse the same arc animation. */
  const startJourney = () => {
    const journey = flight.current
    journey.active = true
    journey.elapsed = 0
    journey.startPosition.copy((cameraRef as PerspectiveCamera).position)
    journey.startLook.copy(lookAt.current)
    journey.startUp.copy((cameraRef as PerspectiveCamera).up)
    const initialZoom = viewZoomBounds(destination).distance
    target.current = { yaw: 0, pitch: 0, zoom: initialZoom }
    current.current = { yaw: 0, pitch: 0, zoom: initialZoom }
    overviewTarget.current = { yaw: 0, pitch: 0, zoom: 1 }
    overviewCurrent.current = { yaw: 0, pitch: 0, zoom: 1 }
    pointer.current = { x: 0, y: 0 }
    pointers.current.clear()
    pinch.current = null
    drag.current.active = false
    intro.current = 1
    orbitTime.current = 0
    shareTimer.current = SHARE_INTERVAL
  }

  /** Nudge the free-flight velocity along the current view direction. */
  const freeThrust = (amount: number) => {
    const st = free.current.state
    const cosPitch = Math.cos(st.pitch)
    st.velocity.x += Math.sin(st.yaw) * cosPitch * amount
    st.velocity.y += Math.sin(st.pitch) * amount
    st.velocity.z += Math.cos(st.yaw) * cosPitch * amount
  }

  useEffect(() => {
    const element = gl.domElement

    const reset = () => {
      if (flight.current.active) return
      if (currentView.current === 'system') {
        overviewTarget.current = { yaw: 0, pitch: 0, zoom: 1 }
        return
      }
      target.current = { yaw: 0, pitch: 0, zoom: viewZoomBounds(currentView.current).distance }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (flight.current.active || (event.pointerType === 'mouse' && event.button !== 0)) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.current.size >= 2) {
        drag.current.active = false
        const [first, second] = [...pointers.current.values()]
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        pinch.current = {
          startDistance: distance,
          lastDistance: distance,
          startZoom: currentView.current === 'system'
            ? overviewTarget.current.zoom
            : target.current.zoom,
        }
        return
      }
      drag.current = { active: true, x: event.clientX, y: event.clientY }
      element.setPointerCapture(event.pointerId)
      element.focus({ preventScroll: true })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (flight.current.active) return
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1
      const tracked = pointers.current.get(event.pointerId)
      if (tracked) {
        tracked.x = event.clientX
        tracked.y = event.clientY
      }

      if (pointers.current.size >= 2 && pinch.current) {
        const [first, second] = [...pointers.current.values()]
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        if (free.current.active) {
          // In free flight a pinch is a thrust lever: spread to accelerate
          // along the view direction, close to brake backwards.
          const kick = (distance - pinch.current.lastDistance) * 0.02
          freeThrust(kick)
          pinch.current.lastDistance = distance
          return
        }
        if (currentView.current === 'system') {
          overviewTarget.current.zoom = pinchZoom(
            pinch.current.startZoom, pinch.current.startDistance, distance,
            OVERVIEW_MIN_ZOOM, OVERVIEW_MAX_ZOOM,
          )
        } else {
          const bounds = viewZoomBounds(currentView.current)
          target.current.zoom = pinchZoom(
            pinch.current.startZoom, pinch.current.startDistance, distance,
            bounds.min, bounds.max,
          )
        }
        return
      }
      if (!drag.current.active) return

      const dx = event.clientX - drag.current.x
      const dy = event.clientY - drag.current.y
      if (free.current.active) {
        free.current.look.yaw -= dx * 0.0032
        free.current.look.pitch += dy * 0.0022
      } else if (currentView.current === 'system') {
        overviewTarget.current.yaw = MathUtils.clamp(overviewTarget.current.yaw - dx * 0.0035, -Math.PI, Math.PI)
        overviewTarget.current.pitch = MathUtils.clamp(overviewTarget.current.pitch + dy * 0.0022, -0.6, 0.6)
      } else {
        target.current.yaw = MathUtils.clamp(target.current.yaw - dx * 0.0028, -0.32, 0.32)
        target.current.pitch = MathUtils.clamp(target.current.pitch + dy * 0.0022, -0.18, 0.18)
      }
      drag.current.x = event.clientX
      drag.current.y = event.clientY
    }

    const onPointerUp = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId)
      if (pointers.current.size < 2) pinch.current = null
      if (pointers.current.size === 1) {
        // resume rotating from the remaining finger instead of jumping
        const [rest] = pointers.current.values()
        drag.current = { active: true, x: rest.x, y: rest.y }
      } else {
        drag.current.active = false
      }
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (flight.current.active) return
      if (free.current.active) {
        freeThrust(-event.deltaY * 0.012)
        return
      }
      if (currentView.current === 'system') {
        overviewTarget.current.zoom = MathUtils.clamp(overviewTarget.current.zoom + event.deltaY * 0.0012, 0.7, 1.35)
        return
      }
      const bounds = viewZoomBounds(currentView.current)
      target.current.zoom = MathUtils.clamp(target.current.zoom + event.deltaY * 0.003, bounds.min, bounds.max)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (flight.current.active) return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) {
        event.preventDefault()
      }
      if (free.current.active) {
        // Look with the arrows; WASDQE are tracked on the window below.
        if (event.key === 'ArrowLeft') free.current.look.yaw += 0.06
        if (event.key === 'ArrowRight') free.current.look.yaw -= 0.06
        if (event.key === 'ArrowUp') free.current.look.pitch += 0.04
        if (event.key === 'ArrowDown') free.current.look.pitch -= 0.04
        return
      }
      if (event.key.toLowerCase() === 'r') reset()
      if (currentView.current === 'system') {
        if (event.key === 'ArrowLeft') overviewTarget.current.yaw += 0.12
        if (event.key === 'ArrowRight') overviewTarget.current.yaw -= 0.12
        if (event.key === 'ArrowUp') overviewTarget.current.pitch += 0.08
        if (event.key === 'ArrowDown') overviewTarget.current.pitch -= 0.08
        if (event.key === '+' || event.key === '=') overviewTarget.current.zoom += 0.08
        if (event.key === '-') overviewTarget.current.zoom -= 0.08
        overviewTarget.current.pitch = MathUtils.clamp(overviewTarget.current.pitch, -0.6, 0.6)
        overviewTarget.current.zoom = MathUtils.clamp(overviewTarget.current.zoom, 0.7, 1.35)
        return
      }
      if (event.key === 'ArrowLeft') target.current.yaw += 0.035
      if (event.key === 'ArrowRight') target.current.yaw -= 0.035
      if (event.key === 'ArrowUp') target.current.pitch -= 0.025
      if (event.key === 'ArrowDown') target.current.pitch += 0.025
      if (event.key === '+' || event.key === '=') target.current.zoom -= 0.25
      if (event.key === '-') target.current.zoom += 0.25
      target.current.yaw = MathUtils.clamp(target.current.yaw, -0.32, 0.32)
      target.current.pitch = MathUtils.clamp(target.current.pitch, -0.18, 0.18)
      const bounds = viewZoomBounds(currentView.current)
      target.current.zoom = MathUtils.clamp(target.current.zoom, bounds.min, bounds.max)
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('keydown', onKeyDown)
    window.addEventListener('aether:reset', reset)

    // Movement and boost keys ride on the window so free flight works without
    // first focusing the canvas; physical key codes ignore keyboard layouts.
    const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'])
    const onKeyDownMove = (event: KeyboardEvent) => {
      if (moveKeys.has(event.code)) free.current.keys.add(event.code)
    }
    const onKeyUpMove = (event: KeyboardEvent) => {
      free.current.keys.delete(event.code)
    }
    const onWindowBlur = () => {
      // A lost focus must not leave a stuck key thrusting forever.
      free.current.keys.clear()
    }
    window.addEventListener('keydown', onKeyDownMove)
    window.addEventListener('keyup', onKeyUpMove)
    window.addEventListener('blur', onWindowBlur)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('aether:reset', reset)
      window.removeEventListener('keydown', onKeyDownMove)
      window.removeEventListener('keyup', onKeyUpMove)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [gl])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_STEP)
    const camera = state.camera as PerspectiveCamera
    const compact = state.size.width < 700
    const aspect = state.size.width / Math.max(state.size.height, 1)
    const journey = flight.current
    const time = timeRef.current
    // Small bodies are framed in screen space (see SMALL_BODY_FRAMING); the
    // planets and the star keep their world-space composition offset.
    const framed = journey.active ? destination : currentView.current
    const small = framed === 'comet' || framed === 'moon'
    const screenFrame = small ? SMALL_BODY_FRAMING[framed] : null
    if (!small) {
      compOffset.set(compact ? -0.45 : -1.8, compact ? 1.3 : 0.5, 0)
    }

    if (destination !== requestedView.current) {
      requestedView.current = destination
      free.current.active = false
      startJourney()
    }

    // Entering free flight: detach exactly where the camera stands.
    if (freeFlight && !free.current.active && !journey.active) {
      free.current.active = true
      const st = free.current.state
      st.position.copy(camera.position)
      st.velocity.set(0, 0, 0)
      const dir = scratch.copy(lookAt.current).sub(camera.position).normalize()
      st.yaw = Math.atan2(dir.x, dir.z)
      st.pitch = Math.asin(MathUtils.clamp(dir.y, -1, 1))
      free.current.look.yaw = st.yaw
      free.current.look.pitch = st.pitch
      free.current.keys.clear()
    }
    // Leaving free flight without a new destination (Escape, the button):
    // fly the familiar arc back to the orbit we left.
    if (!freeFlight && free.current.active) {
      free.current.active = false
      startJourney()
    }

    if (journey.active) {
      journey.elapsed += delta
      const progress = reducedMotion ? 1 : Math.min(journey.elapsed / FLIGHT_DURATION, 1)
      const eased = progress * progress * (3 - 2 * progress)
      const arc = Math.sin(progress * Math.PI) ** 2
      if (destination === 'system') {
        journey.endLook.copy(overviewPose.target)
        journey.endPosition.copy(overviewPose.position)
        journey.endUp.copy(overviewPose.up)
      } else if (destination === 'star') {
        journey.endLook.copy(compOffset)
        orbitOffset(journey.endLook, 0, 0, viewZoomBounds(destination).distance + (compact ? 0.55 : 0), journey.endPosition)
        journey.endUp.set(0, 1, 0)
      } else {
        if (destination === 'comet') {
          cometPosition(time, journey.endLook)
        } else if (destination === 'moon') {
          journey.endLook.copy(moonWorldRef.current)
        } else {
          planetPosition(destination, time, journey.endLook)
        }
        if (!small) journey.endLook.add(compOffset)
        orbitOffset(journey.endLook, 0, 0, viewZoomBounds(destination).distance + (compact ? 0.55 : 0), journey.endPosition)
        journey.endUp.set(0, 1, 0)
        if (screenFrame) {
          shiftIntoFrame(journey.endLook, journey.endPosition, journey.endUp, screenFrame.x, screenFrame.y, BASE_FOV, aspect)
        }
      }
      camera.position.lerpVectors(journey.startPosition, journey.endPosition, eased)
      camera.position.y += arc * 2.8
      camera.position.z += arc * 10.5
      lookAt.current.lerpVectors(journey.startLook, journey.endLook, eased)
      camera.up.lerpVectors(journey.startUp, journey.endUp, eased).normalize()
      camera.lookAt(lookAt.current)
      camera.fov = 36 + arc * 8
      camera.updateProjectionMatrix()

      if (progress === 1) {
        journey.active = false
        currentView.current = destination
        onArrive(destination)
      }
      return
    }

    if (free.current.active) {
      const st = free.current.state
      const boosting = free.current.keys.has('ShiftLeft') || free.current.keys.has('ShiftRight')
      const input: FreeFlightInput = {
        forward: free.current.keys.has('KeyW'),
        back: free.current.keys.has('KeyS'),
        left: free.current.keys.has('KeyA'),
        right: free.current.keys.has('KeyD'),
        up: free.current.keys.has('KeyE'),
        down: free.current.keys.has('KeyQ'),
        boost: boosting,
      }
      stepFreeFlight(st, input, free.current.look, delta, FREE_FLIGHT_PARAMS)
      // Publish the HUD readout at a calm throttle, only when something
      // the pilot could notice has actually changed.
      if (onFlightTelemetry) {
        flightInfoTimer.current += delta
        if (flightInfoTimer.current >= FLIGHT_INFO_INTERVAL) {
          flightInfoTimer.current = 0
          const nearest = nearestFlightBody(st.position, moonWorldRef.current, time)
          const info: FlightTelemetry = {
            speed: st.velocity.length(),
            nearestId: nearest.id,
            nearestDistance: Math.max(nearest.distance, 0),
            boosting,
          }
          const prev = flightInfoSent.current
          if (!prev || prev.boosting !== info.boosting || prev.nearestId !== info.nearestId
            || Math.abs(info.speed - prev.speed) > 0.05
            || Math.abs(info.nearestDistance - prev.nearestDistance) > 0.05) {
            flightInfoSent.current = info
            onFlightTelemetry(info)
          }
        }
      }
      camera.position.copy(st.position)
      camera.up.set(0, 1, 0)
      const cosPitch = Math.cos(st.pitch)
      scratch.set(
        st.position.x + Math.sin(st.yaw) * cosPitch,
        st.position.y + Math.sin(st.pitch),
        st.position.z + Math.cos(st.yaw) * cosPitch,
      )
      lookAt.current.copy(scratch)
      camera.lookAt(lookAt.current)
      return
    }

    if (currentView.current === 'system') {
      overviewCurrent.current.yaw = MathUtils.damp(overviewCurrent.current.yaw, overviewTarget.current.yaw, 4, delta)
      overviewCurrent.current.pitch = MathUtils.damp(overviewCurrent.current.pitch, overviewTarget.current.pitch, 4, delta)
      overviewCurrent.current.zoom = MathUtils.damp(overviewCurrent.current.zoom, overviewTarget.current.zoom, 3, delta)
      rotateOverviewPose(overviewPose, overviewCurrent.current.yaw, overviewCurrent.current.pitch, overviewCurrent.current.zoom, overviewRotated)
      camera.position.copy(overviewRotated.position)
      camera.up.copy(overviewRotated.up)
      lookAt.current.copy(overviewPose.target)
      camera.lookAt(lookAt.current)
      return
    }

    intro.current = Math.min(1, intro.current + delta / INTRO_DURATION)
    orbitTime.current += delta
    // Share the settled orbit pose into the URL every so often so the address
    // bar can always be copied as a deep link to this exact framing. Parallax
    // and idle drift are intentionally not shared: they are transient.
    shareTimer.current += delta
    if (sharePose && shareTimer.current >= SHARE_INTERVAL) {
      shareTimer.current = 0
      const pose = { yaw: current.current.yaw, pitch: current.current.pitch, zoom: current.current.zoom }
      const last = sharedPose.current
      if (
        Math.abs(pose.yaw - last.yaw) > 0.004
        || Math.abs(pose.pitch - last.pitch) > 0.004
        || Math.abs(pose.zoom - last.zoom) > 0.05
      ) {
        sharedPose.current = { ...pose }
        sharePose(currentView.current, pose, timeRef.current)
      }
    }
    const introEase = 1 - Math.pow(1 - intro.current, 3)
    const drift = Math.min(orbitTime.current, 1)
    const clock = state.clock.elapsedTime
    const parallaxX = reducedMotion ? 0 : pointer.current.x
    const parallaxY = reducedMotion ? 0 : pointer.current.y
    const idleX = reducedMotion ? 0 : Math.sin(clock * 0.14) * 0.018 * drift
    const idleY = reducedMotion ? 0 : Math.cos(clock * 0.11) * 0.012 * drift

    current.current.yaw = MathUtils.damp(current.current.yaw, target.current.yaw, 4, delta)
    current.current.pitch = MathUtils.damp(current.current.pitch, target.current.pitch, 4, delta)
    current.current.zoom = MathUtils.damp(current.current.zoom, target.current.zoom, 3, delta)

    const distance = current.current.zoom + (compact ? 0.55 : 0) + (1 - introEase) * 2.4
    const yaw = current.current.yaw + parallaxX * 0.018 + idleX
    const pitch = current.current.pitch - parallaxY * 0.012 + idleY
    if (currentView.current === 'star') {
      scratch.set(0, 0, 0)
    } else if (currentView.current === 'comet') {
      cometPosition(time, scratch)
    } else if (currentView.current === 'moon') {
      scratch.copy(moonWorldRef.current)
    } else {
      planetPosition(currentView.current, time, scratch)
    }
    if (!small) scratch.add(compOffset)
    orbitOffset(scratch, yaw, pitch, distance, camera.position)
    if (screenFrame) {
      // Hold the small body on its side of the frame regardless of where it
      // is on its orbit.
      shiftIntoFrame(scratch, camera.position, camera.up, screenFrame.x, screenFrame.y, BASE_FOV, aspect)
    }
    camera.position.x += parallaxX * 0.06
    camera.position.y += parallaxY * 0.04
    lookAt.current.copy(scratch)
    camera.lookAt(lookAt.current)
  })

  return null
}
