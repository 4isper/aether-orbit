import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { cometOrbit, cometOrbitPoint, cometPosition, tailParticlePosition } from './comet.ts'

const scratch = new Vector3()

const HEAD = new Vector3(4, 0.5, -2)
const VELOCITY = new Vector3(0.8, -0.2, 0.4)
const ANTI_SUN = HEAD.clone().normalize()
const TAIL_LENGTH = 6

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

test('tail particles stream away from the star', () => {
  const point = tailParticlePosition(
    1, TAIL_LENGTH, 0, 0, HEAD, new Vector3(), ANTI_SUN, 0, 0, new Vector3(),
  )
  const expected = HEAD.clone().addScaledVector(ANTI_SUN, TAIL_LENGTH)
  assert.ok(point.distanceTo(expected) < 1e-9, `point ${point.toArray()}`)
})

test('velocity lag pulls tail particles back along the path of motion', () => {
  const noLag = tailParticlePosition(
    1, TAIL_LENGTH, 0, 0, HEAD, VELOCITY, ANTI_SUN, 0, 0, new Vector3(),
  )
  const lagged = tailParticlePosition(
    1, TAIL_LENGTH, 0.32, 0, HEAD, VELOCITY, ANTI_SUN, 0, 0, new Vector3(),
  )
  const shift = lagged.clone().sub(noLag)
  assert.ok(shift.dot(VELOCITY) < 0, `shift ${shift.toArray()} opposes velocity`)
})

test('the dust tail curves farther off the anti-sun line than the ion tail', () => {
  const angleFromAntiSun = (lagCurve: number) => {
    const point = tailParticlePosition(
      1, TAIL_LENGTH, lagCurve, 0, HEAD, VELOCITY, ANTI_SUN, 0, 0, new Vector3(),
    )
    const direction = point.sub(HEAD).normalize()
    return Math.acos(direction.dot(ANTI_SUN))
  }
  const ion = angleFromAntiSun(0.32)
  const dust = angleFromAntiSun(1.05)
  assert.ok(dust > ion * 1.5, `dust ${dust} vs ion ${ion}`)
})

test('the comet tracks negative time the same as the equivalent positive time', () => {
  // Reversed playback feeds negative time into the same Kepler solver.
  const reversed = cometPosition(-42, new Vector3())
  const forward = cometPosition(-42 + cometOrbit.period, new Vector3())
  assert.ok(reversed.distanceTo(forward) < 1e-6, `gap ${reversed.distanceTo(forward)}`)
})
