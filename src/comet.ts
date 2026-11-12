import { Vector3 } from 'three'

export const cometOrbit = {
  periapsis: 4.6,
  apoapsis: 26,
  period: 90,
  argumentOfPeriapsis: 2.0,
  inclination: 0.21,
  meanAnomalyAtZero: 2.2,
}

const semiMajor = (cometOrbit.periapsis + cometOrbit.apoapsis) / 2
const eccentricity = (cometOrbit.apoapsis - cometOrbit.periapsis) / (cometOrbit.apoapsis + cometOrbit.periapsis)
const meanMotion = (Math.PI * 2) / cometOrbit.period

/**
 * Position on the comet's ellipse for a given mean anomaly. Kepler's equation
 * is solved with Newton iterations; eccentricity stays below 0.8 so this
 * converges everywhere.
 */
export function cometOrbitPoint(meanAnomaly: number, target: Vector3) {
  const normalized = meanAnomaly % (Math.PI * 2)
  let eccentric = normalized
  for (let i = 0; i < 10; i++) {
    eccentric -= (eccentric - eccentricity * Math.sin(eccentric) - normalized)
      / (1 - eccentricity * Math.cos(eccentric))
  }

  const planeX = semiMajor * (Math.cos(eccentric) - eccentricity)
  const planeY = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentric)
  const cosW = Math.cos(cometOrbit.argumentOfPeriapsis)
  const sinW = Math.sin(cometOrbit.argumentOfPeriapsis)
  const rotatedX = planeX * cosW - planeY * sinW
  const rotatedY = planeX * sinW + planeY * cosW
  const cosI = Math.cos(cometOrbit.inclination)
  const sinI = Math.sin(cometOrbit.inclination)

  return target.set(rotatedX, rotatedY * sinI, rotatedY * cosI)
}

export function cometPosition(time: number, target: Vector3) {
  return cometOrbitPoint(cometOrbit.meanAnomalyAtZero + meanMotion * time, target)
}

/**
 * The comet's blaze window: within this radius of the star the tails are
 * visibly burning (1.3× periapsis). It is the event's own threshold, the
 * same discipline as eclipse.ts: a season would be wrong, an approach is
 * an event.
 */
export const PERIHELION_RADIUS = 6

export type PerihelionEvent = {
  /** First moment inside the blaze window. */
  entry: number
  /** Closest approach to the star. */
  peak: number
  exit: number
  /** True when simulation time is inside the window right now. */
  inProgress: boolean
}

// r = a(1 − e·cosE) crosses PERIHELION_RADIUS at ±E*, swept in mean anomaly
// by M* = E* − e·sinE* (Kepler's equation, monotone for e < 1). The window is
// symmetric around the periapsis, so it follows analytically — no scan.
const windowCosine = (1 - PERIHELION_RADIUS / semiMajor) / eccentricity
const windowEccentric = Math.acos(Math.max(-1, Math.min(1, windowCosine)))
const windowMean = windowEccentric - eccentricity * Math.sin(windowEccentric)
const WINDOW_HALF = windowMean / meanMotion

function TWO_PI_MOD(angle: number) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
}

/**
 * The next periapsis passage at or after `now`, with the blaze window around
 * it. Pure arithmetic on the orbit constants: perihelia repeat on the period,
 * so the scan machinery of eclipse.ts would be wasted here.
 */
export function nextPerihelion(now: number): PerihelionEvent {
  const meanNow = cometOrbit.meanAnomalyAtZero + meanMotion * now
  const delta = TWO_PI_MOD(-meanNow) / meanMotion
  const peak = now + delta
  return {
    entry: peak - WINDOW_HALF,
    peak,
    exit: peak + WINDOW_HALF,
    inProgress: now >= peak - WINDOW_HALF && now <= peak + WINDOW_HALF,
  }
}

const scratchAntiSun = new Vector3()

/**
 * Position of one tail particle: it streams anti-sunward along `antiSun`,
 * falls back along the path of motion by a quadratic lag (`lagCurve` decides
 * how strongly - the dust tail lags far harder than the ion tail, which is
 * what curves it away from the straight anti-sun line), and wobbles by
 * `spread` on a per-particle seed. `t` runs 0..1 from the head outward.
 */
export function tailParticlePosition(
  t: number,
  tailLength: number,
  lagCurve: number,
  spread: number,
  head: Vector3,
  velocity: Vector3,
  antiSun: Vector3,
  clock: number,
  seed: number,
  target: Vector3,
): Vector3 {
  const lag = t * t * tailLength * lagCurve
  scratchAntiSun.copy(antiSun).normalize()
  return target
    .copy(head)
    .addScaledVector(scratchAntiSun, t * tailLength)
    .addScaledVector(velocity, -lag)
    .add({
      x: Math.sin(clock * 0.9 + seed) * spread,
      y: Math.cos(clock * 1.3 + seed * 1.7) * spread,
      z: Math.sin(clock * 1.1 + seed * 2.3) * spread,
    })
}
