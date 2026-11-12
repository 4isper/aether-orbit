/**
 * Meteor geometry as pure functions of time, the same discipline as
 * prominences.ts and eclipse.ts: a spawn is drawn deterministically from
 * (slot seed, cycle index), so the streak is stable under pause, time
 * reversal and restarts, and the component only samples positions.
 */
import { Vector3 } from 'three'
import { createRandom } from './random.ts'

/** Shell the streaks live in: inside the starfield band (30..92), away from bodies. */
export const METEOR_ORBIT_RADIUS: [number, number] = [38, 66]
/** Scene units per meteor-time second. */
export const METEOR_SPEED: [number, number] = [26, 48]
/** Flight seconds and the dark pause between flights, drawn per slot. */
export const METEOR_LIFE: [number, number] = [0.9, 1.8]
export const METEOR_IDLE: [number, number] = [2.5, 12]

export type MeteorSpawn = {
  origin: Vector3
  velocity: Vector3
}

const scratchDir = new Vector3()
const scratchUp = new Vector3()

function mixSeed(slotSeed: number, cycleIndex: number) {
  // Positive, non-zero LCG seed for a (slot, cycle) pair.
  const mixed = (Math.imul(slotSeed, 73856093) ^ Math.imul(cycleIndex, 19349663)) >>> 0
  return (mixed % 2147483646) + 1
}

/**
 * One flight: a uniform point in the shell and a purely tangential velocity
 * (the streak circles the system at constant radius instead of diving at the
 * star). Deterministic per (slotSeed, cycleIndex).
 */
export function meteorSpawn(slotSeed: number, cycleIndex: number): MeteorSpawn {
  const random = createRandom(mixSeed(slotSeed, cycleIndex))
  const theta = random() * Math.PI * 2
  const phi = Math.acos(2 * random() - 1)
  scratchDir.set(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  )
  const origin = scratchDir.clone().multiplyScalar(
    METEOR_ORBIT_RADIUS[0] + random() * (METEOR_ORBIT_RADIUS[1] - METEOR_ORBIT_RADIUS[0]),
  )
  // A tangent direction: cross the radial with a random reference axis, so
  // the streak stays in the shell.
  scratchUp.set(random() - 0.5, random() - 0.5, random() - 0.5)
  const velocity = scratchDir.clone().cross(scratchUp)
  if (velocity.lengthSq() < 1e-6) velocity.set(0, 1, 0).cross(scratchDir)
  velocity.normalize().multiplyScalar(
    METEOR_SPEED[0] + random() * (METEOR_SPEED[1] - METEOR_SPEED[0]),
  )
  return { origin, velocity }
}

export type MeteorPhase = {
  spawn: MeteorSpawn
  /** Meteor-time seconds since this cycle began; 0..cycle. */
  age: number
  life: number
  cycle: number
}

const slotLife = new Map<number, { life: number; cycle: number; offset: number }>()

function slotTiming(slotSeed: number) {
  let timing = slotLife.get(slotSeed)
  if (!timing) {
    const random = createRandom(slotSeed)
    const life = METEOR_LIFE[0] + random() * (METEOR_LIFE[1] - METEOR_LIFE[0])
    const idle = METEOR_IDLE[0] + random() * (METEOR_IDLE[1] - METEOR_IDLE[0])
    timing = { life, cycle: life + idle, offset: random() * (life + idle) }
    slotLife.set(slotSeed, timing)
  }
  return timing
}

/**
 * Where a slot's meteor is at `time`: each slot burns on its own fixed cycle
 * with a random offset, and the flight inside a cycle is deterministic per
 * cycle index — so reversing time replays the same streaks in reverse.
 */
export function meteorPhase(slotSeed: number, time: number): MeteorPhase {
  const { life, cycle, offset } = slotTiming(slotSeed)
  const t = time - offset
  const index = Math.floor(t / cycle)
  const age = t - index * cycle
  return { spawn: meteorSpawn(slotSeed, index), age, life, cycle }
}

/**
 * Head position for an age: straight flight along the tangent. Ages past the
 * life are clamped by the caller — during the idle stretch the alpha is zero
 * anyway.
 */
export function meteorPoint(spawn: MeteorSpawn, age: number, target: Vector3): Vector3 {
  return target.copy(spawn.origin).addScaledVector(spawn.velocity, age)
}

/**
 * Head brightness over the flight: a quick flare-in, a longer fade-out,
 * exactly zero outside the flight (the idle stretch stays dark).
 */
export function meteorAlpha(age: number, life: number): number {
  if (age <= 0 || age >= life) return 0
  const flare = Math.min(age / (life * 0.2), 1)
  const decay = Math.min((life - age) / (life * 0.45), 1)
  return flare * decay
}
