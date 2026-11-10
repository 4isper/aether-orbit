import { MathUtils, Vector3 } from 'three'
import { cometOrbitPoint } from './comet'
import { planetIds } from './planets'
import { orbitPoint } from './orbits'

export const PLANET_VIEW_DISTANCE = 9
export const STAR_VIEW_DISTANCE = 11.5
export const MIN_ZOOM = 7.6
export const MAX_ZOOM = 12.6
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

export type OverviewPose = {
  target: Vector3
  position: Vector3
  up: Vector3
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
