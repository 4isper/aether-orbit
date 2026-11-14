/**
 * Conjunction geometry, pure functions of the simulation time: a planet and
 * Solis on one line of sight from another orbit. When the target is inside
 * the line it crosses the star's disc as a silhouette (Aurelia seen from
 * Vesper); when it is beyond the star it slips out of sight behind the disc
 * (Vesper seen from Cinder). Both are the same measured thing — how far the
 * target's center stands from the observer-to-star axis — so one scan serves
 * both, and the inclination mismatch decides which alignments are real.
 */
import { Vector3 } from 'three'
import { FLIGHT_BODY_RADII } from './camera-math.ts'
import type { PlanetId } from './planets.ts'
import { planetPeriod, planetPosition } from './orbits.ts'
import { nextWindow } from './eclipse.ts'
import type { TransitEvent } from './eclipse.ts'

const SOLIS_RADIUS = FLIGHT_BODY_RADII.star

const observerScratch = new Vector3()
const targetScratch = new Vector3()
const axisScratch = new Vector3()
const offsetScratch = new Vector3()

/**
 * Perpendicular offset of the target's center from the observer-to-star axis,
 * in Solis radii; infinity when the target is on the observer's side of the
 * sky (behind the viewer — real, but not on a view that faces the star).
 */
export function alignmentDepth(observer: PlanetId, target: PlanetId, time: number): number {
  planetPosition(observer, time, observerScratch)
  planetPosition(target, time, targetScratch)
  const axis = axisScratch.copy(observerScratch).negate().normalize()
  const offset = offsetScratch.copy(targetScratch).sub(observerScratch)
  const along = offset.dot(axis)
  if (along <= 0) return Number.POSITIVE_INFINITY
  return Math.sqrt(Math.max(offset.lengthSq() - along * along, 0)) / SOLIS_RADIUS
}

/**
 * The announce threshold: the target's center inside 0.6 Solis radii of the
 * line of sight. The disc edge is 1.0, but the tilt mismatch between any two
 * orbits can leave a closest approach as high as ~0.5 — the wider cut keeps
 * every synodic meeting inside the announced window instead of dropping
 * some alignments as invisible.
 */
export const CONJUNCTION_THRESHOLD_SOLIS_RADII = 0.6

/** Horizon: one synodic period of the pair (the alignment clock) with a
 * quarter as margin, so a scan never misses the next meeting. The shared
 * scan adds `now` itself — this stays a duration, whatever the clock says. */
function synodicPeriod(observer: PlanetId, target: PlanetId) {
  return 1 / Math.abs(1 / planetPeriod(observer) - 1 / planetPeriod(target))
}

/**
 * The next conjunction of `target` with Solis as seen from `observer`'s
 * orbit, at or after `now`.
 */
export function nextConjunction(observer: PlanetId, target: PlanetId, now: number): TransitEvent | null {
  return nextWindow(now, {
    measure: (time) => alignmentDepth(observer, target, time),
    threshold: CONJUNCTION_THRESHOLD_SOLIS_RADII,
    horizon: synodicPeriod(observer, target) * 1.25,
  })
}
