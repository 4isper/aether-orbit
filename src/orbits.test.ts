import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { aureliaClock, orbitPoint, planetPeriod, planetPosition } from './orbits.ts'
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
