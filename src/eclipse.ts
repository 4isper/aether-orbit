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
import { FLIGHT_BODY_RADII } from './camera-math.ts'
import { smoothstep } from './cycles.ts'
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
 * Closest margin of Aurelia's surface to the moon's shadow cone, in moon
 * radii: negative means some surface point stands where the silhouette
 * overlaps Solis's disc. Solis sits at the world origin and the shadow
 * falls along the sun→moon line — at this compact scale the moon's
 * parallax (≈0.4 rad from the planet's vantage) bends that line far off
 * the parallel-ray shortcut, so the axis is honest geometry. Solis
 * outgrows Nox: the umbra cone closes at an apex behind the moon and the
 * annular antumbra diverges past it — a ring, never a total shadow.
 */
export function shadowDistance(time: number) {
  planetPosition('aurelia', time, planetScratch)
  moonWorldPosition(time, moonScratch)
  const axis = sunScratch.copy(moonScratch).normalize()
  const offset = shadowOffsetScratch.copy(planetScratch).sub(moonScratch)
  const along = offset.dot(axis)
  if (along <= 0) return Number.POSITIVE_INFINITY
  const perp = Math.sqrt(Math.max(offset.lengthSq() - along * along, 0))
  const sunMoon = moonScratch.length()
  // The penumbra edge: partial overlap from a surface point, diverging
  // from the moon's limb through Solis's far edge.
  const penumbra = TRANSIT_MOON_RADIUS + (STAR_RADIUS + TRANSIT_MOON_RADIUS) * along / sunMoon
  // The cone reaches the planet's sphere where a surface point closest to
  // the axis still sits inside it.
  const margin = Math.max(perp - aureliaFrame.planetRadius, 0) - penumbra
  return margin / TRANSIT_MOON_RADIUS
}

export type TransitEvent = {
  entry: number
  peak: number
  exit: number
  /** True when simulation time is inside the window right now. */
  inProgress: boolean
}

/**
 * The event's own threshold: the margin crosses zero where the shadow cone
 * first touches the planet's sphere — some surface point sees the moon's
 * silhouette overlap the sun's disc. The measure is the signed margin, so
 * the peak is the deepest alignment.
 */
export const TRANSIT_THRESHOLD_MOON_RADII = 0

const STAR_RADIUS = FLIGHT_BODY_RADII.star
const TRANSIT_MOON_RADIUS = aureliaFrame.moonRadius

/**
 * Eclipse of the moon: how bright Nox stands inside Aurelia's shadow, from
 * MOON_UMBRA_LIGHT in the umbra to 1 fully lit — the exact measure the moon
 * shader renders (Moon.tsx), so the announced window and the visible
 * darkening agree by construction. The shadow is a cone, not a cylinder:
 * Solis outgrows Aurelia, so the umbra narrows behind the planet (apex at
 * D·R_p/(R_s−R_p)) while the penumbra diverges as R_p + d·(R_s+R_p)/D — a
 * cylinder overstates both.
 */
export const MOON_UMBRA_LIGHT = 0.08

/** The announce cut: a quarter of full brightness — mid-fade of the cone
 * the moon actually renders, the same "worth announcing" reading the old
 * mid-penumbra threshold had. */
export const ECLIPSE_THRESHOLD_BRIGHTNESS = 0.25

export function moonLight(time: number) {
  planetPosition('aurelia', time, planetScratch)
  moonWorldPosition(time, moonScratch)
  const sunPlanet = planetScratch.length()
  const offset = shadowOffsetScratch.copy(moonScratch).sub(planetScratch)
  // The cone runs from the planet straight away from the star.
  const axis = sunScratch.copy(planetScratch).normalize()
  const along = offset.dot(axis)
  if (along <= 0) return 1
  const perp = Math.sqrt(Math.max(offset.lengthSq() - along * along, 0))
  const planetRadius = aureliaFrame.planetRadius
  const penumbra = planetRadius + along * (STAR_RADIUS + planetRadius) / sunPlanet
  const umbra = Math.max(
    planetRadius * (1 - along * (STAR_RADIUS - planetRadius) / (sunPlanet * planetRadius)),
    0,
  )
  const lit = smoothstep(umbra, penumbra, perp)
  return MOON_UMBRA_LIGHT + (1 - MOON_UMBRA_LIGHT) * lit
}

const SCAN_STEP = 0.5
// Conjunctions repeat on the synodic clock (moon vs the planet's year), not
// on the moon's own month, and the tilted orbit makes some of them miss the
// disc entirely. The scan horizon covers the worst measured gap between
// windows (87 time units) with margin, so a scan never comes up empty.
const SYNODIC = 1 / (1 / ((Math.PI * 2) / aureliaClock.moonAngularSpeed) - 1 / planetPeriod('aurelia'))
const SCAN_HORIZON = SYNODIC + (Math.PI * 2) / aureliaClock.moonAngularSpeed

// Eclipses come in seasons tied to the planet's year (the moon-orbit nodes
// are fixed in the world frame, so the anti-sun direction visits each node
// once a year). A year plus a month covers every measured gap between
// windows; the horizon test in eclipse.test.ts keeps this honest.
export const ECLIPSE_SCAN_HORIZON = planetPeriod('aurelia') + (Math.PI * 2) / aureliaClock.moonAngularSpeed

export type WindowScan = {
  /** Depth of the alignment at time t; a window is where it dips below threshold. */
  measure: (time: number) => number
  threshold: number
  /** How far ahead to look for the next window before giving up. */
  horizon: number
}

/** Bisect the threshold crossing between an outside and an inside sample. */
function refineEdge(scan: WindowScan, outside: number, inside: number) {
  for (let i = 0; i < 24; i++) {
    const mid = (outside + inside) / 2
    if (scan.measure(mid) <= scan.threshold) inside = mid
    else outside = mid
  }
  return inside
}

/**
 * Shared scan for both shadow events: walk forward at SCAN_STEP, catch the
 * first window where the depth dips below the threshold, refine its edges by
 * bisection and its peak with a fine walk. `entry` is first contact, `peak`
 * the deepest alignment, `exit` the last moment inside; the edges land well
 * below the scan step so countdowns and the in-progress flag stay honest
 * even when a window runs past the horizon.
 */
/** Walk forward at SCAN_STEP, catch the first window where the depth dips
 * below the threshold, refine its edges by bisection and its peak with a
 * fine walk. `entry` is first contact, `peak` the deepest alignment, `exit`
 * the last moment inside. Shared by every event in the sky: shadow geometry
 * here, conjunctions in conjunction.ts. */
export function nextWindow(now: number, scan: WindowScan): TransitEvent | null {
  let entry = -1
  let coarsePeak = -1
  let depth = Number.POSITIVE_INFINITY
  let exit = -1
  let previous = now
  let t = now
  let horizon = now + scan.horizon

  // A scan may start inside a window: the chip reads the sky mid-moment and
  // a jump lands on a peak. The window's true first contact and its deepest
  // point lie behind `now`, so walk back while the depth stays under the
  // threshold — otherwise entry would clamp to the scan start and the peak
  // would drift half a step back on every rescan, so "to the moment" would
  // never land twice on the same instant.
  if (scan.measure(now) <= scan.threshold) {
    let back = now
    let inside = now
    for (;;) {
      const distance = scan.measure(back)
      if (distance < depth) {
        depth = distance
        coarsePeak = back
      }
      if (distance > scan.threshold) {
        entry = refineEdge(scan, back, inside)
        break
      }
      if (back <= now - scan.horizon) {
        // A window outliving the backward horizon has an unknowable first
        // contact: floor the entry the way the forward scan floors an exit.
        entry = back
        break
      }
      inside = back
      back -= SCAN_STEP
    }
  }

  while (t <= horizon) {
    const distance = scan.measure(t)
    if (distance < depth) {
      depth = distance
      coarsePeak = t
    }
    if (distance <= scan.threshold) {
      // First contact: `previous` is the outside sample, `t` the inside one.
      if (entry < 0) entry = refineEdge(scan, previous, t)
      exit = t
    } else if (entry >= 0) {
      // The first outside sample after the window: refine the last contact.
      exit = refineEdge(scan, t, exit)
      break
    }
    // A window may outlive the horizon; keep scanning until it closes.
    if (entry >= 0 && t + SCAN_STEP > horizon) horizon = t + SCAN_STEP
    previous = t
    t += SCAN_STEP
  }
  if (entry < 0) return null
  // The coarse peak is within half a step of the true one; a fine walk nails it.
  let peak = coarsePeak
  for (let fine = coarsePeak - SCAN_STEP; fine <= coarsePeak + SCAN_STEP; fine += 0.02) {
    if (scan.measure(fine) < scan.measure(peak)) peak = fine
  }
  return { entry, peak, exit, inProgress: now >= entry && now <= exit }
}

/**
 * The next transit at or after `now`.
 */
export function nextTransit(now: number): TransitEvent | null {
  return nextWindow(now, {
    measure: shadowDistance,
    threshold: TRANSIT_THRESHOLD_MOON_RADII,
    horizon: SCAN_HORIZON,
  })
}

/**
 * The next eclipse at or after `now`: Nox crossing into Aurelia's shadow,
 * going visibly dark from the moon's orbit. The measure is the moon's own
 * brightness in the shadow cone — the scan's peak is the darkest moment.
 */
export function nextEclipse(now: number): TransitEvent | null {
  return nextWindow(now, {
    measure: moonLight,
    threshold: ECLIPSE_THRESHOLD_BRIGHTNESS,
    horizon: ECLIPSE_SCAN_HORIZON,
  })
}
