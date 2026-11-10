import { Vector3 } from 'three'

/**
 * Ring-shadow geometry for Vesper: where the sun ray from a surface point
 * crosses the ring plane. Pure and testable; the surface shader in Vesper.tsx
 * transcribes the same math in GLSL and dims the point by the ring density at
 * the crossing radius.
 *
 * All inputs are unit vectors. `point` is a surface position relative to the
 * planet center, `sunDirection` points toward the star, `planeNormal` is the
 * ring plane's axis.
 */

const scratchSun = new Vector3()
const scratchCrossing = new Vector3()

/**
 * Distance from the planet center to the ring-plane crossing of the sun ray,
 * measured inside the ring plane, for crossings in front of the point (toward
 * the sun). Returns -1 when the ray is parallel to the plane or the crossing
 * lies behind the point - no shadow either way.
 */
export function ringCrossingRadius(
  point: Vector3,
  sunDirection: Vector3,
  planeNormal: Vector3,
): number {
  const sun = scratchSun.copy(sunDirection).normalize()
  const towardSun = sun.dot(planeNormal)
  if (Math.abs(towardSun) < 1e-6) return -1
  const height = point.dot(planeNormal)
  const distance = -height / towardSun
  if (distance <= 0) return -1
  const crossing = scratchCrossing.copy(point).addScaledVector(sun, distance)
  const inPlane = crossing.addScaledVector(planeNormal, -crossing.dot(planeNormal))
  return inPlane.length()
}
