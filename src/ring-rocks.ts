/**
 * The ring's coarse cargo: a deterministic scattering of ice blocks inside
 * Vesper's ring annulus, for flights that pass through the plane. The fine
 * banding stays with the ring shader; the layout only has to respect the
 * same broad truth — the Cassini gap is swept clear (the shepherd's doing),
 * and the ice is thin off the annulus edges. The span is the honest ring
 * system from orbits.ts, so the shader, the rocks and the shepherd share
 * one geometry.
 */
import { createRandom } from './random.ts'
import { VESPER_GAP_CORE, VESPER_RING_INNER, VESPER_RING_OUTER } from './orbits.ts'

export const RING_INNER = VESPER_RING_INNER
export const RING_OUTER = VESPER_RING_OUTER
/** Half-thickness of the rock layer, scene units: a sheet, not a cloud. */
export const RING_THICKNESS = 0.02

export type RingRockLayout = {
  count: number
  /** Flat xyz triplets in Vesper's local frame (ring plane = local XZ). */
  positions: Float32Array
  /** Per-rock scale in scene units. */
  scales: Float32Array
}

/** Mirror of the Cassini suppression in vesperRingDensity (Vesper.tsx):
 * 1 across the swept core [0.64, gap core], fading to 0 on its shoulders. */
function cassiniSuppression(t: number) {
  const rise = Math.min(Math.max((t - 0.6) / 0.04, 0), 1)
  const fall = Math.min(Math.max((t - VESPER_GAP_CORE) / 0.04, 0), 1)
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
    // Honest ice: ring blocks from metres to tens of metres — a visual
    // minimum so the LOD layer reads at flight distance; the honest
    // distribution tops out near 60 m.
    scales[placed] = 0.001 + Math.pow(random(), 2.2) * 0.009
    placed += 1
  }
  return { count, positions, scales }
}
