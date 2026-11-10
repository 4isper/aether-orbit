import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { arcPoint, prominenceEnvelope } from './prominences.ts'

test('the envelope rises, holds, then decays inside the active window', () => {
  assert.equal(prominenceEnvelope(0), 0)
  const midRise = prominenceEnvelope(0.1)
  assert.ok(midRise > 0 && midRise < 1, `mid-rise ${midRise}`)
  assert.equal(prominenceEnvelope(0.3), 1)
  const midFall = prominenceEnvelope(0.5)
  assert.ok(midFall > 0 && midFall < 1, `mid-fall ${midFall}`)
  assert.equal(prominenceEnvelope(0.65), 0)
  assert.equal(prominenceEnvelope(0.9), 0)
})

test('the envelope is periodic and wraps negative phases', () => {
  assert.equal(prominenceEnvelope(1), 0)
  assert.equal(prominenceEnvelope(1.3), 1)
  assert.equal(prominenceEnvelope(-0.2), 0)
  assert.equal(prominenceEnvelope(-0.7), 1)
})

test('the envelope moves monotonically while rising and decaying', () => {
  let previous = prominenceEnvelope(0)
  for (let p = 0.01; p <= 0.2 + 1e-9; p += 0.01) {
    const value = prominenceEnvelope(p)
    assert.ok(value >= previous, `dipped while rising at ${p}`)
    previous = value
  }
  assert.equal(previous, 1)
  for (let p = 0.41; p <= 0.6 + 1e-9; p += 0.01) {
    const value = prominenceEnvelope(p)
    assert.ok(value <= previous, `rose while decaying at ${p}`)
    previous = value
  }
  assert.equal(previous, 0)
})

test('the envelope never jumps between adjacent phases', () => {
  let previous = prominenceEnvelope(0)
  for (let p = 0.002; p < 1; p += 0.002) {
    const value = prominenceEnvelope(p)
    assert.ok(Math.abs(value - previous) < 0.06, `jump ${Math.abs(value - previous)} at phase ${p}`)
    previous = value
  }
})

test('loop ends sit on the photosphere at the footpoints', () => {
  const a = new Vector3(1, 0, 0)
  const b = new Vector3(0, 0, 1)
  const start = arcPoint(a, b, 0.25, 0, new Vector3())
  const end = arcPoint(a, b, 0.25, 1, new Vector3())
  assert.ok(start.distanceTo(a) < 1e-9, `start ${start.toArray()}`)
  assert.ok(end.distanceTo(b) < 1e-9, `end ${end.toArray()}`)
})

test('the loop apex rises above the photosphere between the footpoints', () => {
  const a = new Vector3(1, 0, 0)
  const b = new Vector3(0, 0, 1)
  const apex = arcPoint(a, b, 0.25, 0.5, new Vector3())
  assert.ok(Math.abs(apex.length() - 1.25) < 1e-9, `apex radius ${apex.length()}`)
  const overFootpoints = a.clone().normalize().add(b).normalize()
  assert.ok(apex.clone().normalize().dot(overFootpoints) > 0.999, `apex direction ${apex.toArray()}`)
})

test('coincident footpoints do not collapse the loop', () => {
  const a = new Vector3(0, 1, 0)
  const mid = arcPoint(a, a, 0.2, 0.5, new Vector3())
  assert.ok(Math.abs(mid.length() - 1.2) < 1e-9, `mid radius ${mid.length()}`)
  assert.ok(mid.distanceTo(a) > 0, 'midpoint stayed on the surface')
})
