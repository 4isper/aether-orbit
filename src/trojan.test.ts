import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { planetPosition, trojanPosition, TROJAN_LEAD_ANGLE } from './orbits.ts'

test('the trojan shares Aurelia\'s orbit and leads it by sixty degrees', () => {
  for (const time of [0, 55, 700, -240]) {
    const trojan = trojanPosition(time, new Vector3())
    const planet = planetPosition('aurelia', time, new Vector3())
    assert.ok(
      Math.abs(trojan.length() - planet.length()) < 1e-9,
      'same distance from the star, inclinations included',
    )
    // Both points lie in the same plane through the star, so the angle
    // between the position vectors is the angle along the orbit itself.
    const separation = trojan.angleTo(planet)
    assert.ok(
      Math.abs(separation - TROJAN_LEAD_ANGLE) < 1e-9,
      `separation ${separation} rad is not the configured ${TROJAN_LEAD_ANGLE}`,
    )
  }
})

test('the trojan rides the L4 point: ahead along the motion, not behind', () => {
  assert.equal(TROJAN_LEAD_ANGLE, Math.PI / 3)
  const time = 137
  const trojan = trojanPosition(time, new Vector3())
  const planet = planetPosition('aurelia', time, new Vector3())
  const next = planetPosition('aurelia', time + 0.01, new Vector3())
  const motion = next.sub(planet)
  const offset = trojan.sub(planet)
  assert.ok(offset.dot(motion) > 0, 'the trojan sits ahead of the planet')
})

test('the trojan is deterministic in both time directions', () => {
  assert.equal(
    trojanPosition(120, new Vector3()).x,
    trojanPosition(120, new Vector3()).x,
  )
})
