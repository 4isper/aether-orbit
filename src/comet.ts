import { Vector3 } from 'three'
import { createKeplerOrbit } from './kepler.ts'

export const cometOrbit = {
  periapsis: 4.6,
  apoapsis: 26,
  period: 90,
  argumentOfPeriapsis: 2.0,
  inclination: 0.21,
  meanAnomalyAtZero: 2.2,
}

const comet = createKeplerOrbit(cometOrbit)

/**
 * Position on the comet's ellipse for a given mean anomaly — the shared
 * Kepler machinery of kepler.ts, aimed at Boreas's elements.
 */
export function cometOrbitPoint(meanAnomaly: number, target: Vector3) {
  return comet.orbitPoint(meanAnomaly, target)
}

export function cometPosition(time: number, target: Vector3) {
  return comet.position(time, target)
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

/**
 * The next periapsis passage at or after `now`, with the blaze window around
 * it. Pure arithmetic on the orbit constants: perihelia repeat on the period,
 * so the scan machinery of eclipse.ts would be wasted here.
 */
export function nextPerihelion(now: number): PerihelionEvent {
  return comet.periapsisWindow(PERIHELION_RADIUS, now)
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
