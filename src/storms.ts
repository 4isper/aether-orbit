/**
 * Cinder's dust storms, as pure functions of the simulation time — the same
 * discipline as lightning.ts: one storm system owns the desert, rising,
 * holding and decaying on its own slow cycle, so pause, time reversal and
 * deep links replay the same weather. The scanner is the shared nextWindow
 * from eclipse.ts, aimed at the clearness of the sky instead of a shadow.
 */
import { nextWindow } from './eclipse.ts'
import { cycleEnvelope, seededCycle } from './cycles.ts'

/** Lifecycle shares one period: rise while the dust lifts off the regolith,
 * hold at full veil, decay, then a long clear season. */
const RISE_END = 0.14
const HOLD_END = 0.22
const ACTIVE_END = 0.32

/** An announced storm is one the surface shader actually renders: below
 * this the veil is a haze, not an event. */
export const STORM_THRESHOLD = 0.55

/**
 * Dust opacity at phase `phase` (one full period maps to [0, 1), any real
 * number accepted): 0 on the clear season, 1 while the veil holds.
 */
export function stormEnvelope(phase: number) {
  return cycleEnvelope(phase, RISE_END, HOLD_END, ACTIVE_END)
}

/** The desert's own clock: seeded once, fixed forever. */
const cycle = seededCycle(4127, 160, 240)

/** The storm's period, in time units — exported so tests can walk cycles. */
export const STORM_PERIOD = cycle.period

/** Dust veil over Cinder at simulation time, 0 clear to 1 fully shrouded. */
export function stormIntensity(time: number) {
  return stormEnvelope((time - cycle.offset) / cycle.period)
}

/**
 * The next storm at or after `now`: the shared window scan over the
 * clearness of the sky, so entry/peak/exit and inProgress mean the same
 * as they do for transits and eclipses.
 */
export function nextStorm(now: number) {
  return nextWindow(now, {
    measure: (time) => 1 - stormIntensity(time),
    threshold: 1 - STORM_THRESHOLD,
    horizon: cycle.period * 1.25,
  })
}
