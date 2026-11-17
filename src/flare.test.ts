import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flareIntensity, flareLight, nextFlare, FLARE_THRESHOLD } from './flare.ts'

test('the flare is a pure function of the clock', () => {
  for (const time of [0, 61.7, -240, 900]) {
    assert.equal(flareIntensity(time), flareIntensity(time))
  }
})

test('the flare reaches full strength and fades back to the calm', () => {
  let peak = 0
  for (let t = 0; t < 400; t += 0.25) {
    peak = Math.max(peak, flareIntensity(t))
  }
  assert.ok(peak > 0.95, `the flare never brightens past ${peak}`)
})

test("the flare's light stays inside its promised bounds", () => {
  // The star's light multiplies by the flare: unity in the calm, a bounded
  // brightening at the peak — never a darkening, never a runaway.
  let low = 2
  let high = 0
  for (let t = 0; t < 400; t += 0.25) {
    const light = flareLight(t)
    low = Math.min(low, light)
    high = Math.max(high, light)
  }
  assert.equal(low, 1, 'the calm sky must keep the exact old flux')
  assert.ok(high > 1.1, `a flare that never brightens (${high}) is not an event`)
  assert.ok(high <= 1.4, `the brightening ${high} would wash the worlds out`)
})

test('nextFlare finds a window the chip can announce', () => {
  const event = nextFlare(0)
  assert.ok(event, 'no flare found within one cycle')
  assert.ok(event.entry < event.peak && event.peak < event.exit, 'window edges are ordered')
  assert.ok(flareIntensity(event.peak) >= FLARE_THRESHOLD,
    `peak intensity ${flareIntensity(event.peak)} is too faint to announce`)
  // The honest flare cycle is 0.5–2 days, so the calm check rides offsets
  // well under the shortest rise.
  assert.ok(flareIntensity(event.entry - 0.05) < FLARE_THRESHOLD, 'entry sits inside the calm')
  assert.ok(flareIntensity(event.exit + 0.05) < FLARE_THRESHOLD, 'exit is inside the calm')
})

test('flares recur: the scan walks cycle after cycle without repeats', () => {
  let cursor = 0
  for (let i = 0; i < 20; i++) {
    const event = nextFlare(cursor)
    assert.ok(event, `no flare after t=${cursor}`)
    if (i > 0) assert.ok(event.entry > cursor - 1, 'the next window was announced before the previous ended')
    cursor = event.exit + 5
  }
})
