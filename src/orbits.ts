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
