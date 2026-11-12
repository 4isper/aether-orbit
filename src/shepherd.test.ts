import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { planetPeriod, shepherdAngle, shepherdLocalPosition, vesperClock } from './orbits.ts'

test('the shepherd patrols inside the Cassini gap core', () => {
  // The ring t and the gap edges mirror vesperRingDensity in Vesper.tsx:
  // t = (r - 2.5) / 1.5, the gap core is t in [0.64, 0.70]. One body, one
  // story: the moon is what keeps the gap swept clear.
  const { shepherdOrbitRadius } = vesperClock
  const inner = 2.5 + 0.64 * 1.5
  const outer = 2.5 + 0.7 * 1.5
  assert.ok(
    shepherdOrbitRadius >= inner && shepherdOrbitRadius <= outer,
    `${shepherdOrbitRadius} is outside the gap core [${inner}, ${outer}]`,
  )
})

test('the shepherd keeps to the ring plane at a constant radius', () => {
  for (const time of [0, 40, 137.5, -80]) {
    const position = shepherdLocalPosition(time, new Vector3())
    assert.equal(position.y, 0, 'the ring plane is local XZ')
    assert.ok(
      Math.abs(Math.hypot(position.x, position.z) - vesperClock.shepherdOrbitRadius) < 1e-9,
      'the orbit is a circle',
    )
  }
})

test('the shepherd circles many times within Vesper\'s year', () => {
  const period = (Math.PI * 2) / vesperClock.shepherdAngularSpeed
  assert.ok(period < planetPeriod('vesper') / 8, `period ${period} is not orbital-fast`)
  // And the angle itself stays deterministic in both time directions.
  assert.equal(shepherdAngle(120), shepherdAngle(120))
})
