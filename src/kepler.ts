/**
 * A shared Kepler orbit factory: every eccentric wanderer of the system —
 * the three planets, the comet, the dwarf beyond Vesper — flies the same
 * solved ellipse, only the elements differ. The lap is not authored: mean
 * motion follows the system's Kepler-3 law (keplerSpeed) at the ellipse's
 * semi-major axis, so one gravity constant governs every heliocentric
 * orbit. Newton's equation converges everywhere for e < 0.8; the velocity
 * is the vis-viva tangent on the same frame, and the periapsis window is
 * the analytic event used by the announcements.
 */
import { Vector3 } from 'three'
import { keplerSpeed } from './orbits.ts'

export type KeplerElements = {
  /** Closest approach to the star, scene units. */
  periapsis: number
  /** Farthest excursion, scene units. */
  apoapsis: number
  /** Rotation of the ellipse inside its orbital plane, radians. */
  argumentOfPeriapsis: number
  /** Tilt of the orbital plane, radians. */
  inclination: number
  /** Mean anomaly at simulation time zero. */
  meanAnomalyAtZero: number
}

export type PeriapsisWindow = {
  /** First moment inside the window radius. */
  entry: number
  /** Closest approach to the star. */
  peak: number
  exit: number
  /** True when simulation time is inside the window right now. */
  inProgress: boolean
}

function TWO_PI_MOD(angle: number) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
}

export function createKeplerOrbit(elements: KeplerElements) {
  const semiMajor = (elements.periapsis + elements.apoapsis) / 2
  const eccentricity = (elements.apoapsis - elements.periapsis) / (elements.apoapsis + elements.periapsis)
  const meanMotion = keplerSpeed(semiMajor)
  const period = (Math.PI * 2) / meanMotion
  const cosW = Math.cos(elements.argumentOfPeriapsis)
  const sinW = Math.sin(elements.argumentOfPeriapsis)
  const cosI = Math.cos(elements.inclination)
  const sinI = Math.sin(elements.inclination)

  /** Kepler's equation solved with Newton iterations from the mean anomaly;
   * eccentricity stays below 0.8 so this converges everywhere. */
  const eccentricAnomaly = (meanAnomaly: number) => {
    const normalized = meanAnomaly % (Math.PI * 2)
    let eccentric = normalized
    for (let i = 0; i < 10; i++) {
      eccentric -= (eccentric - eccentricity * Math.sin(eccentric) - normalized)
        / (1 - eccentricity * Math.cos(eccentric))
    }
    return eccentric
  }

  /**
   * Position on the ellipse for a given mean anomaly.
   */
  const orbitPoint = (meanAnomaly: number, target: Vector3) => {
    const eccentric = eccentricAnomaly(meanAnomaly)
    const planeX = semiMajor * (Math.cos(eccentric) - eccentricity)
    const planeY = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentric)
    const rotatedX = planeX * cosW - planeY * sinW
    const rotatedY = planeX * sinW + planeY * cosW
    return target.set(rotatedX, rotatedY * sinI, rotatedY * cosI)
  }

  const position = (time: number, target: Vector3) => {
    return orbitPoint(elements.meanAnomalyAtZero + meanMotion * time, target)
  }

  /**
   * Velocity on the ellipse for the same mean anomaly, the same tilt
   * convention as orbitPoint: the vis-viva tangent
   * n·a/(1−e·cosE)·(−sinE, √(1−e²)·cosE), rotated and inclined exactly like
   * the position. The dust releases its grains with this — the comet's own
   * state of motion, exact rather than a finite difference.
   */
  const orbitVelocity = (meanAnomaly: number, target: Vector3) => {
    const eccentric = eccentricAnomaly(meanAnomaly)
    const speed = meanMotion * semiMajor / (1 - eccentricity * Math.cos(eccentric))
    const planeX = -Math.sin(eccentric) * speed
    const planeY = Math.sqrt(1 - eccentricity * eccentricity) * Math.cos(eccentric) * speed
    const rotatedX = planeX * cosW - planeY * sinW
    const rotatedY = planeX * sinW + planeY * cosW
    return target.set(rotatedX, rotatedY * sinI, rotatedY * cosI)
  }

  const velocity = (time: number, target: Vector3) => {
    return orbitVelocity(elements.meanAnomalyAtZero + meanMotion * time, target)
  }

  // r = a(1 − e·cosE) crosses `radius` at ±E*, swept in mean anomaly by
  // M* = E* − e·sinE* (Kepler's equation, monotone for e < 1). The window is
  // symmetric around the periapsis, so it follows analytically — no scan.
  // The mean anomaly ahead of the next periapsis also tells whether `now`
  // sits inside the current window on either side of the peak: the second
  // half of a window must still announce "happening now".
  const periapsisWindow = (radius: number, now: number): PeriapsisWindow => {
    const windowCosine = (1 - radius / semiMajor) / eccentricity
    const windowEccentric = Math.acos(Math.max(-1, Math.min(1, windowCosine)))
    const windowMean = windowEccentric - eccentricity * Math.sin(windowEccentric)
    const half = windowMean / meanMotion
    const meanNow = elements.meanAnomalyAtZero + meanMotion * now
    const ahead = TWO_PI_MOD(-meanNow)
    if (ahead >= Math.PI * 2 - windowMean) {
      // Just past the periapsis, still inside this window's second half.
      const peak = now - (Math.PI * 2 - ahead) / meanMotion
      return { entry: peak - half, peak, exit: peak + half, inProgress: true }
    }
    const peak = now + ahead / meanMotion
    return {
      entry: peak - half,
      peak,
      exit: peak + half,
      inProgress: ahead <= windowMean,
    }
  }

  return { orbitPoint, orbitVelocity, position, velocity, periapsisWindow, eccentricity, semiMajor, meanMotion, period }
}
