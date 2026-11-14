import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Group, Mesh, Vector3 } from 'three'
import { moonPhaseAngle, planetPosition, aureliaClock } from './orbits.ts'
import {
  shadowDistance,
  nextTransit,
  moonWorldPosition,
  DISC_THRESHOLD_MOON_RADII,
  nextEclipse,
  moonShadowDepth,
  ECLIPSE_THRESHOLD_PLANET_RADII,
  ECLIPSE_SCAN_HORIZON,
} from './eclipse.ts'

/**
 * The scene graph rebuilt from raw literals: this pins the pure math in
 * eclipse.ts to the real geometry of Planet.tsx. If the frame constants
 * change, this test fails until the change is conscious.
 */
function sceneMoonWorld(time: number, target: Vector3) {
  const outer = new Group()
  outer.rotation.set(0.08, 0, -0.09)
  outer.position.copy(planetPosition('aurelia', time, new Vector3()))
  const inner = new Group()
  inner.rotation.set(0.24, 0, 0.09)
  const moon = new Mesh()
  const angle = moonPhaseAngle(time)
  moon.position.set(
    Math.cos(angle) * aureliaClock.moonOrbitRadius,
    0,
    Math.sin(angle) * aureliaClock.moonOrbitRadius,
  )
  inner.add(moon)
  outer.add(inner)
  outer.updateMatrixWorld(true)
  return moon.getWorldPosition(target)
}

test('the pure moon position matches the scene graph exactly', () => {
  for (let t = 0; t < 300; t += 3.7) {
    const graph = sceneMoonWorld(t, new Vector3())
    const pure = moonWorldPosition(t, new Vector3())
    assert.ok(graph.distanceTo(pure) < 1e-9, `diverged at t=${t}: ${graph.distanceTo(pure)}`)
  }
})

test('shadow distance is finite, non-negative, or the no-shadow sentinel', () => {
  for (let t = 0; t < 500; t += 1.3) {
    const distance = shadowDistance(t)
    assert.ok(
      Number.isFinite(distance) || distance === Number.POSITIVE_INFINITY,
      `NaN at t=${t}`,
    )
    assert.ok(distance >= 0, `negative at t=${t}`)
  }
})

test('the scan always finds the next transit, wherever you start', () => {
  // Conjunctions run on the synodic clock and the tilted orbit skips some
  // discs, so the horizon must reach across the worst gap. Walk a few years
  // of simulation time and every scan must return an event.
  for (let start = 0; start <= 1000; start += 37) {
    const event = nextTransit(start)
    assert.ok(event, `no transit found from t=${start}`)
    // A start inside a window reports that window honestly — its first
    // contact lies behind the start; otherwise the next window is ahead.
    if (event.inProgress) {
      assert.ok(event.entry <= start && start <= event.exit, `window from t=${start} does not cover the start`)
    } else {
      assert.ok(event.entry >= start, `event from t=${start} starts in the past`)
    }
  }
})

test('a window is a bounded event, not a penumbral season', () => {
  const event = nextTransit(0)
  assert.ok(event)
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  assert.ok(event.exit - event.entry < month / 2, `window ${(event.exit - event.entry).toFixed(1)} spans half a month`)
  // The window may outlive the scan's month horizon: its exit must still be
  // a real closure, refined to the actual crossing.
  assert.ok(shadowDistance(event.exit + 0.5) > DISC_THRESHOLD_MOON_RADII, 'exit is not a real crossing')
})

test('nextTransit returns a bounded window with a peak inside it', () => {
  const event = nextTransit(0)
  assert.ok(event, 'expected a transit ahead of t=0')
  assert.ok(event.entry < event.peak && event.peak < event.exit, 'window is not ordered')
  assert.ok(event.exit - event.entry < 20, `window too long: ${event.exit - event.entry}`)
  assert.ok(shadowDistance(event.peak) < shadowDistance(event.entry), 'peak is not the deepest point')
})

test('nextTransit from inside an event reports that event', () => {
  const event = nextTransit(0)
  assert.ok(event)
  const inside = nextTransit(event.entry + 0.2)
  assert.ok(inside)
  assert.ok(inside.inProgress, 'a moment inside the window must be in progress')
  // The backward walk finds the true peak instead of drifting: repeated
  // scans land on the same instant, so "to the moment" stays idempotent.
  assert.ok(Math.abs(inside.peak - event.peak) < 0.3, 'peak jumped between scans')
})

test('nextTransit after an event finds the next month, strictly ahead', () => {
  const first = nextTransit(0)
  assert.ok(first)
  const after = nextTransit(first.exit + 0.5)
  assert.ok(after)
  assert.ok(after.entry > first.exit, 'the next event must start strictly later')
  assert.ok(!after.inProgress)
})

test("nextEclipse finds windows where Nox enters Aurelia's shadow", () => {
  // Walk years of simulation time window by window: every scan must return
  // an event, every window must bracket real crossings, and the peak must
  // be the deepest point of the umbra pass.
  let cursor = 0
  for (let i = 0; i < 40; i++) {
    const event = nextEclipse(cursor)
    assert.ok(event, `no eclipse found from t=${cursor}`)
    assert.ok(event.entry >= cursor, `event from t=${cursor} starts in the past`)
    assert.ok(event.entry < event.peak && event.peak < event.exit, 'window is not ordered')
    assert.ok(moonShadowDepth(event.peak) <= ECLIPSE_THRESHOLD_PLANET_RADII + 1e-9, 'peak is not inside the shadow')
    assert.ok(moonShadowDepth(event.entry - 0.2) > ECLIPSE_THRESHOLD_PLANET_RADII, 'entry is not a real crossing')
    assert.ok(moonShadowDepth(event.exit + 0.2) > ECLIPSE_THRESHOLD_PLANET_RADII, 'exit is not a real crossing')
    cursor = event.exit + 0.5
  }
})

test('the eclipse horizon covers the worst gap between windows', () => {
  // Seasons come and go with the planet's year; the scan must never come up
  // empty in between. Walk with the published horizon and measure the gaps.
  const first = nextEclipse(0)
  assert.ok(first)
  let cursor = first.exit + 0.5
  let worst = 0
  for (let i = 0; i < 40; i++) {
    const event = nextEclipse(cursor)
    assert.ok(event, `no eclipse after ${cursor}`)
    worst = Math.max(worst, event.entry - cursor)
    cursor = event.exit + 0.5
  }
  assert.ok(worst < ECLIPSE_SCAN_HORIZON, `worst gap ${worst.toFixed(1)} exceeds the horizon`)
})
