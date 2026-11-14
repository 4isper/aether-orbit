/**
 * Aurelia's cyclones, as pure functions of the simulation time — the same
 * discipline as storms.ts: one storm system owns the ocean, rising, holding
 * and decaying on its own slow cycle, so pause, time reversal and deep links
 * replay the same weather. Where the desert's veil covers the whole world,
 * the cyclone keeps an eye: a compact vortex pinned to the cloud deck's UV
 * frame (like the lightning cells) with a slow westward wander of its own.
 */
import { nextWindow } from './eclipse.ts'
import { cycleEnvelope, seededCycle } from './cycles.ts'
import { createRandom } from './random.ts'

/** Lifecycle shares one period: the vortex spins up while the eye closes,
 * holds at full spiral, decays, then a long calm season. */
const RISE_END = 0.16
const HOLD_END = 0.28
const ACTIVE_END = 0.44

/** An announced cyclone is one the cloud shader actually renders: below
 * this the spiral is a smudge, not an event. */
export const CYCLONE_THRESHOLD = 0.55

/**
 * Dust of the vortex at phase `phase` (one full period maps to [0, 1), any
 * real number accepted): 0 on the calm season, 1 while the spiral holds.
 */
export function cycloneEnvelope(phase: number) {
  return cycleEnvelope(phase, RISE_END, HOLD_END, ACTIVE_END)
}

/** The cyclone's own clock: seeded once, fixed forever. */
const cycle = seededCycle(8841, 180, 260)

/** The storm's period, in time units — exported so tests can walk cycles. */
export const CYCLONE_PERIOD = cycle.period

/** Vortex strength at simulation time, 0 calm to 1 fully wound. */
export function cycloneIntensity(time: number) {
  return cycloneEnvelope((time - cycle.offset) / cycle.period)
}

/** The eye wanders westward across the map over a few cycles; seeded once. */
const centerRandom = createRandom(6703)
const CENTER_U = centerRandom()
const CENTER_V = 0.3 + centerRandom() * 0.4
/** A quarter of the map per cycle: the eye crosses the disk slowly, riding
 * the air mass the cloud deck's rotation already carries. */
const DRIFT_RATE = 0.25 / cycle.period

/**
 * The eye's position in the cloud map's UV frame at simulation time. `u`
 * wraps modulo 1 — the seam is a line on the map, not in the sky — and `v`
 * stays in the tropics, below the auroras' latitude band.
 */
export function cycloneCenter(time: number): { u: number; v: number } {
  const u = ((CENTER_U - DRIFT_RATE * time) % 1 + 1) % 1
  return { u, v: CENTER_V }
}

/**
 * The next cyclone at or after `now`: the shared window scan over the
 * calmness of the ocean sky, so entry/peak/exit and inProgress mean the
 * same as they do for transits, eclipses and the desert's storm.
 */
export function nextCyclone(now: number) {
  return nextWindow(now, {
    measure: (time) => 1 - cycloneIntensity(time),
    threshold: 1 - CYCLONE_THRESHOLD,
    horizon: cycle.period * 1.25,
  })
}
