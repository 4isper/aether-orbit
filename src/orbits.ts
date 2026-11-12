import { Vector3 } from 'three'
import type { PlanetId } from './planets'

const orbitConfig: Record<PlanetId, { radius: number; speed: number; phase: number; inclination: number }> = {
  // Speeds follow Kepler-3 relative to Aurelia: w ∝ a^-1.5.
  aurelia: { radius: 9, speed: 0.02, phase: 3.6, inclination: 0.028 },
  cinder: { radius: 14, speed: 0.0103, phase: 5.8, inclination: 0.05 },
  vesper: { radius: 20, speed: 0.006, phase: 1.35, inclination: 0.075 },
}

/** Point on a planet's circular orbit, tilted by its inclination around the X axis. */
export function orbitPoint(id: PlanetId, angle: number, target: Vector3) {
  const { radius, inclination } = orbitConfig[id]
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return target.set(
    cos * radius,
    sin * radius * Math.sin(inclination),
    sin * radius * Math.cos(inclination),
  )
}

export function planetPosition(id: PlanetId, time: number, target: Vector3) {
  const { speed, phase } = orbitConfig[id]
  return orbitPoint(id, phase + time * speed, target)
}

/** Orbital period of a planet, in time units. */
export function planetPeriod(id: PlanetId) {
  return (Math.PI * 2) / orbitConfig[id].speed
}

/**
 * Starlight flux at a world position, unity at Aurelia's orbit. Bodies
 * multiply their diffuse light by this so outer worlds are genuinely dimmer
 * than the inner ones. The exponent 1.5 is an exposure compromise: a full
 * inverse-square law (Vesper at 0.20) reads as near-black up close, 1.5
 * keeps the falloff while the ice giant stays legible.
 */
export function starFlux(position: Vector3) {
  return (orbitConfig.aurelia.radius / Math.max(position.length(), 1e-4)) ** 1.5
}

/**
 * Aurelia's own clock: how fast the planet spins and how fast its moon
 * orbits. The moon must orbit above the synchronous orbit (its period above
 * the planet's day) or tides would pull it down; with these numbers the day
 * lasts ~60 units, the moon's month ~79, and a year holds ~4 months.
 */
export const aureliaClock = {
  /** Planet spin, radians per time unit. */
  spin: 0.105,
  /** Moon mean motion, radians per time unit. */
  moonAngularSpeed: 0.08,
  /** Moon orbit radius around Aurelia, in scene units. */
  moonOrbitRadius: 3.6,
  /** Moon phase at time zero: where in its orbit the month begins. */
  moonPhase: 2.1,
} as const

/**
 * Orientation of Aurelia's local frame in world space and of the moon orbit
 * inside it. Planet.tsx builds its scene graph from these same numbers, so
 * the pure geometry in eclipse.ts stays exact with a single source of truth.
 */
export const aureliaFrame = {
  /** Euler angles of the planet group in world space. */
  worldRotation: [0.08, 0, -0.09],
  /** Euler angles of the moon-orbit group inside the planet frame. */
  moonOrbitRotation: [0.24, 0, 0.09],
  /** Planet surface radius, scene units (before the compact-scale). */
  planetRadius: 2,
  /** Moon surface radius, scene units (before the compact-scale). */
  moonRadius: 0.34,
} as const

/** The moon's phase angle on Aurelia's shared clock: pure, so time reversal
 * and pause come for free and the tidal lock stays exact. */
export function moonPhaseAngle(time: number) {
  return aureliaClock.moonPhase + time * aureliaClock.moonAngularSpeed
}

/**
 * Vesper's own clock: the shepherd moon pacing the Cassini gap. Its orbit
 * radius sits inside the gap's core (the ring t in [0.64, 0.70] of the
 * density shared by Vesper.tsx) — one body, one story: the moon is what
 * keeps the gap swept clear.
 */
export const vesperClock = {
  /** Shepherd orbit radius in Vesper's local frame, scene units. */
  shepherdOrbitRadius: 3.5,
  /** Shepherd mean motion, radians per time unit — orbital-fast against the
   * planet's day, far slower than Aurelia's moon, as befits a lighter world. */
  shepherdAngularSpeed: 0.065,
  /** Where in its lap the shepherd starts. */
  shepherdPhase: 1.9,
} as const

/** The shepherd's angle on the shared clock: pure like the moon's phase. */
export function shepherdAngle(time: number) {
  return vesperClock.shepherdPhase + time * vesperClock.shepherdAngularSpeed
}

/** Shepherd position in Vesper's local frame: the ring plane is local XZ. */
export function shepherdLocalPosition(time: number, target: Vector3) {
  const angle = shepherdAngle(time)
  const radius = vesperClock.shepherdOrbitRadius
  return target.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
}
