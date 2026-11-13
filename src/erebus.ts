/**
 * Erebus, the dwarf beyond Vesper: a cold sentinel on a tilted ellipse that
 * only dips inside the evening star's orbit at periapsis. The same Kepler
 * machinery as the comet (kepler.ts), other elements and a slower story —
 * it spends most of its year far out in the dark, so the plunge is a rare,
 * announced event. Pure functions of the simulation clock.
 */
import { Vector3 } from 'three'
import { createKeplerOrbit } from './kepler.ts'

export const erebusOrbit = {
  periapsis: 19.2,
  apoapsis: 34,
  period: 420,
  argumentOfPeriapsis: 1.1,
  inclination: 0.14,
  // Past apoapsis and falling inward: the first plunge is a promise.
  meanAnomalyAtZero: 4.6,
}

const erebus = createKeplerOrbit(erebusOrbit)

/** Position on the ellipse for a given mean anomaly — the overview's orbit
 * line samples this around the whole lap. */
export function erebusOrbitPoint(meanAnomaly: number, target: Vector3) {
  return erebus.orbitPoint(meanAnomaly, target)
}

/** World position of the dwarf at simulation time. */
export function erebusPosition(time: number, target: Vector3) {
  return erebus.position(time, target)
}

/**
 * The plunge window: within this radius of the star Erebus overtakes
 * Vesper's orbit and visibly closes with the system. The event's own
 * threshold, the same discipline as the comet's blaze window.
 */
export const EREBUS_PERIAPSIS_RADIUS = 21

export type ErebusPeriapsisEvent = {
  entry: number
  peak: number
  exit: number
  inProgress: boolean
}

/**
 * The next plunge at or after `now`: analytic like the comet's perihelion —
 * perihelia repeat on the period, the scan machinery would be wasted here.
 */
export function nextErebusPeriapsis(now: number): ErebusPeriapsisEvent {
  return erebus.periapsisWindow(EREBUS_PERIAPSIS_RADIUS, now)
}
