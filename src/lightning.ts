/**
 * Night-side lightning on Aurelia, as pure functions of the simulation time
 * — the same discipline as meteors.ts: a strike is drawn deterministically
 * from its cell seed, so pause, time reversal and restarts replay the same
 * storm, and the cloud shader only renders what the clock dictates.
 */
import { createRandom } from './random.ts'

/** Independent storm cells riding the cloud deck. */
export const LIGHTNING_CELLS = 3

/** A strike in cloud-UV space: position (the air mass it lives in) and the
 * flash envelope's current strength, 0 when the cell is dark. */
export type LightningStrike = {
  u: number
  v: number
  strength: number
}

/** Seconds of a single flash: a hard attack, a medium decay. */
const FLASH_LIFE = 0.42
const FLASH_ATTACK = 0.05

type CellTiming = { period: number; offset: number }

const cellTimingCache = new Map<number, CellTiming>()

function cellTiming(cell: number) {
  let timing = cellTimingCache.get(cell)
  if (!timing) {
    const random = createRandom(9137 + cell * 7919)
    timing = { period: 7 + random() * 7, offset: random() * 14 }
    cellTimingCache.set(cell, timing)
  }
  return timing
}

/** Where the cell's storm sits: fixed in the cloud map's UV frame, so the
 * strike rides the air mass as the deck rotates. Mid-latitudes only — the
 * poles belong to the auroras. */
function cellPosition(cell: number): { u: number; v: number } {
  const random = createRandom(5171 + cell * 104729)
  return { u: random(), v: 0.25 + random() * 0.5 }
}

/** Flash brightness at `age` into a strike: quick flare, longer fade. */
function flashEnvelope(age: number): number {
  if (age <= 0 || age >= FLASH_LIFE) return 0
  const attack = Math.min(age / FLASH_ATTACK, 1)
  const decay = Math.min((FLASH_LIFE - age) / (FLASH_LIFE - FLASH_ATTACK), 1)
  return attack * decay
}

/**
 * Fill `out` with the active strikes at `time`, one slot per cell; a dark
 * cell yields null. Returns the filled array for convenience. Allocation-
 * light: the caller owns the slots and reuses them every frame.
 */
export function lightningStrikes(time: number, out: (LightningStrike | null)[]): (LightningStrike | null)[] {
  for (let cell = 0; cell < LIGHTNING_CELLS; cell++) {
    const { period, offset } = cellTiming(cell)
    const age = (time - offset) % period
    // A negative clock (time reversal) must wrap the same way forward does:
    // the modulo of a negative time lands below zero, lift it into the cycle.
    const wrapped = age < 0 ? age + period : age
    const strength = flashEnvelope(wrapped)
    const current = out[cell]
    if (strength <= 0) {
      out[cell] = null
    } else if (current) {
      current.strength = strength
      out[cell] = current
    } else {
      const { u, v } = cellPosition(cell)
      out[cell] = { u, v, strength }
    }
  }
  return out
}
