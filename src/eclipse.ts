/**
 * Eclipse geometry for Aurelia and its moon Nox, as pure functions of the
 * simulation time. The composition matches the scene graph in Planet.tsx:
 * the moon rides inside two rotated groups, so its world position is the
 * planet position plus the local orbit offset through both rotations (the
 * compact scale cancels — every distance below is measured in moon radii).
 * The scan mirrors what the surface shader actually renders: shadow falls
 * where the sun-moon axis passes within the penumbra of the surface.
 */
import { Euler, Quaternion, Vector3 } from 'three'
import { aureliaClock, aureliaFrame, moonPhaseAngle, planetPeriod, planetPosition } from './orbits.ts'

const qWorld = new Quaternion().setFromEuler(new Euler(...aureliaFrame.worldRotation))
const qMoon = new Quaternion().setFromEuler(new Euler(...aureliaFrame.moonOrbitRotation))
const qFrame = new Quaternion().multiplyQuaternions(qWorld, qMoon)

const planetScratch = new Vector3()
const moonScratch = new Vector3()
const sunScratch = new Vector3()
const moonOffsetScratch = new Vector3()
const shadowOffsetScratch = new Vector3()

/** Moon world position at simulation time, exact against the scene graph. */
export function moonWorldPosition(time: number, target: Vector3) {
  planetPosition('aurelia', time, target)
  const angle = moonPhaseAngle(time)
  moonOffsetScratch.set(
    Math.cos(angle) * aureliaClock.moonOrbitRadius,
    0,
    Math.sin(angle) * aureliaClock.moonOrbitRadius,
  ).applyQuaternion(qFrame)
  return target.add(moonOffsetScratch)
}

/**
 * Closest approach of the sun-moon shadow axis to Aurelia's center, in moon
 * radii. Below (planet radius + penumbra) in these units some surface
 * darkening is visible; below the planet radius alone the shadow crosses
 * the disc itself.
 */
export function shadowDistance(time: number) {
  planetPosition('aurelia', time, planetScratch)
  moonWorldPosition(time, moonScratch)
  // The shadow axis runs from the moon along the direction to the star.
  const sun = sunScratch.copy(planetScratch).negate().normalize()
  const offset = shadowOffsetScratch.copy(moonScratch).sub(planetScratch)
  const along = offset.dot(sun)
  if (along <= 0) return Number.POSITIVE_INFINITY
  return Math.sqrt(Math.max(offset.lengthSq() - along * along, 0)) / aureliaFrame.moonRadius
}

export type TransitEvent = {
  entry: number
  peak: number
  exit: number
  /** True when simulation time is inside the window right now. */
  inProgress: boolean
}

/**
 * The event's own threshold: the shadow axis inside the planet's disc, i.e.
 * the moon silhouette actually crossing the sun as seen from the surface.
 * (The wider penumbra grazes the limb for almost half a month — that is a
 * season, not an event, and announcing it would be wrong.)
 */
export const DISC_THRESHOLD_MOON_RADII = aureliaFrame.planetRadius / aureliaFrame.moonRadius

const SCAN_STEP = 0.5
// Conjunctions repeat on the synodic clock (moon vs the planet's year), not
// on the moon's own month, and the tilted orbit makes some of them miss the
// disc entirely. The scan horizon covers the worst measured gap between
// windows (87 time units) with margin, so a scan never comes up empty.
const SYNODIC = 1 / (1 / ((Math.PI * 2) / aureliaClock.moonAngularSpeed) - 1 / planetPeriod('aurelia'))
const SCAN_HORIZON = SYNODIC + (Math.PI * 2) / aureliaClock.moonAngularSpeed

/** Bisect the threshold crossing between an outside and an inside sample. */
function refineEdge(outside: number, inside: number) {
  for (let i = 0; i < 24; i++) {
    const mid = (outside + inside) / 2
    if (shadowDistance(mid) <= DISC_THRESHOLD_MOON_RADII) inside = mid
    else outside = mid
  }
  return inside
}

/**
 * The next transit at or after `now`. `entry` is first contact, `peak` the
 * deepest alignment, `exit` the last moment of shading; the edges are
 * refined well below the scan step so countdowns and the in-progress flag
 * stay honest even when a window runs past the scan horizon.
 */
export function nextTransit(now: number): TransitEvent | null {
  let entry = -1
  let coarsePeak = -1
  let depth = Number.POSITIVE_INFINITY
  let exit = -1
  let previous = now
  let t = now
  let horizon = now + SCAN_HORIZON
  while (t <= horizon) {
    const distance = shadowDistance(t)
    if (distance < depth) {
      depth = distance
      coarsePeak = t
    }
    if (distance <= DISC_THRESHOLD_MOON_RADII) {
      // First contact: `previous` is the outside sample, `t` the inside one.
      if (entry < 0) entry = refineEdge(previous, t)
      exit = t
    } else if (entry >= 0) {
      // The first outside sample after the window: refine the last contact.
      exit = refineEdge(t, exit)
      break
    }
    // A window may outlive the month horizon; keep scanning until it closes.
    if (entry >= 0 && t + SCAN_STEP > horizon) horizon = t + SCAN_STEP
    previous = t
    t += SCAN_STEP
  }
  if (entry < 0) return null
  // The coarse peak is within half a step of the true one; a fine walk nails it.
  let peak = coarsePeak
  for (let fine = coarsePeak - SCAN_STEP; fine <= coarsePeak + SCAN_STEP; fine += 0.02) {
    if (shadowDistance(fine) < shadowDistance(peak)) peak = fine
  }
  return { entry, peak, exit, inProgress: now >= entry && now <= exit }
}
