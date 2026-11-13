import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import {
  clampPose,
  orbitOffset,
  computeOverviewPose,
  flightBodyPosition,
  nearestFlightBody,
  parsePose,
  poseParams,
  rotateOverviewPose,
  pinchZoom,
  shiftIntoFrame,
  stepFreeFlight,
  viewZoomBounds,
  COMET_VIEW_DISTANCE,
  FLIGHT_BODY_IDS,
  MAX_ZOOM,
  MIN_ZOOM,
  PLANET_VIEW_DISTANCE,
  STAR_VIEW_DISTANCE,
} from './camera-math.ts'
import { planetIds } from './planets.ts'
import { planetPosition } from './orbits.ts'
import { cometPosition } from './comet.ts'
import { erebusPosition } from './erebus.ts'
import { moonWorldPosition } from './eclipse.ts'

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

const FREE_PARAMS = { accel: 10, damping: 2, maxSpeed: 12, minRadius: 9.5, maxRadius: 65, lookRate: 6 }

const FLIGHT_KEYS = { forward: false, back: false, left: false, right: false, up: false, down: false }

test('free flight accelerates along the view direction', () => {
  const state = { position: new Vector3(20, 0, 0), velocity: new Vector3(), yaw: 0, pitch: 0 }
  // yaw 0 looks along +Z; holding forward must move along +Z, not X.
  stepFreeFlight(state, { ...FLIGHT_KEYS, forward: true }, { yaw: 0, pitch: 0 }, 1, { ...FREE_PARAMS, damping: 0 })
  assert.ok(state.position.z > 1, `z ${state.position.z}`)
  assert.ok(Math.abs(state.position.x - 20) < 1e-9, 'strayed sideways')
})

test('boost multiplies the thrust exactly', () => {
  const plain = { position: new Vector3(0, 0, 0), velocity: new Vector3(), yaw: 0, pitch: 0 }
  const boosted = { position: new Vector3(0, 0, 0), velocity: new Vector3(), yaw: 0, pitch: 0 }
  const params = { ...FREE_PARAMS, boost: 3 }
  stepFreeFlight(plain, { ...FLIGHT_KEYS, forward: true }, { yaw: 0, pitch: 0 }, 0.1, params)
  stepFreeFlight(boosted, { ...FLIGHT_KEYS, forward: true, boost: true }, { yaw: 0, pitch: 0 }, 0.1, params)
  // Same damping applies to both, so the thrust ratio survives untouched.
  assert.ok(
    Math.abs(boosted.velocity.length() / plain.velocity.length() - 3) < 1e-9,
    `ratio ${boosted.velocity.length() / plain.velocity.length()}`,
  )
})

test('boost raises the speed cap instead of only the push', () => {
  // Pre-charge a speed between the plain cap (12) and the boost cap (36):
  // without boost it must clamp down, with boost it must survive.
  const params = { ...FREE_PARAMS, damping: 0, boost: 3 }
  const plain = { position: new Vector3(20, 0, 0), velocity: new Vector3(0, 0, 20), yaw: 0, pitch: 0 }
  const boosted = { position: new Vector3(20, 0, 0), velocity: new Vector3(0, 0, 20), yaw: 0, pitch: 0 }
  stepFreeFlight(plain, FLIGHT_KEYS, { yaw: 0, pitch: 0 }, 0.016, params)
  assert.ok(plain.velocity.length() <= 12 + 1e-9, `plain speed ${plain.velocity.length()} kept flying`)
  stepFreeFlight(boosted, { ...FLIGHT_KEYS, boost: true }, { yaw: 0, pitch: 0 }, 0.016, params)
  assert.ok(Math.abs(boosted.velocity.length() - 20) < 1e-9, `boosted speed ${boosted.velocity.length()}`)
})

test('free flight glides on with damping when the keys release', () => {
  const state = { position: new Vector3(0, 0, 0), velocity: new Vector3(0, 0, 10), yaw: 0, pitch: 0 }
  stepFreeFlight(state, FLIGHT_KEYS, { yaw: 0, pitch: 0 }, 1, FREE_PARAMS)
  const expected = 10 * Math.exp(-2)
  assert.ok(Math.abs(state.velocity.z - expected) < 1e-9, `velocity ${state.velocity.z}`)
})

test('free flight never exceeds its speed cap', () => {
  const state = { position: new Vector3(0, 0, 0), velocity: new Vector3(), yaw: 0, pitch: 0 }
  for (let i = 0; i < 200; i++) {
    stepFreeFlight(state, { ...FLIGHT_KEYS, forward: true }, { yaw: 0, pitch: 0 }, 0.1, { ...FREE_PARAMS, damping: 0 })
  }
  assert.ok(state.velocity.length() <= 12 + 1e-9, `speed ${state.velocity.length()}`)
})

test('free flight stays between the star and the outer bound', () => {
  const params = { ...FREE_PARAMS, damping: 0 }
  const out = { position: new Vector3(100, 0, 0), velocity: new Vector3(5, 0, 0), yaw: 0, pitch: 0 }
  stepFreeFlight(out, FLIGHT_KEYS, { yaw: 0, pitch: 0 }, 0.016, params)
  assert.ok(Math.abs(out.position.length() - 65) < 1e-9, 'outer bound not enforced')
  // The outward radial push is gone; the position rests on the sphere.
  assert.ok(out.velocity.dot(out.position) <= 1e-9, 'still pushing outward')

  const inr = { position: new Vector3(1, 0, 0), velocity: new Vector3(-5, 0, 0), yaw: 0, pitch: 0 }
  stepFreeFlight(inr, FLIGHT_KEYS, { yaw: 0, pitch: 0 }, 0.016, params)
  assert.ok(Math.abs(inr.position.length() - 9.5) < 1e-9, 'inner bound not enforced')
  assert.ok(inr.velocity.dot(inr.position) >= -1e-9, 'still pushing inward')
})

test('free flight turns toward the look target with pitch clamped', () => {
  const state = { position: new Vector3(20, 0, 0), velocity: new Vector3(), yaw: 0, pitch: 0 }
  stepFreeFlight(state, FLIGHT_KEYS, { yaw: 1, pitch: 5 }, 1, { ...FREE_PARAMS, damping: 0, lookRate: 6 })
  assert.ok(state.yaw > 0 && state.yaw < 1, `yaw ${state.yaw}`)
  assert.ok(Math.abs(state.pitch) <= Math.PI / 2 + 1e-9, `pitch ${state.pitch}`)
})

test('nearest flight body reads signed distance to the surface', () => {
  // 1.5 units from Aurelia's center: inside the radius, so the reading is
  // negative — and no other body can beat it (the moon keeps 3.6−1.5−0.34).
  const anchor = planetPosition('aurelia', 100, new Vector3())
  const parked = anchor.addScaledVector(anchor.clone().normalize(), -1.5)
  const near = nearestFlightBody(parked, moonWorldPosition(100, new Vector3()), 100)
  assert.equal(near.id, 'aurelia')
  assert.ok(Math.abs(near.distance - -0.5) < 1e-9, `distance ${near.distance}`)

  // At a body's center the reading goes negative: the pilot is inside it.
  const moon = moonWorldPosition(55, new Vector3())
  const inside = nearestFlightBody(moon, moon, 55)
  assert.equal(inside.id, 'moon')
  assert.ok(Math.abs(inside.distance - -0.34) < 1e-9, `distance ${inside.distance}`)
})

test('nearest flight body always returns a flyable body', () => {
  const far = nearestFlightBody(new Vector3(64, 0, 0), new Vector3(), 40)
  assert.ok(FLIGHT_BODY_IDS.includes(far.id), `unknown id ${far.id}`)
  assert.ok(Number.isFinite(far.distance))
})

test('flight body positions match the scene graph for every body', () => {
  const moonWorld = moonWorldPosition(140, new Vector3())
  for (const id of FLIGHT_BODY_IDS) {
    const position = flightBodyPosition(id, moonWorld, 140, new Vector3())
    if (id === 'star') {
      assert.equal(position.length(), 0, 'the star sits at the origin')
    } else if (id === 'moon') {
      assert.equal(position.distanceTo(moonWorld), 0, 'the moon rides its live world position')
    } else if (id === 'comet') {
      assert.equal(position.distanceTo(cometPosition(140, new Vector3())), 0)
    } else if (id === 'erebus') {
      assert.equal(position.distanceTo(erebusPosition(140, new Vector3())), 0)
    } else {
      assert.equal(position.distanceTo(planetPosition(id, 140, new Vector3())), 0)
    }
  }
})
