/**
 * The ring's coarse cargo: a deterministic scattering of ice blocks inside
 * Vesper's ring annulus, for flights that pass through the plane. The fine
 * banding stays with the ring shader; the layout only has to respect the
 * same broad truth — the Cassini gap is swept clear (the shepherd's doing),
 * and the ice is thin off the annulus edges.
 */
import { createRandom } from './random.ts'

export const RING_INNER = 2.5
export const RING_OUTER = 4.0
/** Half-thickness of the rock layer, scene units: a sheet, not a cloud. */
export const RING_THICKNESS = 0.035

export type RingRockLayout = {
  count: number
  /** Flat xyz triplets in Vesper's local frame (ring plane = local XZ). */
  positions: Float32Array
  /** Per-rock scale in scene units. */
  scales: Float32Array
}

/** Mirror of the Cassini suppression in vesperRingDensity (Vesper.tsx):
 * 1 at the gap's core, fading to 0 on its shoulders. */
function cassiniSuppression(t: number) {
  const rise = Math.min(Math.max((t - 0.6) / 0.04, 0), 1)
  const fall = Math.min(Math.max((t - 0.7) / 0.04, 0), 1)
  return rise * (1 - fall)
}

/**
 * Seed-reproducible layout: radii drawn uniformly across the annulus,
 * accepted or rejected by the gap suppression (rejection sampling), angles
 * uniform, height thin. Same seed, same sky.
 */
export function ringRockLayout(count: number, seed: number): RingRockLayout {
  const random = createRandom(seed)
  const positions = new Float32Array(count * 3)
  const scales = new Float32Array(count)
  let placed = 0
  while (placed < count) {
    const t = random()
    if (random() < cassiniSuppression(t)) continue
    const radius = RING_INNER + t * (RING_OUTER - RING_INNER)
    const angle = random() * Math.PI * 2
    const height = (random() - 0.5) * 2 * RING_THICKNESS
    positions[placed * 3] = Math.cos(angle) * radius
    positions[placed * 3 + 1] = height
    positions[placed * 3 + 2] = Math.sin(angle) * radius
    scales[placed] = 0.02 + Math.pow(random(), 2.2) * 0.042
    placed += 1
  }
  return { count, positions, scales }
}
