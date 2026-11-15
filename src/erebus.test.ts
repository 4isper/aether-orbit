import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { keplerSpeed, orbitPoint } from './orbits.ts'
import { EREBUS_PERIAPSIS_RADIUS, erebusOrbit, erebusPeriod, erebusPosition, nextErebusPeriapsis } from './erebus.ts'

test('Erebus rides a deterministic ellipse, reversal included', () => {
  for (const time of [0, 137.4, -420, 900]) {
    const a = erebusPosition(time, new Vector3())
    const b = erebusPosition(time, new Vector3())
    assert.ok(a.distanceTo(b) < 1e-12, `position at t=${time} is not deterministic`)
  }
})

test('the ellipse stays tilted and reaches out past Vesper', () => {
  const vesperRadius = orbitPoint('vesper', 0, new Vector3()).length()
  let maxRadius = 0
  let maxTilt = 0
  for (let t = 0; t < erebusPeriod; t += 0.5) {
    const p = erebusPosition(t, new Vector3())
    maxRadius = Math.max(maxRadius, p.length())
    maxTilt = Math.max(maxTilt, Math.abs(p.y))
  }
  assert.ok(maxRadius > vesperRadius * 1.4, `apoapsis ${maxRadius} never leaves Vesper's neighborhood`)
  assert.ok(maxTilt > 0.5, `the orbit never leaves the ecliptic: tilt ${maxTilt}`)
})

test('periapsis dips just inside Vesper and matches the window radius', () => {
  const vesperRadius = orbitPoint('vesper', 0, new Vector3()).length()
  let minRadius = Infinity
  for (let t = 0; t < erebusPeriod; t += 0.05) {
    minRadius = Math.min(minRadius, erebusPosition(t, new Vector3()).length())
  }
  assert.ok(minRadius < vesperRadius, 'periapsis never overtakes Vesper')
  assert.ok(
    Math.abs(minRadius - 19.2) < 0.05,
    `closest approach ${minRadius} disagrees with the periapsis constant`,
  )
  assert.ok(EREBUS_PERIAPSIS_RADIUS > minRadius, 'the announced window never opens')
})

test('nextErebusPeriapsis finds the plunge and its edges', () => {
  const event = nextErebusPeriapsis(0)
  assert.ok(event.entry < event.peak && event.peak < event.exit, 'window edges are ordered')
  const peak = erebusPosition(event.peak, new Vector3()).length()
  assert.ok(
    Math.abs(peak - 19.2) < 0.05,
    `the announced peak sits ${peak} from the star, not at periapsis`,
  )
  const edgeOut = erebusPosition(event.exit + 0.5, new Vector3()).length()
  assert.ok(edgeOut > EREBUS_PERIAPSIS_RADIUS, 'exit sits outside the window radius')
  const mid = nextErebusPeriapsis(event.peak + 1)
  assert.ok(mid.inProgress, 'the plunge in progress goes unannounced')
  // The honest plunge window runs ±135 units around the peak; well past the
  // half-width the announcement must let go.
  const far = nextErebusPeriapsis(event.peak + 140)
  assert.ok(!far.inProgress, 'the window refuses to close')
})

test('Erebus flies the planets\' Kepler-3 too', () => {
  // One gravity constant: a dwarf's slow year is keplerSpeed at its
  // semi-major axis, not an authored pacing choice.
  const semiMajor = (erebusOrbit.periapsis + erebusOrbit.apoapsis) / 2
  const expected = (Math.PI * 2) / keplerSpeed(semiMajor)
  const first = nextErebusPeriapsis(0)
  const second = nextErebusPeriapsis(first.exit + 1)
  assert.ok(
    Math.abs(second.peak - first.peak - expected) < 1e-6,
    `Erebus year ${second.peak - first.peak} vs the honest ${expected}`,
  )
})
