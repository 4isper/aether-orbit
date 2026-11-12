import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import {
  clampPose,
  orbitOffset,
  computeOverviewPose,
  parsePose,
  poseParams,
  rotateOverviewPose,
  pinchZoom,
  shiftIntoFrame,
  viewZoomBounds,
  COMET_VIEW_DISTANCE,
  MAX_ZOOM,
  MIN_ZOOM,
  PLANET_VIEW_DISTANCE,
  STAR_VIEW_DISTANCE,
} from './camera-math.ts'
import { planetIds } from './planets.ts'
import { planetPosition } from './orbits.ts'

const center = new Vector3(-1.8, 0.5, 0)
const out = new Vector3()

test('pose params round-trip through parse', () => {
  const pose = { yaw: 0.21, pitch: -0.05, zoom: 9.4 }
  const parsed = parsePose(new URLSearchParams(poseParams(pose)))
  assert.ok(parsed, 'parsed a pose')
  assert.ok(Math.abs(parsed.yaw - pose.yaw) < 1e-3)
  assert.ok(Math.abs(parsed.pitch - pose.pitch) < 1e-3)
  assert.ok(Math.abs(parsed.zoom - pose.zoom) < 1e-3)
})

test('parse returns null for missing or malformed params', () => {
  assert.equal(parsePose(new URLSearchParams()), null)
  assert.equal(parsePose(new URLSearchParams('yaw=abc&pitch=0&zoom=9')), null)
  assert.equal(parsePose(new URLSearchParams('yaw=0.2&pitch=0')), null)
})

test('clampPose holds every component inside the view bounds', () => {
  const clamped = clampPose({ yaw: 5, pitch: -3, zoom: 100 }, 'vesper')
  const bounds = viewZoomBounds('vesper')
  assert.ok(Math.abs(clamped.yaw) <= 0.32, `yaw ${clamped.yaw}`)
  assert.ok(Math.abs(clamped.pitch) <= 0.18, `pitch ${clamped.pitch}`)
  assert.ok(clamped.zoom <= bounds.max && clamped.zoom >= bounds.min)
})

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

test('overview rotation with zero angles reproduces the base pose', () => {
  const pose = computeOverviewPose(1440, 900)
  const out = { position: new Vector3(), up: new Vector3() }
  rotateOverviewPose(pose, 0, 0, 1, out)
  assert.ok(out.position.distanceTo(pose.position) < 1e-9)
  assert.ok(out.up.distanceTo(pose.up) < 1e-9)
})

test('overview yaw orbits the camera around the target at constant distance', () => {
  const pose = computeOverviewPose(1440, 900)
  const out = { position: new Vector3(), up: new Vector3() }
  rotateOverviewPose(pose, 0.4, 0, 1, out)
  const baseRadius = pose.position.distanceTo(pose.target)
  assert.ok(Math.abs(out.position.distanceTo(pose.target) - baseRadius) < 1e-9)
  const azimuth = (v: Vector3) => Math.atan2(v.x - pose.target.x, v.z - pose.target.z)
  const delta = azimuth(out.position) - azimuth(pose.position)
  assert.ok(Math.abs(delta - 0.4) < 1e-9, `azimuth delta ${delta}`)
  assert.ok(Math.abs(out.up.length() - 1) < 1e-9)
})

test('overview zoom scales the distance to the target', () => {
  const pose = computeOverviewPose(1440, 900)
  const out = { position: new Vector3(), up: new Vector3() }
  rotateOverviewPose(pose, 0, 0, 1.3, out)
  const baseRadius = pose.position.distanceTo(pose.target)
  assert.ok(Math.abs(out.position.distanceTo(pose.target) - baseRadius * 1.3) < 1e-9)
})

test('overview pitch is clamped so the camera never dives under the plane', () => {
  const pose = computeOverviewPose(1440, 900)
  const out = { position: new Vector3(), up: new Vector3() }
  rotateOverviewPose(pose, 0, 10, 1, out)
  assert.ok(out.position.y > 0, `camera fell below the ecliptic: y=${out.position.y}`)
  rotateOverviewPose(pose, 0, -10, 1, out)
  const elevation = Math.asin(
    (out.position.y - pose.target.y) / out.position.distanceTo(pose.target),
  )
  assert.ok(elevation >= -0.12 - 1e-9, `elevation ${elevation} below the clamp`)
})

test('pinch out moves the camera closer, pinch in moves it away', () => {
  // zoom is the camera distance: fingers apart (2x) should halve it.
  assert.ok(Math.abs(pinchZoom(10, 100, 200, 5, 40) - 5) < 1e-9)
  assert.ok(Math.abs(pinchZoom(10, 200, 100, 5, 40) - 20) < 1e-9)
})

test('pinch zoom clamps to the view range', () => {
  assert.equal(pinchZoom(10, 300, 50, 5, 40), 40)
  assert.equal(pinchZoom(10, 50, 300, 5, 40), 5)
})

test('pinch zoom ignores degenerate distances', () => {
  assert.equal(pinchZoom(10, 0, 100, 5, 40), 10)
  assert.equal(pinchZoom(10, 100, 0, 5, 40), 10)
})

test('pinch zoom scales from the gesture start, so it is restartable', () => {
  // every frame recomputes from the same base, never compounding drift
  const first = pinchZoom(9, 120, 60, 5, 40)
  const again = pinchZoom(9, 120, 60, 5, 40)
  assert.equal(first, again)
})

test('viewZoomBounds gives every flyable view its distance and clamp', () => {
  for (const view of ['aurelia', 'cinder', 'vesper'] as const) {
    const bounds = viewZoomBounds(view)
    assert.equal(bounds.distance, PLANET_VIEW_DISTANCE)
    assert.equal(bounds.min, MIN_ZOOM)
    assert.equal(bounds.max, MAX_ZOOM)
  }
  assert.equal(viewZoomBounds('star').distance, STAR_VIEW_DISTANCE)
  const comet = viewZoomBounds('comet')
  assert.equal(comet.distance, COMET_VIEW_DISTANCE)
  assert.ok(comet.min < comet.distance && comet.distance < comet.max, 'comet default outside its clamp')
  assert.equal(viewZoomBounds('system').distance, PLANET_VIEW_DISTANCE)
})

test('shiftIntoFrame moves the look point against the requested screen offset', () => {
  // Camera on +Z looking at the origin, screen-right is +X, screen-up is +Y.
  const lookAt = new Vector3(0, 0, 0)
  const camera = new Vector3(0, 0, 10)
  const up = new Vector3(0, 1, 0)
  // +sx puts the BODY to the right, so the look point slides left.
  shiftIntoFrame(lookAt, camera, up, 1, 0, 36, 1.5)
  const halfH = 10 * Math.tan((36 / 2) * Math.PI / 180)
  assert.ok(Math.abs(lookAt.x + halfH * 1.5) < 1e-9, `x ${lookAt.x}`)
  assert.ok(Math.abs(lookAt.y) < 1e-9)
  assert.ok(Math.abs(lookAt.z) < 1e-9)
})

test('shiftIntoFrame keeps the frame distance and scales with it', () => {
  const camera = new Vector3(3, 0, 0)
  const lookAt = new Vector3(0, 0, 0)
  const up = new Vector3(0, 1, 0)
  shiftIntoFrame(lookAt, camera, up, 0, -0.5, 36, 1)
  // -sy puts the body low, the look point slides up; the z shift is zero
  // because the offset lives in the screen plane.
  const halfH = 3 * Math.tan((36 / 2) * Math.PI / 180)
  assert.ok(Math.abs(lookAt.y - halfH * 0.5) < 1e-9, `y ${lookAt.y}`)
  assert.ok(Math.abs(lookAt.x) < 1e-9)
  assert.ok(Math.abs(lookAt.z) < 1e-9)
})
