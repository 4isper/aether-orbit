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

/** Distances inside which the glare reaches full strength: past the free
 * flight's closest approach (9.5) it bites, at the composed star view
 * (11.5) it is already a memory, and the overview never sees it. */
const NEAR_DISTANCE = 8
const FAR_DISTANCE = 12

/** 0..1 strength of the white-out for a camera looking with `viewDot`
 * (cosine of the angle between view direction and direction to the star)
 * from `distance` units away. */
export function glareFactor(viewDot: number, distance: number): number {
  const centering = smoothstep(viewDot, CENTER_MIN, CENTER_MAX)
  const reach = 1 - smoothstep(distance, NEAR_DISTANCE, FAR_DISTANCE)
  return centering * reach
}
