import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { orbitPoint, planetPosition, trojanPosition, trojanTrailingPosition, TROJAN_LEAD_ANGLE, TROJAN_TRAIL_ANGLE } from './orbits.ts'

/** Aurelia's orbital-plane test: the tilt is around the world X axis, so
 * the plane through the star is exactly { −cos(i)·y + sin(i)·z = 0 }. */
const AURELIA_INCLINATION = 0.028
function planeDeviation(point: Vector3) {
  return Math.abs(-Math.cos(AURELIA_INCLINATION) * point.y + Math.sin(AURELIA_INCLINATION) * point.z)
}

test('the trojan rides the same ellipse and librates around sixty degrees', () => {
  // The pin is a mean-anomaly offset on the shared ellipse: Kepler II makes
  // the true-longitude separation breathe around ±60°, never straying far
  // from the balance point.
  for (const time of [0, 55, 700, -240]) {
    const trojan = trojanPosition(time, new Vector3())
    const planet = planetPosition('aurelia', time, new Vector3())
    assert.ok(planeDeviation(trojan) < 1e-9, 'the trojan left the orbital plane')
    assert.ok(planeDeviation(planet) < 1e-9, 'the planet left its own plane')
    const separation = trojan.angleTo(planet)
    assert.ok(
      Math.abs(separation - TROJAN_LEAD_ANGLE) < 0.06,
      `separation ${separation} rad strayed from the configured ${TROJAN_LEAD_ANGLE}`,
    )
    // Same ellipse: both radii live between the shared periapsis and
    // apoapsis, never outside.
    const peri = orbitPoint('aurelia', 0, new Vector3()).length()
    const apo = orbitPoint('aurelia', Math.PI, new Vector3()).length()
    assert.ok(trojan.length() >= peri - 1e-6 && trojan.length() <= apo + 1e-6, 'the trojan left the ellipse')
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

test('the trailer shares the ellipse and hangs sixty degrees behind', () => {
  for (const time of [0, 55, 700, -240]) {
    const trailer = trojanTrailingPosition(time, new Vector3())
    const planet = planetPosition('aurelia', time, new Vector3())
    assert.ok(planeDeviation(trailer) < 1e-9, 'the trailer left the orbital plane')
    const separation = trailer.angleTo(planet)
    assert.ok(
      Math.abs(separation - Math.abs(TROJAN_TRAIL_ANGLE)) < 0.06,
      `separation ${separation} rad strayed from the configured ${TROJAN_TRAIL_ANGLE}`,
    )
  }
})

test('the trailer rides the L5 point: behind along the motion, not ahead', () => {
  assert.equal(TROJAN_TRAIL_ANGLE, -Math.PI / 3)
  const time = 137
  const trailer = trojanTrailingPosition(time, new Vector3())
  const planet = planetPosition('aurelia', time, new Vector3())
  const next = planetPosition('aurelia', time + 0.01, new Vector3())
  // The twins hold opposite flanks, 120 degrees of longitude apart with a
  // libration band either side. Measured before the sub below mutates the
  // trailer into a planet-relative offset.
  const leader = trojanPosition(time, new Vector3())
  const twins = leader.angleTo(trailer)
  const motion = next.sub(planet)
  const offset = trailer.sub(planet)
  assert.ok(offset.dot(motion) < 0, 'the trailer sits behind the planet')
  assert.ok(
    Math.abs(twins - (Math.PI * 2) / 3) < 0.12,
    `the twins are ${twins} rad apart`,
  )
})

test('the trailer is deterministic in both time directions', () => {
  assert.equal(
    trojanTrailingPosition(120, new Vector3()).x,
    trojanTrailingPosition(120, new Vector3()).x,
  )
})
