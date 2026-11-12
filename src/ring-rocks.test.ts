import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ringRockLayout } from './ring-rocks.ts'

test('every rock sits inside the ring annulus, on a thin plane', () => {
  const layout = ringRockLayout(400, 2026)
  assert.equal(layout.count, 400)
  for (let i = 0; i < layout.count; i++) {
    const x = layout.positions[i * 3]
    const y = layout.positions[i * 3 + 1]
    const z = layout.positions[i * 3 + 2]
    const radius = Math.hypot(x, z)
    assert.ok(radius >= 2.5 && radius <= 4.0, `rock ${i} radius ${radius} leaves the annulus`)
    assert.ok(Math.abs(y) <= 0.035, `rock ${i} drifts ${y} off the ring plane`)
  }
})

test('the Cassini gap core stays swept, like the shepherd keeps it', () => {
  // The gap core is t in [0.64, 0.70] of the ring density in Vesper.tsx:
  // t = (r - 2.5) / 1.5. Rocks may thin toward the gap, never crowd it.
  const coreInner = 2.5 + 0.64 * 1.5
  const coreOuter = 2.5 + 0.7 * 1.5
  const layout = ringRockLayout(400, 2026)
  for (let i = 0; i < layout.count; i++) {
    const radius = Math.hypot(layout.positions[i * 3], layout.positions[i * 3 + 2])
    assert.ok(
      radius < coreInner || radius > coreOuter,
      `rock ${i} at r=${radius} squats in the swept gap`,
    )
  }
})

test('the layout is deterministic per seed and different across seeds', () => {
  const a = ringRockLayout(64, 77)
  const b = ringRockLayout(64, 77)
  const c = ringRockLayout(64, 78)
  assert.deepEqual(Array.from(a.positions), Array.from(b.positions))
  assert.notDeepEqual(Array.from(a.positions), Array.from(c.positions))
  // Scales are part of the deterministic layout too.
  assert.deepEqual(Array.from(a.scales), Array.from(b.scales))
})
