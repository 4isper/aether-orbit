import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STORM_PERIOD, STORM_THRESHOLD, nextStorm, stormIntensity } from './storms.ts'

/** The first fully clear moment at or after `time`. */
function calmAfter(time: number) {
  let calm = time
  while (stormIntensity(calm) > 0) calm += 1
  return calm
}

/** The first moment at or after `time` where the veil crosses the threshold. */
function ragingAfter(time: number) {
  let raging = time
  while (stormIntensity(raging) < STORM_THRESHOLD) raging += 1
  return raging
}

test('the storm is a pure function of the clock', () => {
  for (const time of [0, 61.7, -240, 900]) {
    assert.equal(stormIntensity(time), stormIntensity(time))
  }
})

test('time reversal lands on the same veil: the cycle wraps negatives forward', () => {
  // Two full cycles back must read exactly like now — pause, reverse and
  // deep links replay the same storm.
  for (const time of [0, 45.5, 130]) {
    assert.equal(stormIntensity(time), stormIntensity(time - 2 * STORM_PERIOD))
  }
})

test('the desert is mostly clear: the storm keeps a low duty cycle', () => {
  // A veil that never lifts is a shroud, not a weather event.
  let veiled = 0
  let samples = 0
  for (let t = 0; t < 2000; t += 0.25) {
    if (stormIntensity(t) > 0) veiled += 1
    samples += 1
  }
  assert.ok(veiled / samples < 0.4, `duty cycle ${(veiled / samples).toFixed(2)} is too permanent`)
})

test('the storm reaches full strength and fades back to clear sky', () => {
  let peak = 0
  for (let t = 0; t < STORM_PERIOD * 1.2; t += 0.1) {
    peak = Math.max(peak, stormIntensity(t))
  }
  assert.ok(peak > 0.95, `storm never thickens past ${peak}`)
  const farOutside = stormIntensity(STORM_PERIOD * 0.75)
  assert.equal(farOutside, 0, 'the storm lingers after its season')
})

test('nextStorm finds a window where the dust truly veils the surface', () => {
  const event = nextStorm(calmAfter(0))
  assert.ok(event, 'no storm found within one cycle')
  assert.ok(event.entry < event.peak && event.peak < event.exit, 'window edges are ordered')
  assert.ok(stormIntensity(event.peak) >= STORM_THRESHOLD, `peak intensity ${stormIntensity(event.peak)} is too faint to announce`)
  assert.ok(stormIntensity(event.entry - 0.5) < STORM_THRESHOLD, 'entry is inside the calm')
  assert.ok(stormIntensity(event.exit + 0.5) < STORM_THRESHOLD, 'exit is inside the calm')
})

test('the announcement knows when the storm is raging now', () => {
  const quiet = nextStorm(calmAfter(0))
  assert.ok(quiet && !quiet.inProgress, 'a calm desert is announced as raging')
  // Inside the veil the window is already open: "happening now".
  const raging = nextStorm(ragingAfter(calmAfter(0)))
  assert.ok(raging && raging.inProgress, 'the storm in progress goes unannounced')
})

test('storms recur: the scan from a later calm finds the next window', () => {
  const first = nextStorm(0)
  assert.ok(first)
  const second = nextStorm(first.exit + 5)
  assert.ok(second, 'no follow-up storm within the horizon')
  assert.ok(second.entry > first.exit, 'the next window was announced before the first ended')
})
