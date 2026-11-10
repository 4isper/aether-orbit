import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { orbitOffset, computeOverviewPose, PLANET_VIEW_DISTANCE } from './camera-math.ts'
import { planetIds } from './planets.ts'
import { planetPosition } from './orbits.ts'

const center = new Vector3(-1.8, 0.5, 0)
const out = new Vector3()

test('orbitOffset keeps the requested distance from the center', () => {
  for (const yaw of [-0.32, 0, 0.32]) {
    for (const pitch of [-0.18, 0, 0.18]) {
      for (const distance of [7.6, 9, 12.6]) {
        orbitOffset(center, yaw, pitch, distance, out)
        assert.ok(
          Math.abs(out.distanceTo(center) - distance) < 1e-9,
          `distance ${out.distanceTo(center)} != ${distance}`,
        )
      }
    }
  }
})

test('at yaw 0 the camera offset is tangential to the orbit', () => {
  orbitOffset(center, 0, 0, PLANET_VIEW_DISTANCE, out)
  const offset = out.clone().sub(center)
  const radial = center.clone().setY(0).normalize()
  assert.ok(Math.abs(offset.dot(radial)) < 1e-9)
})

test('the camera never crosses the star while following planets', () => {
  // Regression: with a fixed world-axis offset the camera used to fly straight
  // through the star as planets orbited.
  const compOffset = new Vector3(-1.8, 0.5, 0)
  for (const id of planetIds) {
    for (let t = 0; t < 500; t += 2.17) {
      const anchor = planetPosition(id, t, new Vector3()).add(compOffset)
      for (const yaw of [-0.32, 0, 0.32]) {
        for (const pitch of [-0.18, 0, 0.18]) {
          orbitOffset(anchor, yaw, pitch, PLANET_VIEW_DISTANCE, out)
          const distanceToStar = out.length()
          assert.ok(
            distanceToStar > 9,
            `${id} camera reached ${distanceToStar.toFixed(2)} from the star at t=${t}`,
          )
        }
      }
    }
  }
})

test('overview pose frames the system from a sane distance', () => {
  for (const size of [[1440, 900], [390, 844], [2560, 1080]]) {
    const pose = computeOverviewPose(size[0], size[1])
    const distance = pose.position.distanceTo(pose.target)
    assert.ok(Number.isFinite(distance) && distance > 20, `pose distance ${distance}`)
    assert.ok(Math.abs(pose.up.length() - 1) < 1e-9)
    for (const value of [...pose.target, ...pose.position]) {
      assert.ok(Number.isFinite(value))
    }
  }
})
