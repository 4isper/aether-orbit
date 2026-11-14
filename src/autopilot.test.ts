import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { stepAutopilot, wrapPi } from './autopilot.ts'

// The rig's own tuning, so the simulation runs the way the pilot flies.
const PARAMS = { accel: 16, damping: 2.6, maxSpeed: 13, lookRate: 7 }

test('wrapPi maps any angle into a half-turn around zero', () => {
  assert.equal(wrapPi(0), 0)
  // Periodic and bounded: adding a full turn changes nothing, and no answer
  // leaves the half-turn range.
  assert.ok(Math.abs(wrapPi(Math.PI * 3) - wrapPi(Math.PI)) < 1e-9)
  assert.ok(Math.abs(wrapPi(0.1 + Math.PI * 2) - 0.1) < 1e-9)
  for (const angle of [0.3, 2.5, -2.5, Math.PI, -Math.PI, Math.PI * 7, -Math.PI * 9]) {
    assert.ok(Math.abs(wrapPi(angle)) <= Math.PI + 1e-12, `wrapPi(${angle}) left the range`)
  }
})

test('from far away and still: the autopilot thrusts forward at the target', () => {
  const steer = stepAutopilot(
    new Vector3(30, 0, 0),
    new Vector3(),
    new Vector3(0, 0, 0),
    4.5,
    PARAMS.damping,
  )
  assert.ok(steer.forward, 'a distant ship should thrust')
  assert.ok(!steer.brake && !steer.done, 'no braking far from the target')
  // The look direction points at the target (yaw 0 faces +z; the target sits
  // straight along -x).
  assert.ok(Math.abs(Math.abs(steer.yaw) - Math.PI / 2) < 1e-6, `yaw ${steer.yaw} does not face -x`)
  assert.ok(Math.abs(steer.pitch) < 1e-6, 'level approach tilts the nose')
})

test('close and fast: the autopilot brakes before arriving', () => {
  const steer = stepAutopilot(
    new Vector3(8, 0, 0),
    new Vector3(-12, 0, 0),
    new Vector3(0, 0, 0),
    4.5,
    PARAMS.damping,
  )
  assert.ok(steer.brake, 'a fast approach must brake')
  assert.ok(!steer.forward, 'braking and thrusting never mix')
  assert.ok(!steer.done, 'still moving too fast to be done')
})

test('arrived and slow: the autopilot hands the ship back', () => {
  const steer = stepAutopilot(
    new Vector3(4.4, 0, 0),
    new Vector3(),
    new Vector3(0, 0, 0),
    4.5,
    PARAMS.damping,
  )
  assert.ok(steer.done, 'a stopped ship at the arrival ring is done')
  assert.ok(!steer.forward && !steer.brake, 'done means hands off')
})

test('a full flight arrives at the ring and never dives inside', () => {
  // The rig's own loop: damp the look toward the steer, step the flight,
  // repeat — the same commands the pilot's hands would issue.
  const st = {
    position: new Vector3(30, 4, -18),
    velocity: new Vector3(2, 0, 7),
    yaw: 0,
    pitch: 0,
  }
  const target = new Vector3(0, 0, 0)
  const arrival = 4.5
  let done = false
  let minSurfaceDistance = Number.POSITIVE_INFINITY
  const dt = 1 / 60
  for (let i = 0; i < 60 * 90; i++) {
    const steer = stepAutopilot(st.position, st.velocity, target, arrival, PARAMS.damping)
    if (steer.done) { done = true; break }
    // The look follows the steer across the yaw seam; the state damps at
    // the rig's own lookRate.
    st.yaw = st.yaw + wrapPi(steer.yaw - wrapPi(st.yaw)) * Math.min(1, PARAMS.lookRate * dt)
    st.pitch = st.pitch + (steer.pitch - st.pitch) * Math.min(1, PARAMS.lookRate * dt)
    const cosPitch = Math.cos(st.pitch)
    const thrust = PARAMS.accel * dt
    const forward = steer.forward ? 1 : 0
    const brake = steer.brake ? 1 : 0
    const net = (forward - brake) * thrust
    st.velocity.x += Math.sin(st.yaw) * cosPitch * net
    st.velocity.y += Math.sin(st.pitch) * net
    st.velocity.z += Math.cos(st.yaw) * cosPitch * net
    st.velocity.multiplyScalar(Math.exp(-PARAMS.damping * dt))
    const speed = st.velocity.length()
    if (speed > PARAMS.maxSpeed) st.velocity.setLength(PARAMS.maxSpeed)
    st.position.addScaledVector(st.velocity, dt)
    minSurfaceDistance = Math.min(minSurfaceDistance, st.position.length() - arrival)
  }
  assert.ok(done, 'the ship never reported arrival')
  const finalSurface = st.position.length() - arrival
  assert.ok(finalSurface > -0.2 && finalSurface < 2.5,
    `the ship stopped ${finalSurface.toFixed(2)} from the arrival ring`)
  assert.ok(minSurfaceDistance > -0.3,
    `the approach dove ${(minSurfaceDistance).toFixed(2)} past the ring`)
})

test('a fast flyby brakes in time and keeps its distance', () => {
  const st = {
    position: new Vector3(3, 0, 26),
    velocity: new Vector3(0, 0, -13),
    yaw: Math.PI,
    pitch: 0,
  }
  const target = new Vector3(0, 0, 0)
  const arrival = 4.5
  let minSurfaceDistance = Number.POSITIVE_INFINITY
  const dt = 1 / 60
  for (let i = 0; i < 60 * 60; i++) {
    const steer = stepAutopilot(st.position, st.velocity, target, arrival, PARAMS.damping)
    if (steer.done) break
    st.yaw = st.yaw + wrapPi(steer.yaw - wrapPi(st.yaw)) * Math.min(1, PARAMS.lookRate * dt)
    st.pitch = st.pitch + (steer.pitch - st.pitch) * Math.min(1, PARAMS.lookRate * dt)
    const cosPitch = Math.cos(st.pitch)
    const net = (steer.forward ? 1 : 0) - (steer.brake ? 1 : 0)
    const thrust = PARAMS.accel * dt * net
    st.velocity.x += Math.sin(st.yaw) * cosPitch * thrust
    st.velocity.y += Math.sin(st.pitch) * thrust
    st.velocity.z += Math.cos(st.yaw) * cosPitch * thrust
    st.velocity.multiplyScalar(Math.exp(-PARAMS.damping * dt))
    st.position.addScaledVector(st.velocity, dt)
    minSurfaceDistance = Math.min(minSurfaceDistance, st.position.length() - arrival)
  }
  assert.ok(minSurfaceDistance > -0.3, `the flyby dove ${(minSurfaceDistance).toFixed(2)} inside the ring`)
})
