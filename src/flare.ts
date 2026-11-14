/**
 * Solis's flares, as pure functions of the simulation time — the same
 * discipline as storms.ts and cyclone.ts: one flare system owns the star,
 * flashing up, holding and fading on its own short cycle, so pause, time
 * reversal and deep links replay the same burst. A flare is more than a
 * spectacle on the star: its light multiplies the flux every world receives,
 * so the terminator brightens, the glint sharpens and the night lights of
 * Aurelia lose a little of their contrast while it holds.
 */
import { nextWindow } from './eclipse.ts'
import { cycleEnvelope, seededCycle } from './cycles.ts'

/** Lifecycle shares one period: a flare is quick — flash up, hold, fade,
 * then a long quiet stretch before the next burst. */
const RISE_END = 0.08
const HOLD_END = 0.16
const ACTIVE_END = 0.26

/** An announced flare is one the eye actually sees: below this the photosphere
 * is merely restless, not an event. */
export const FLARE_THRESHOLD = 0.5

/** How much brighter the star burns at phase `phase` (one full period maps to
 * [0, 1)): 0 in the calm, 1 while the burst holds. */
export function flareEnvelope(phase: number) {
  return cycleEnvelope(phase, RISE_END, HOLD_END, ACTIVE_END)
}

/** The flare's own clock: seeded once, fixed forever. */
const cycle = seededCycle(3313, 120, 190)

/** The flare's period, in time units — exported so tests can walk cycles. */
export const FLARE_PERIOD = cycle.period

/** Flare strength at simulation time, 0 calm to 1 at the peak. */
export function flareIntensity(time: number) {
  return flareEnvelope((time - cycle.offset) / cycle.period)
}

/**
 * The star's light multiplier at simulation time: unity in the calm — so the
 * deep-link contract of the sky is untouched — and a bounded brightening at
 * the peak, enough to read on every world without washing them out.
 */
export function flareLight(time: number) {
  return 1 + flareIntensity(time) * 0.35
}

/**
 * The next flare at or after `now`: the shared window scan over the star's
 * calmness, so entry/peak/exit and inProgress mean the same as they do for
 * transits, eclipses, storms and cyclones.
 */
export function nextFlare(now: number) {
  return nextWindow(now, {
    measure: (time) => 1 - flareIntensity(time),
    threshold: 1 - FLARE_THRESHOLD,
    horizon: cycle.period * 1.25,
  })
}
