import { MathUtils, Vector3 } from 'three'
import { cometOrbitPoint } from './comet.ts'
import { planetIds, type SceneView } from './planets.ts'
import { orbitPoint } from './orbits.ts'

export const PLANET_VIEW_DISTANCE = 9
export const STAR_VIEW_DISTANCE = 11.5
export const COMET_VIEW_DISTANCE = 3.4
export const MOON_VIEW_DISTANCE = 1.7
export const MIN_ZOOM = 7.6
export const MAX_ZOOM = 12.6
export const COMET_MIN_ZOOM = 2.2
export const COMET_MAX_ZOOM = 4.6
export const MOON_MIN_ZOOM = 1.0
export const MOON_MAX_ZOOM = 3.2
const FLIGHT_TIME = 4.2
const INTRO_TIME = 4.5
const OVERVIEW_HALF_FOV_DEG = 18
const PLANET_FRAMING_MARGIN = 3
const COMET_FRAMING_MARGIN = 2.4

export const FLIGHT_DURATION = FLIGHT_TIME
export const INTRO_DURATION = INTRO_TIME

/**
 * Camera offset in the orbit plane: tangential at yaw 0 (keeps the star at a
 * safe distance and varies the lighting as the planet moves), tilting outward
 * with yaw. Radial basis is taken from the center's XZ direction.
 */
export function orbitOffset(
  center: Vector3,
  yaw: number,
  pitch: number,
  distance: number,
  out: Vector3,
) {
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
  return out
}

/**
 * Camera distance for a two-finger pinch, recomputed from the gesture start so
 * every move is idempotent. Fingers apart (zoom in) shrink the distance.
 */
export function pinchZoom(zoom: number, startDistance: number, nextDistance: number, min: number, max: number) {
  if (startDistance <= 0 || nextDistance <= 0) return zoom
  return MathUtils.clamp(zoom * (startDistance / nextDistance), min, max)
}

/**
 * Default orbit distance and zoom clamp for a flyable view. The comet orbits
 * much closer than the planets, so it gets its own tighter range; 'system'
 * keeps the planet defaults because the overview has its own pose.
 */
export function viewZoomBounds(view: SceneView) {
  if (view === 'star') return { distance: STAR_VIEW_DISTANCE, min: MIN_ZOOM, max: MAX_ZOOM }
  if (view === 'comet') return { distance: COMET_VIEW_DISTANCE, min: COMET_MIN_ZOOM, max: COMET_MAX_ZOOM }
  if (view === 'moon') return { distance: MOON_VIEW_DISTANCE, min: MOON_MIN_ZOOM, max: MOON_MAX_ZOOM }
  return { distance: PLANET_VIEW_DISTANCE, min: MIN_ZOOM, max: MAX_ZOOM }
}

/**
 * A shareable camera pose: the orbit angle around a body and the framing
 * distance, as kept by CameraRig for every non-overview view.
 */
export type CameraPose = {
  yaw: number
  pitch: number
  zoom: number
}

const YAW_LIMIT = 0.32
const PITCH_LIMIT = 0.18

/** Clamp a pose to what the orbit controls can actually reach for this view. */
export function clampPose(pose: CameraPose, view: SceneView): CameraPose {
  const bounds = viewZoomBounds(view)
  return {
    yaw: MathUtils.clamp(pose.yaw, -YAW_LIMIT, YAW_LIMIT),
    pitch: MathUtils.clamp(pose.pitch, -PITCH_LIMIT, PITCH_LIMIT),
    zoom: MathUtils.clamp(pose.zoom, bounds.min, bounds.max),
  }
}

const POSE_FORMAT = { minimumFractionDigits: 0, maximumFractionDigits: 3 } as const

/** Query-string fragment for a pose, e.g. "yaw=0.21&pitch=-0.05&zoom=9.4". */
export function poseParams(pose: CameraPose): string {
  const number = (value: number) => value.toLocaleString('en-US', POSE_FORMAT)
  return `yaw=${number(pose.yaw)}&pitch=${number(pose.pitch)}&zoom=${number(pose.zoom)}`
}

/** Parse a pose from URL params; null when any part is missing or malformed. */
export function parsePose(params: URLSearchParams): CameraPose | null {
  const yaw = params.get('yaw')
  const pitch = params.get('pitch')
  const zoom = params.get('zoom')
  if (!yaw || !pitch || !zoom) return null
  const pose = { yaw: Number(yaw), pitch: Number(pitch), zoom: Number(zoom) }
  if (!Number.isFinite(pose.yaw) || !Number.isFinite(pose.pitch) || !Number.isFinite(pose.zoom)) return null
  return pose
}

export type OverviewPose = {
  target: Vector3
  position: Vector3
  up: Vector3
}

export type OverviewRotation = { position: Vector3; up: Vector3 }

const OVERVIEW_MIN_ELEVATION = -0.12
const OVERVIEW_MAX_ELEVATION = 1.1
export const OVERVIEW_MIN_ZOOM = 0.7
export const OVERVIEW_MAX_ZOOM = 1.35

/**
 * User-controlled orbit of the overview camera: yaw circles the system, pitch
 * changes elevation (clamped so the camera never dives under the ecliptic),
 * zoom scales the distance. The up vector rotates by the same yaw so the roll
 * of the framing stays as composed.
 */
export function rotateOverviewPose(
  pose: OverviewPose,
  yaw: number,
  pitch: number,
  zoom: number,
  out: OverviewRotation,
) {
  const offset = new Vector3().subVectors(pose.position, pose.target)
  const radius = offset.length()
  const baseElevation = Math.asin(MathUtils.clamp(offset.y / radius, -1, 1))
  const baseAzimuth = Math.atan2(offset.x, offset.z)
  const elevation = MathUtils.clamp(baseElevation + pitch, OVERVIEW_MIN_ELEVATION, OVERVIEW_MAX_ELEVATION)
  const azimuth = baseAzimuth + yaw
  const distance = radius * MathUtils.clamp(zoom, OVERVIEW_MIN_ZOOM, OVERVIEW_MAX_ZOOM)

  out.position.set(
    pose.target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    pose.target.y + distance * Math.sin(elevation),
    pose.target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
  )

  const upLengthXZ = Math.hypot(pose.up.x, pose.up.z)
  if (upLengthXZ > 1e-6) {
    const upAzimuth = Math.atan2(pose.up.x, pose.up.z) + yaw
    out.up.set(Math.sin(upAzimuth) * upLengthXZ, pose.up.y, Math.cos(upAzimuth) * upLengthXZ)
  } else {
    out.up.copy(pose.up)
  }
  return out
}

/**
 * Slide the look point so the framed body sits at a stable screen position:
 * offsets are fractions of the half-frame (+x right, +y up), so the framing
 * survives the body's whole orbit, unlike a fixed world-space offset whose
 * projection rotates with the camera. Mutates lookAt in place.
 */
export function shiftIntoFrame(
  lookAt: Vector3,
  cameraPosition: Vector3,
  up: Vector3,
  sx: number,
  sy: number,
  fovDeg: number,
  aspect: number,
) {
  const dir = new Vector3().subVectors(lookAt, cameraPosition)
  const distance = dir.length()
  if (distance === 0) return
  dir.normalize()
  const right = new Vector3().crossVectors(dir, up).normalize()
  const screenUp = new Vector3().crossVectors(right, dir).normalize()
  const halfH = distance * Math.tan(MathUtils.degToRad(fovDeg / 2))
  lookAt.addScaledVector(right, -sx * halfH * aspect)
  lookAt.addScaledVector(screenUp, -sy * halfH)
}

/**
 * Static camera pose that frames the whole system: every inclined orbit with a
 * margin around the planets and the comet's far reach, compensating for the
 * interface padding in both orientations.
 */
export function computeOverviewPose(width: number, height: number): OverviewPose {
  const aspect = width / height
  const portrait = aspect < 0.9
  const direction = new Vector3(0, 0.42, 1).normalize()
  const up = portrait ? new Vector3(-1, 0, 0) : new Vector3(0, 1, 0)
  const right = new Vector3().crossVectors(up, direction).normalize()
  const screenUp = new Vector3().crossVectors(direction, right)
  const usableHeight = Math.max(height - (portrait ? 320 : 420), height * (portrait ? 0.5 : 0.42))
  const usableWidth = width - (portrait ? 40 : 110)
  const halfFov = Math.tan(MathUtils.degToRad(OVERVIEW_HALF_FOV_DEG))
  let halfHeight = 0
  let halfWidth = 0
  let maxDepth = 0
  const point = new Vector3()

  for (const id of planetIds) {
    for (let i = 0; i < 48; i++) {
      orbitPoint(id, (i / 48) * Math.PI * 2, point)
      const length = point.length()
      point.multiplyScalar((length + PLANET_FRAMING_MARGIN) / length)
      halfHeight = Math.max(halfHeight, Math.abs(point.dot(screenUp)))
      halfWidth = Math.max(halfWidth, Math.abs(point.dot(right)))
      maxDepth = Math.max(maxDepth, point.dot(direction))
    }
  }
  for (let i = 0; i < 32; i++) {
    cometOrbitPoint((i / 32) * Math.PI * 2, point)
    const length = point.length()
    point.multiplyScalar((length + COMET_FRAMING_MARGIN) / length)
    halfHeight = Math.max(halfHeight, Math.abs(point.dot(screenUp)))
    halfWidth = Math.max(halfWidth, Math.abs(point.dot(right)))
    maxDepth = Math.max(maxDepth, point.dot(direction))
  }

  const distance = (Math.max(
    halfHeight / (halfFov * usableHeight / height),
    halfWidth / (halfFov * aspect * usableWidth / width),
  ) + maxDepth + 3) * (portrait ? 1.05 : 1)
  const centerOffset = (portrait ? 60 : 40) * (2 * distance * halfFov) / height
  const target = new Vector3().addScaledVector(screenUp, centerOffset)
  return { target, position: target.clone().addScaledVector(direction, distance), up }
}
