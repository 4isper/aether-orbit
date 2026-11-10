import { Vector3 } from 'three'
import type { PlanetId } from './planets'

const orbitConfig: Record<PlanetId, { radius: number; speed: number; phase: number; inclination: number }> = {
  aurelia: { radius: 9, speed: 0.02, phase: 3.6, inclination: 0.028 },
  cinder: { radius: 14, speed: 0.013, phase: 5.8, inclination: 0.05 },
  vesper: { radius: 20, speed: 0.009, phase: 1.35, inclination: 0.075 },
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
} as const
