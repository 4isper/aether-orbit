/**
 * The shepherd's plumes, as pure functions of the simulation time — the
 * same discipline as lightning.ts and cyclone.ts: a few cryo-vents on the
 * little moon erupt on seeded cycles of their own, feeding the ice the
 * rings are made of. Pause, time reversal and deep links replay the same
 * eruption; nothing random after the first seeding.
 */
import { Vector3 } from 'three'
import { cycleEnvelope, seededCycle } from './cycles.ts'
import { createRandom } from './random.ts'

/** The shepherd's surface radius, mirroring the mesh in Vesper.tsx: a
 * ~320 km ice moon, honest for a ring shepherd. */
export const SHEPHERD_RADIUS = 0.05

/** How many cryo-vents the little moon carries. */
export const PLUME_VENTS = 3

/**
 * Each vent's spot on the surface (seeded once, fixed forever). The clock
 * is shared: one lap, three shifts — the vents take turns, so the moon
 * breathes in sequence instead of erupting all over at once.
 */
type Vent = { local: Vector3; slot: number }

const vents: Vent[] = (() => {
  const random = createRandom(9137)
  const list: Vent[] = []
  for (let vent = 0; vent < PLUME_VENTS; vent++) {
    // Even longitude spacing with a seeded wobble; latitudes sit in the
    // moon's temperate band, away from the orbital poles.
    const azimuth = (vent / PLUME_VENTS) * Math.PI * 2 + (random() - 0.5) * 1.2
    const polar = Math.PI / 2 + (random() - 0.5) * 0.9
    const local = new Vector3(
      Math.sin(polar) * Math.cos(azimuth),
      Math.cos(polar),
      Math.sin(polar) * Math.sin(azimuth),
    ).multiplyScalar(SHEPHERD_RADIUS)
    list.push({ local, slot: vent / PLUME_VENTS })
  }
  return list
})()

const shared = seededCycle(4153, 45, 70)

/** A vent's spot in the shepherd's local frame — on the surface. */
export function plumeVentLocal(vent: number, target: Vector3): Vector3 {
  return target.copy(vents[vent].local)
}

/**
 * Plume strength at simulation time: 0 while the vent rests, 1 while its
 * fountain holds. The phase subtracts the vent's slot, so the three shifts
 * hand the eruption to each other in sequence.
 */
export function plumeStrength(vent: number, time: number) {
  const phase = (time - shared.offset) / shared.period - vents[vent].slot
  return cycleEnvelope(phase, 0.16, 0.3, 0.42)
}
