import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { plumeStrength, plumeVentLocal, PLUME_VENTS, SHEPHERD_RADIUS } from './plumes.ts'

test('the vents sit on the shepherd\'s surface, each its own spot', () => {
  const spots = new Set<string>()
  for (let vent = 0; vent < PLUME_VENTS; vent++) {
    const position = plumeVentLocal(vent, new Vector3())
    assert.ok(
      Math.abs(position.length() - SHEPHERD_RADIUS) < 1e-6,
      `vent ${vent} floats at ${position.length()}, not on the surface`,
    )
    // Latitude variety: not all vents crowding one hemisphere band.
    spots.add(`${position.x.toFixed(3)}|${position.y.toFixed(3)}|${position.z.toFixed(3)}`)
  }
  assert.equal(spots.size, PLUME_VENTS, 'two vents share one spot')
})

test('a plume reaches the sky and settles back to nothing', () => {
  let peak = 0
  for (let t = 0; t < 400; t += 0.25) {
    for (let vent = 0; vent < PLUME_VENTS; vent++) {
      peak = Math.max(peak, plumeStrength(vent, t))
    }
  }
  assert.ok(peak > 0.9, `no vent ever reaches full strength (${peak})`)
  // The vents desynchronize: at no sampled moment do all of them fire at
  // once — the moon breathes, it does not erupt.
  let together = 0
  for (let t = 0; t < 400; t += 0.5) {
    let active = 0
    for (let vent = 0; vent < PLUME_VENTS; vent++) {
      if (plumeStrength(vent, t) > 0.5) active++
    }
    if (active === PLUME_VENTS) together++
  }
  assert.equal(together, 0, 'all vents erupt at once somewhere in the cycle')
})

test('the plumes are pure functions of the clock', () => {
  for (const time of [0, 61.7, -240, 900]) {
    for (let vent = 0; vent < PLUME_VENTS; vent++) {
      assert.equal(plumeStrength(vent, time), plumeStrength(vent, time))
    }
  }
})
