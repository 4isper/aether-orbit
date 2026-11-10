import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { cometOrbitPoint } from '../comet'
import { planetIds, type SceneView } from '../planets'
import { orbitPoint, planetPosition } from '../orbits'

type CameraRigProps = {
  reducedMotion: boolean
  destination: SceneView
  onArrive: (view: SceneView) => void
  timeRef: { current: number }
}

// Camera offset in the orbit plane: tangential at yaw 0 (keeps the star at a
// safe distance and varies the lighting as the planet moves), tilting outward
// with yaw. Radial basis is taken from the center's XZ direction.
function orbitOffset(center: Vector3, yaw: number, pitch: number, distance: number, out: Vector3) {
  const radialLength = Math.hypot(center.x, center.z) || 1
  const radialX = center.x / radialLength
  const radialZ = center.z / radialLength
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const dirX = -radialZ * cosYaw + radialX * sinYaw
  const dirZ = radialX * cosYaw + radialZ * sinYaw
  const horizontal = Math.cos(pitch) * distance
  out.set(
    center.x + dirX * horizontal,
    center.y + Math.sin(pitch) * distance,
    center.z + dirZ * horizontal,
  )
}

export function CameraRig({ reducedMotion, destination, onArrive, timeRef }: CameraRigProps) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const overviewPose = useMemo(() => {
    const aspect = size.width / size.height
    const portrait = aspect < 0.9
    const direction = new Vector3(0, 0.42, 1).normalize()
    const up = portrait ? new Vector3(-1, 0, 0) : new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(up, direction).normalize()
    const screenUp = new Vector3().crossVectors(direction, right)
    const usableHeight = Math.max(size.height - (portrait ? 320 : 420), size.height * (portrait ? 0.5 : 0.42))
    const usableWidth = size.width - (portrait ? 40 : 110)
    const halfFov = Math.tan(MathUtils.degToRad(18))
    let halfHeight = 0
    let halfWidth = 0
    let maxDepth = 0
    const point = new Vector3()
    for (const id of planetIds) {
      for (let i = 0; i < 48; i++) {
        orbitPoint(id, (i / 48) * Math.PI * 2, point)
        point.addScaledVector(point.clone().normalize(), 3)
        halfHeight = Math.max(halfHeight, Math.abs(point.dot(screenUp)))
        halfWidth = Math.max(halfWidth, Math.abs(point.dot(right)))
        maxDepth = Math.max(maxDepth, point.dot(direction))
      }
    }
    for (let i = 0; i < 32; i++) {
      cometOrbitPoint((i / 32) * Math.PI * 2, point)
      point.multiplyScalar((point.length() + 2.2) / point.length())
      halfHeight = Math.max(halfHeight, Math.abs(point.dot(screenUp)))
      halfWidth = Math.max(halfWidth, Math.abs(point.dot(right)))
      maxDepth = Math.max(maxDepth, point.dot(direction))
    }
    const distance = (Math.max(
      halfHeight / (halfFov * usableHeight / size.height),
      halfWidth / (halfFov * aspect * usableWidth / size.width),
    ) + maxDepth + 3) * (portrait ? 1.05 : 1)
    const centerOffset = (portrait ? 60 : 40) * (2 * distance * halfFov) / size.height
    const target = new Vector3().addScaledVector(screenUp, centerOffset)
    return { target, position: target.clone().addScaledVector(direction, distance), up }
  }, [size.width, size.height])
  const target = useRef({ yaw: 0, pitch: 0, zoom: 9 })
  const current = useRef({ yaw: 0, pitch: 0, zoom: 9 })
  const pointer = useRef({ x: 0, y: 0 })
  const drag = useRef({ active: false, x: 0, y: 0 })
  const intro = useRef(reducedMotion ? 1 : 0)
  const orbitTime = useRef(0)
  const currentView = useRef<SceneView>('aurelia')
  const requestedView = useRef<SceneView>('aurelia')
  const lookAt = useRef(new Vector3())
  const scratch = useMemo(() => new Vector3(), [])
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
      if (flight.current.active || currentView.current === 'system') return
      target.current = { yaw: 0, pitch: 0, zoom: 9 }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (flight.current.active || currentView.current === 'system' || (event.pointerType === 'mouse' && event.button !== 0)) return
      drag.current = { active: true, x: event.clientX, y: event.clientY }
      element.setPointerCapture(event.pointerId)
      element.focus({ preventScroll: true })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (flight.current.active || currentView.current === 'system') return
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1
      if (!drag.current.active) return

      const dx = event.clientX - drag.current.x
      const dy = event.clientY - drag.current.y
      target.current.yaw = MathUtils.clamp(target.current.yaw - dx * 0.0028, -0.32, 0.32)
      target.current.pitch = MathUtils.clamp(target.current.pitch + dy * 0.0022, -0.18, 0.18)
      drag.current.x = event.clientX
      drag.current.y = event.clientY
    }

    const onPointerUp = (event: PointerEvent) => {
      drag.current.active = false
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (flight.current.active || currentView.current === 'system') return
      target.current.zoom = MathUtils.clamp(target.current.zoom + event.deltaY * 0.003, 7.6, 12.6)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (flight.current.active || currentView.current === 'system') return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) {
        event.preventDefault()
      }
      if (event.key.toLowerCase() === 'r') reset()
      if (event.key === 'ArrowLeft') target.current.yaw += 0.035
      if (event.key === 'ArrowRight') target.current.yaw -= 0.035
      if (event.key === 'ArrowUp') target.current.pitch -= 0.025
      if (event.key === 'ArrowDown') target.current.pitch += 0.025
      if (event.key === '+' || event.key === '=') target.current.zoom -= 0.25
      if (event.key === '-') target.current.zoom += 0.25
      target.current.yaw = MathUtils.clamp(target.current.yaw, -0.32, 0.32)
      target.current.pitch = MathUtils.clamp(target.current.pitch, -0.18, 0.18)
      target.current.zoom = MathUtils.clamp(target.current.zoom, 7.6, 12.6)
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

  useFrame((state, delta) => {
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
      const initialZoom = destination === 'star' ? 11.5 : 9
      target.current = { yaw: 0, pitch: 0, zoom: initialZoom }
      current.current = { yaw: 0, pitch: 0, zoom: initialZoom }
      pointer.current = { x: 0, y: 0 }
      drag.current.active = false
      intro.current = 1
      orbitTime.current = 0
    }

    if (journey.active) {
      journey.elapsed += delta
      const progress = reducedMotion ? 1 : Math.min(journey.elapsed / 4.2, 1)
      const eased = progress * progress * (3 - 2 * progress)
      const arc = Math.sin(progress * Math.PI) ** 2
      if (destination === 'system') {
        journey.endLook.copy(overviewPose.target)
        journey.endPosition.copy(overviewPose.position)
        journey.endUp.copy(overviewPose.up)
      } else if (destination === 'star') {
        journey.endLook.copy(compOffset)
        orbitOffset(journey.endLook, 0, 0, 11.5 + (compact ? 0.55 : 0), journey.endPosition)
        journey.endUp.set(0, 1, 0)
      } else {
        planetPosition(destination, time, journey.endLook).add(compOffset)
        orbitOffset(journey.endLook, 0, 0, 9 + (compact ? 0.55 : 0), journey.endPosition)
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
      camera.position.copy(overviewPose.position)
      camera.up.copy(overviewPose.up)
      lookAt.current.copy(overviewPose.target)
      camera.lookAt(lookAt.current)
      return
    }

    intro.current = Math.min(1, intro.current + delta / 4.5)
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
