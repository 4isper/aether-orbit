/**
 * Looking into Solis should hurt a little. The glare factor is pure camera
 * geometry: how centered the star sits in the view, tempered by how far the
 * camera stands — a far star is a small sun, a close one floods the frame.
 */

function smoothstep(x: number, min: number, max: number) {
  const t = Math.min(Math.max((x - min) / (max - min), 0), 1)
  return t * t * (3 - 2 * t)
}

/** When the view direction is this close to the star, the flood begins. */
const CENTER_MIN = 0.955
const CENTER_MAX = 0.998

import { FLIGHT_BODY_RADII } from './camera-math.ts'

/** Distances (from the star) inside which the glare reaches full strength:
 * past 3.4 solar radii it bites, at the composed star view (4.9 R☉) it is
 * already a memory, and the overview never sees it. */
const NEAR_DISTANCE = 3.4 * FLIGHT_BODY_RADII.star
const FAR_DISTANCE = 4.9 * FLIGHT_BODY_RADII.star

/** 0..1 strength of the white-out for a camera looking with `viewDot`
 * (cosine of the angle between view direction and direction to the star)
 * from `distance` units away. */
export function glareFactor(viewDot: number, distance: number): number {
  const centering = smoothstep(viewDot, CENTER_MIN, CENTER_MAX)
  const reach = 1 - smoothstep(distance, NEAR_DISTANCE, FAR_DISTANCE)
  return centering * reach
}
