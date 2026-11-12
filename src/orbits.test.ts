import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { aureliaClock, moonPhaseAngle, orbitPoint, planetPeriod, planetPosition, starFlux } from './orbits.ts'
import { planetIds } from './planets.ts'

const scratch = new Vector3()

test('planets stay on a circle of constant radius', () => {
  for (const id of planetIds) {
    const radius = planetPosition(id, 0, new Vector3()).length()
    assert.ok(radius > 0, `${id} radius should be positive`)
    for (let t = 0; t <= 500; t += 7.3) {
      const distance = planetPosition(id, t, scratch).length()
      assert.ok(
        Math.abs(distance - radius) < 1e-9,
        `${id} drifted off its orbit radius at t=${t}`,
      )
    }
  }
})

test('orbits are tilted but stay close to the ecliptic', () => {
  for (const id of planetIds) {
    const radius = orbitPoint(id, 0, new Vector3()).length()
    let maxLift = 0
    for (let i = 0; i < 360; i++) {
      maxLift = Math.max(maxLift, Math.abs(orbitPoint(id, (i / 360) * Math.PI * 2, scratch).y))
    }
    assert.ok(maxLift > 0, `${id} orbit should be tilted`)
    assert.ok(maxLift < 0.15 * radius, `${id} tilt should stay shallow`)
  }
})

test('angle 0 sits on the +X axis', () => {
  const point = orbitPoint('aurelia', 0, new Vector3())
  assert.ok(point.y === 0)
  assert.ok(point.z === 0)
  assert.ok(point.x > 0)
})

test('planet positions move continuously', () => {
  for (const id of planetIds) {
    const previous = planetPosition(id, 100, new Vector3())
    for (let t = 100.5; t < 140; t += 0.5) {
      const next = planetPosition(id, t, scratch)
      const step = previous.distanceTo(next)
      assert.ok(step < 1, `${id} jumped ${step} units between t=${t - 0.5} and t=${t}`)
      previous.copy(next)
    }
  }
})

test('the moon orbits outside the synchronous orbit', () => {
  // Below the synchronous orbit the tide keeps pulling the moon in: no
  // stable satellite can orbit faster than its planet spins.
  const day = (Math.PI * 2) / aureliaClock.spin
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  assert.ok(month > day, `moon period ${month.toFixed(1)} is not above the ${day.toFixed(1)} day`)
})

test('the moon makes a handful of orbits per year, Earth-scale', () => {
  const year = planetPeriod('aurelia')
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  const monthsPerYear = year / month
  assert.ok(
    monthsPerYear > 2 && monthsPerYear < 7,
    `${monthsPerYear.toFixed(1)} months per year is outside the plausible band`,
  )
})

test('the moon phase angle advances exactly with the shared clock', () => {
  assert.ok(Math.abs(moonPhaseAngle(0) - aureliaClock.moonPhase) < 1e-12)
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  // One month later the angle has gained exactly one full turn, whatever the
  // starting phase: the tidal lock depends on this being exact.
  const gain = moonPhaseAngle(month) - moonPhaseAngle(0)
  assert.ok(Math.abs(gain - Math.PI * 2) < 1e-9, `per-month gain ${gain}`)
  // Negative time (reversed playback) rewinds the phase by the same law.
  assert.ok(Math.abs(moonPhaseAngle(-month) - moonPhaseAngle(0) + Math.PI * 2) < 1e-9)
})

test('a year of Aurelia holds several day-night cycles', () => {
  const year = planetPeriod('aurelia')
  const day = (Math.PI * 2) / aureliaClock.spin
  const daysPerYear = year / day
  assert.ok(
    daysPerYear > 2 && daysPerYear < 60,
    `${daysPerYear.toFixed(1)} days per year is outside the plausible band`,
  )
})

test('planet speeds follow Kepler-3 relative to Aurelia', () => {
  // T ∝ a^1.5, so the mean motion must fall off as a^-1.5 across the system.
  const aurelia = {
    radius: orbitPoint('aurelia', 0, new Vector3()).length(),
    speed: (Math.PI * 2) / planetPeriod('aurelia'),
  }
  for (const id of ['cinder', 'vesper'] as const) {
    const radius = orbitPoint(id, 0, new Vector3()).length()
    const speed = (Math.PI * 2) / planetPeriod(id)
    const expected = aurelia.speed * Math.pow(aurelia.radius / radius, 1.5)
    const deviation = Math.abs(speed / expected - 1)
    assert.ok(
      deviation < 0.01,
      `${id} speed deviates ${(deviation * 100).toFixed(1)}% from Kepler-3`,
    )
  }
})

test('starlight falls off with distance, unity at Aurelia', () => {
  assert.ok(Math.abs(starFlux(new Vector3(9, 0, 0)) - 1) < 1e-9)
  const cinder = starFlux(new Vector3(14, 0, 0))
  const vesper = starFlux(new Vector3(20, 0, 0))
  assert.ok(Math.abs(cinder - (9 / 14) ** 1.5) < 1e-9, `Cinder flux ${cinder}`)
  assert.ok(Math.abs(vesper - (9 / 20) ** 1.5) < 1e-9, `Vesper flux ${vesper}`)
  assert.ok(cinder > vesper, 'inner worlds must receive more light')
})
