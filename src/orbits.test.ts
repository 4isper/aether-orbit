import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { orbitPoint, planetPosition } from './orbits.ts'
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
