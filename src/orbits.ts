import { Vector3 } from 'three'
import type { PlanetId } from './planets'

export const orbitConfig: Record<PlanetId, { radius: number; speed: number; phase: number }> = {
  aurelia: { radius: 9, speed: 0.02, phase: 3.6 },
  cinder: { radius: 14, speed: 0.013, phase: 5.8 },
  vesper: { radius: 20, speed: 0.009, phase: 1.35 },
}

export function planetPosition(id: PlanetId, time: number, target: Vector3) {
  const { radius, speed, phase } = orbitConfig[id]
  const angle = phase + time * speed
  return target.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
}
