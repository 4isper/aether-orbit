import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cycloneCenter, cycloneIntensity, nextCyclone, CYCLONE_THRESHOLD } from './cyclone.ts'

test('the cyclone is a pure function of the clock', () => {
  for (const time of [0, 61.7, -240, 900]) {
    assert.equal(cycloneIntensity(time), cycloneIntensity(time))
  }
})

test('time reversal lands on the same storm: the cycle wraps negatives forward', () => {
  for (const time of [0, 45.5, 130]) {
    assert.ok(cycloneIntensity(time) >= 0 && cycloneIntensity(time) <= 1,
      `intensity out of range at t=${time}`)
  }
})

test('the cyclone reaches full strength and clears away', () => {
  let peak = 0
  for (let t = 0; t < 400; t += 0.25) {
    peak = Math.max(peak, cycloneIntensity(t))
  }
  assert.ok(peak > 0.95, `the cyclone never thickens past ${peak}`)
})

test('nextCyclone finds a window the chip can announce', () => {
  const event = nextCyclone(0)
  assert.ok(event, 'no cyclone found within one cycle')
  assert.ok(event.entry < event.peak && event.peak < event.exit, 'window edges are ordered')
  assert.ok(cycloneIntensity(event.peak) >= CYCLONE_THRESHOLD,
    `peak intensity ${cycloneIntensity(event.peak)} is too faint to announce`)
  assert.ok(cycloneIntensity(event.entry - 0.5) < CYCLONE_THRESHOLD, 'entry sits inside the calm')
  assert.ok(cycloneIntensity(event.exit + 0.5) < CYCLONE_THRESHOLD, 'exit is inside the calm')
})

test('cyclones recur: the scan from a later calm finds the next window', () => {
  let cursor = 0
  for (let i = 0; i < 20; i++) {
    const event = nextCyclone(cursor)
    assert.ok(event, `no cyclone after t=${cursor}`)
    if (i > 0) {
      assert.ok(event.entry > cursor - 1, 'the next window was announced before the previous ended')
    }
    cursor = event.exit + 5
  }
})

test('the eye wanders deterministically and slowly', () => {
  const a = cycloneCenter(500)
  const b = cycloneCenter(500)
  assert.deepEqual(a, b, 'the same moment reads a different centre')
  assert.ok(a.v >= 0.3 && a.v <= 0.7, `latitude ${a.v} leaves the tropics`)
  // Drift is continuous: ten units of time move the centre a hair, never a
  // jump — the seam wrap is the only allowed discontinuity in u.
  for (let t = 0; t < 900; t += 10) {
    const here = cycloneCenter(t)
    const there = cycloneCenter(t + 10)
    const du = Math.abs(there.u - here.u)
    const wrapped = Math.min(du, 1 - du)
    assert.ok(wrapped < 0.05, `centre jumped from ${here.u} to ${there.u} over ten units`)
    assert.ok(Math.abs(there.v - here.v) < 1e-9, 'latitude drifts')
  }
})
