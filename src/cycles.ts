/**
 * Deterministic life cycles shared by every scheduled phenomenon: a seeded
 * clock (period and offset, fixed forever) and the rise-hold-decay-rest
 * envelope the prominences, storms and showers all live on.
 */
import { createRandom } from './random.ts'

/** A seeded schedule: one period, one offset, drawn once and kept. */
export function seededCycle(seed: number, minPeriod: number, maxPeriod: number) {
  const random = createRandom(seed)
  const period = minPeriod + random() * (maxPeriod - minPeriod)
  return { period, offset: random() * period }
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Strength of a cycle at `phase` (one full period maps to [0, 1), any real
 * number accepted): 0 while dormant, 1 while held, smooth rise between 0 and
 * `riseEnd`, smooth decay from `holdEnd` to `activeEnd`.
 */
export function cycleEnvelope(phase: number, riseEnd: number, holdEnd: number, activeEnd: number) {
  const p = ((phase % 1) + 1) % 1
  if (p >= activeEnd) return 0
  const rise = smoothstep(0, riseEnd, p)
  const fall = 1 - smoothstep(holdEnd, activeEnd, p)
  return Math.min(rise, fall)
}
