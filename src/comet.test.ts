import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { cometOrbit, cometOrbitPoint, cometPosition } from './comet.ts'

const scratch = new Vector3()

test('periapsis and apoapsis match the configured ellipse', () => {
  const peri = cometOrbitPoint(0, scratch).length()
  const apo = cometOrbitPoint(Math.PI, scratch).length()
  assert.ok(Math.abs(peri - cometOrbit.periapsis) < 1e-6, `periapsis ${peri}`)
  assert.ok(Math.abs(apo - cometOrbit.apoapsis) < 1e-6, `apoapsis ${apo}`)
})

test('the orbit repeats after one period', () => {
  const start = cometPosition(0, new Vector3())
  const end = cometPosition(cometOrbit.period, scratch)
  assert.ok(start.distanceTo(end) < 1e-6)
})

test('the Kepler solver stays continuous across a full orbit', () => {
  let previous = cometOrbitPoint(0, new Vector3())
  for (let m = 0.01; m <= Math.PI * 2; m += 0.01) {
    const current = cometOrbitPoint(m, scratch)
    const step = previous.distanceTo(current)
    assert.ok(step < 0.5, `position jumped ${step} at mean anomaly ${m}`)
    const radius = current.length()
    assert.ok(radius >= cometOrbit.periapsis - 1e-6, `radius ${radius} below periapsis at m=${m}`)
    assert.ok(radius <= cometOrbit.apoapsis + 1e-6, `radius ${radius} above apoapsis at m=${m}`)
    previous.copy(current)
  }
})

test('the comet moves faster near periapsis than near apoapsis (Kepler II)', () => {
  const meanMotion = (Math.PI * 2) / cometOrbit.period
  const timeAtPeriapsis = ((Math.PI * 2 - cometOrbit.meanAnomalyAtZero) % (Math.PI * 2)) / meanMotion
  const timeAtApoapsis = ((Math.PI - cometOrbit.meanAnomalyAtZero) % (Math.PI * 2)) / meanMotion
  const nearPeri = cometPosition(timeAtPeriapsis - 0.4, new Vector3())
    .distanceTo(cometPosition(timeAtPeriapsis, scratch))
  const nearApo = cometPosition(timeAtApoapsis - 0.4, new Vector3())
    .distanceTo(cometPosition(timeAtApoapsis, scratch))
  assert.ok(nearPeri > nearApo * 2, `periapsis step ${nearPeri} vs apoapsis step ${nearApo}`)
})
