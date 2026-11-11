import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { ringCrossingRadius } from './ring-shadow.ts'

const NORMAL = new Vector3(0, 1, 0)

test('a sun ray from the winter hemisphere crosses the ring plane inside the annulus', () => {
  // South-east surface point, sun up and to the -X side: the ray exits upward
  // through the ring plane at radius sqrt(2.828^2 + 1.414^2) = 3.162.
  const point = new Vector3(0, -1.414, 1.414)
  const sun = new Vector3(-1, 0.5, 0).normalize()
  const radius = ringCrossingRadius(point, sun, NORMAL)
  assert.ok(Math.abs(radius - 3.162) < 1e-3, `crossing radius ${radius}`)
})

test('a sun ray from the summer hemisphere crosses behind the point', () => {
  // Mirror point on the sun-facing side: the plane crossing lies backward.
  const point = new Vector3(0, 1.414, 1.414)
  const sun = new Vector3(-1, 0.5, 0).normalize()
  assert.equal(ringCrossingRadius(point, sun, NORMAL), -1)
})

test('a sun ray parallel to the ring plane never crosses it', () => {
  const point = new Vector3(0, -1.414, 1.414)
  const sun = new Vector3(-1, 0, 0)
  assert.equal(ringCrossingRadius(point, sun, NORMAL), -1)
})

test('a surface point already facing the sun straight on never crosses the plane', () => {
  // South pole with the sun exactly overhead: t = 2 but the crossing sits at
  // the planet center, radius 0 - returned as a real radius, not a shadow.
  const point = new Vector3(0, -2, 0)
  const sun = new Vector3(0, 1, 0)
  const radius = ringCrossingRadius(point, sun, NORMAL)
  assert.ok(Math.abs(radius) < 1e-9, `crossing radius ${radius}`)
})

test('the crossing radius grows as the sun flattens toward the ring plane', () => {
  // Shallower sun light throws the shadow ring farther out.
  const point = new Vector3(0, -1.414, 1.414)
  const steep = ringCrossingRadius(point, new Vector3(-1, 1.2, 0).normalize(), NORMAL)
  const flat = ringCrossingRadius(point, new Vector3(-1, 0.35, 0).normalize(), NORMAL)
  assert.ok(flat > steep, `flat ${flat} should exceed steep ${steep}`)
})
