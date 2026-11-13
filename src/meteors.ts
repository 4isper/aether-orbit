/**
 * Meteor geometry as pure functions of time, the same discipline as
 * prominences.ts and eclipse.ts: a spawn is drawn deterministically from
 * (slot seed, cycle index), so the streak is stable under pause, time
 * reversal and restarts, and the component only samples positions.
 *
 * Beneath the ambient slots lies the shower: a seeded cycle of rain — one
 * radiant per shower, six dense slots streaming from it, gated by a
 * rise-hold-decay envelope — announced ahead through the shared window scan.
 */
import { Vector3 } from 'three'
import { createRandom } from './random.ts'
import { cycleEnvelope, seededCycle } from './cycles.ts'
import { nextWindow } from './eclipse.ts'

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

/**
 * The shower: a dusty trail crosses the system's sky on its own seeded
 * cycle, and while it holds, every extra slot streams from one radiant —
 * parallel trajectories converging on a single point, as real showers do.
 */
const SHOWER_RISE_END = 0.05
const SHOWER_HOLD_END = 0.1
const SHOWER_ACTIVE_END = 0.16

/** The rain's own clock: seeded once, fixed forever. */
const showerCycle = seededCycle(7741, 320, 460)

/** An announced shower is one the eye actually sees: below this the veil is
 * too thin to tell apart from the ambient blink. */
export const SHOWER_THRESHOLD = 0.5

/** The shower's period, in time units — exported so tests can walk cycles. */
export const SHOWER_PERIOD = showerCycle.period

/** Shower density at simulation time, 0 quiet to 1 full rain. */
export function showerIntensity(time: number) {
  return cycleEnvelope((time - showerCycle.offset) / showerCycle.period, SHOWER_RISE_END, SHOWER_HOLD_END, SHOWER_ACTIVE_END)
}

/** Extra slots that burn only while the shower holds, dense and desynced. */
export const SHOWER_SLOTS = [2113, 5801, 9283, 3461, 7057, 8161]

const showerSlotLife = new Map<number, { life: number; cycle: number; offset: number }>()

function showerSlotTiming(slotSeed: number) {
  let timing = showerSlotLife.get(slotSeed)
  if (!timing) {
    const random = createRandom(slotSeed)
    const life = 0.7 + random() * 0.7
    const idle = 0.15 + random() * 0.55
    timing = { life, cycle: life + idle, offset: random() * (life + idle) }
    showerSlotLife.set(slotSeed, timing)
  }
  return timing
}

/**
 * The sky point every streak of one shower flies away from: a unit
 * direction seeded per shower, so each rain has its own radiant. The seed
 * goes through mixSeed: early simulation times yield negative shower
 * indexes, and a negative seed would poison the LCG with negative draws.
 */
export function showerRadiant(showerIndex: number, target: Vector3): Vector3 {
  const random = createRandom(mixSeed(5501, showerIndex))
  const theta = random() * Math.PI * 2
  const phi = Math.acos(2 * random() - 1)
  return target.set(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  )
}

/**
 * One shower streak: the origin gathers near the radiant, the velocity
 * points straight away from it with a small per-slot jitter — parallel
 * trajectories, not a cone. Deterministic per (slot, slot cycle, shower).
 */
export function showerSpawn(slotSeed: number, cycleIndex: number, showerIndex: number): MeteorSpawn {
  const random = createRandom(mixSeed(slotSeed ^ Math.imul(showerIndex, 19349663), cycleIndex))
  const radiant = showerRadiant(showerIndex, scratchDir)
  // The jitter rides a strictly perpendicular axis: origins stay clustered
  // around the radiant and trajectories stay parallel to the anti-radiant.
  scratchUp.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize()
  if (Math.abs(scratchUp.dot(radiant)) > 0.9) {
    scratchUp.set(radiant.y, -radiant.x, 0)
    if (scratchUp.lengthSq() < 1e-6) scratchUp.set(0, radiant.z, -radiant.y)
    scratchUp.normalize()
  }
  const perp = scratchUp.clone().addScaledVector(radiant, -scratchUp.dot(radiant)).normalize()
  const origin = radiant.clone()
    .addScaledVector(perp, 0.6 * random())
    .normalize()
    .multiplyScalar(METEOR_ORBIT_RADIUS[0] + random() * (METEOR_ORBIT_RADIUS[1] - METEOR_ORBIT_RADIUS[0]))
  const velocity = radiant.clone()
    .multiplyScalar(-1)
    .addScaledVector(perp, 0.18 * random())
    .normalize()
    .multiplyScalar(METEOR_SPEED[0] + random() * (METEOR_SPEED[1] - METEOR_SPEED[0]))
  return { origin, velocity }
}

/**
 * Where a shower slot's streak is at `time`: the dense slot timing of the
 * rain, with the spawn anchored to the radiant of the shower in progress.
 */
export function showerMeteor(slotSeed: number, time: number): MeteorPhase {
  const { life, cycle, offset } = showerSlotTiming(slotSeed)
  const t = time - offset
  const index = Math.floor(t / cycle)
  const age = t - index * cycle
  const showerIndex = Math.floor((time - showerCycle.offset) / showerCycle.period)
  return { spawn: showerSpawn(slotSeed, index, showerIndex), age, life, cycle }
}

/**
 * The next shower at or after `now`: the shared window scan over the
 * activity envelope, so entry/peak/exit and inProgress mean the same
 * as they do for transits, eclipses and storms.
 */
export function nextShower(now: number) {
  return nextWindow(now, {
    measure: (time) => 1 - showerIntensity(time),
    threshold: 1 - SHOWER_THRESHOLD,
    horizon: SHOWER_PERIOD * 1.25,
  })
}
