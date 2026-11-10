import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { type SceneView } from '../planets'
import { planetPosition } from '../orbits'
import {
  computeOverviewPose,
  MAX_ZOOM,
  MIN_ZOOM,
  FLIGHT_DURATION,
  INTRO_DURATION,
  orbitOffset,
  OVERVIEW_MAX_ZOOM,
  OVERVIEW_MIN_ZOOM,
  PLANET_VIEW_DISTANCE,
  pinchZoom,
  rotateOverviewPose,
  STAR_VIEW_DISTANCE,
} from '../camera-math'

type CameraRigProps = {
  initialView: SceneView
  reducedMotion: boolean
  destination: SceneView
  onArrive: (view: SceneView) => void
  timeRef: { current: number }
}

const MAX_STEP = 0.1

export function CameraRig({ initialView, reducedMotion, destination, onArrive, timeRef }: CameraRigProps) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const overviewPose = useMemo(
    () => computeOverviewPose(size.width, size.height),
    [size.width, size.height],
  )
  const target = useRef({ yaw: 0, pitch: 0, zoom: PLANET_VIEW_DISTANCE })
  const current = useRef({ yaw: 0, pitch: 0, zoom: PLANET_VIEW_DISTANCE })
  const pointer = useRef({ x: 0, y: 0 })
  const drag = useRef({ active: false, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ startDistance: number; startZoom: number } | null>(null)
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

  useEffect(() => {
    const element = gl.domElement

    const reset = () => {
      if (flight.current.active) return
      if (currentView.current === 'system') {
        overviewTarget.current = { yaw: 0, pitch: 0, zoom: 1 }
        return
      }
      target.current = { yaw: 0, pitch: 0, zoom: PLANET_VIEW_DISTANCE }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (flight.current.active || (event.pointerType === 'mouse' && event.button !== 0)) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.current.size >= 2) {
        drag.current.active = false
        const [first, second] = [...pointers.current.values()]
        pinch.current = {
          startDistance: Math.hypot(first.x - second.x, first.y - second.y),
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
        if (currentView.current === 'system') {
          overviewTarget.current.zoom = pinchZoom(
            pinch.current.startZoom, pinch.current.startDistance, distance,
            OVERVIEW_MIN_ZOOM, OVERVIEW_MAX_ZOOM,
          )
        } else {
          target.current.zoom = pinchZoom(
            pinch.current.startZoom, pinch.current.startDistance, distance,
            MIN_ZOOM, MAX_ZOOM,
          )
        }
        return
      }
      if (!drag.current.active) return

      const dx = event.clientX - drag.current.x
      const dy = event.clientY - drag.current.y
      if (currentView.current === 'system') {
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
      if (currentView.current === 'system') {
        overviewTarget.current.zoom = MathUtils.clamp(overviewTarget.current.zoom + event.deltaY * 0.0012, 0.7, 1.35)
        return
      }
      target.current.zoom = MathUtils.clamp(target.current.zoom + event.deltaY * 0.003, MIN_ZOOM, MAX_ZOOM)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (flight.current.active) return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) {
        event.preventDefault()
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
      target.current.zoom = MathUtils.clamp(target.current.zoom, MIN_ZOOM, MAX_ZOOM)
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('keydown', onKeyDown)
    window.addEventListener('aether:reset', reset)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('aether:reset', reset)
    }
  }, [gl])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_STEP)
    const camera = state.camera as PerspectiveCamera
    const compact = state.size.width < 700
    const journey = flight.current
    const time = timeRef.current
    compOffset.set(compact ? -0.45 : -1.8, compact ? 1.3 : 0.5, 0)

    if (destination !== requestedView.current) {
      requestedView.current = destination
      journey.active = true
      journey.elapsed = 0
      journey.startPosition.copy(camera.position)
      journey.startLook.copy(lookAt.current)
      journey.startUp.copy(camera.up)
      const initialZoom = destination === 'star' ? STAR_VIEW_DISTANCE : PLANET_VIEW_DISTANCE
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
        orbitOffset(journey.endLook, 0, 0, STAR_VIEW_DISTANCE + (compact ? 0.55 : 0), journey.endPosition)
        journey.endUp.set(0, 1, 0)
      } else {
        planetPosition(destination, time, journey.endLook).add(compOffset)
        orbitOffset(journey.endLook, 0, 0, PLANET_VIEW_DISTANCE + (compact ? 0.55 : 0), journey.endPosition)
        journey.endUp.set(0, 1, 0)
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
    } else {
      planetPosition(currentView.current, time, scratch)
    }
    scratch.add(compOffset)
    orbitOffset(scratch, yaw, pitch, distance, camera.position)
    camera.position.x += parallaxX * 0.06
    camera.position.y += parallaxY * 0.04
    lookAt.current.copy(scratch)
    camera.lookAt(lookAt.current)
  })

  return null
}
