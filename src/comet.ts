import { Vector3 } from 'three'
import { createKeplerOrbit } from './kepler.ts'
import { ORBIT_SCALE } from './orbits.ts'

/**
 * Boreas, the icy visitor: a Jupiter-family comet in honest units —
 * periapsis 0.511 AU, apoapsis 2.89 AU, e = 0.70 (the Encke class).
 * The elements keep their authored shape, rescaled to Earth radii.
 */
export const cometOrbit = {
  periapsis: 4.6 * ORBIT_SCALE,
  apoapsis: 26 * ORBIT_SCALE,
  argumentOfPeriapsis: 2.0,
  inclination: 0.21,
  meanAnomalyAtZero: 2.2,
}

const comet = createKeplerOrbit(cometOrbit)

/** Full lap around Solis, in time units (days) — Kepler-3 at the ellipse's
 * semi-major axis, the planets' own law (≈809 days, ~2.2 Aurelia years). */
export const cometPeriod = comet.period

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

/** The comet's own velocity at simulation time — the factory's vis-viva
 * tangent, exact. The dust grains leave the nucleus with this state of
 * motion (dust.ts). */
export function cometVelocity(time: number, target: Vector3) {
  return comet.velocity(time, target)
}

/**
 * The comet's blaze window: within this radius of the star the tails are
 * visibly burning (1.3× periapsis ≈ 0.66 AU). It is the event's own
 * threshold, the same discipline as eclipse.ts: a season would be wrong,
 * an approach is an event.
 */
export const PERIHELION_RADIUS = 6 * ORBIT_SCALE

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
 * Position of one ion-tail particle: it streams anti-sunward along
 * `antiSun` — the solar wind is radial, so the ion tail carries no lag
 * along the path of motion (the dust tail's ballistic curve lives in
 * dust.ts, where each grain flies its own Kepler orbit) — and wobbles by
 * `spread` on a per-particle seed. `t` runs 0..1 from the head outward.
 */
export function tailParticlePosition(
  t: number,
  tailLength: number,
  spread: number,
  head: Vector3,
  antiSun: Vector3,
  clock: number,
  seed: number,
  target: Vector3,
): Vector3 {
  scratchAntiSun.copy(antiSun).normalize()
  return target
    .copy(head)
    .addScaledVector(scratchAntiSun, t * tailLength)
    .add({
      x: Math.sin(clock * 0.9 + seed) * spread,
      y: Math.cos(clock * 1.3 + seed * 1.7) * spread,
      z: Math.sin(clock * 1.1 + seed * 2.3) * spread,
    })
}
