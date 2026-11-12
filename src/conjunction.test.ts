import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignmentDepth, nextConjunction } from './conjunction.ts'

test('alignmentDepth is zero on a line and grows with the separation angle', () => {
  // Sampled from the real orbits, so this pins the geometry, not an ideal.
  // Three synodic periods: the tilt mismatch rotates through the whole year,
  // so the pair must both line up closely and swing far off the line.
  const depth = (time: number) => alignmentDepth('cinder', 'vesper', time)
  let min = Number.POSITIVE_INFINITY
  let max = 0
  for (let t = 0; t < 4400; t += 2) {
    const d = depth(t)
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  assert.ok(min < 0.15, `closest approach ${min} never approaches the line`)
  assert.ok(max > 2, `farthest offset ${max} never leaves the line`)
})

test('nextConjunction finds a well-formed window within one synodic period', () => {
  for (const now of [0, 137, 480, 911, 1300]) {
    const event = nextConjunction('cinder', 'vesper', now)
    assert.ok(event, `no conjunction found after ${now}`)
    assert.ok(event.entry < event.peak && event.peak < event.exit, 'window edges must bracket the peak')
    assert.ok(event.entry >= now, 'window must start at or after now')
    const atPeak = nextConjunction('cinder', 'vesper', event.peak)
    assert.ok(atPeak?.inProgress, 'standing at the peak must read as in progress')
    // Determinism: the same now finds the same window twice.
    assert.equal(event.peak, nextConjunction('cinder', 'vesper', now)?.peak)
  }
})

test('the peak is a true local minimum of the depth', () => {
  const event = nextConjunction('vesper', 'aurelia', 200)
  assert.ok(event)
  const at = alignmentDepth('vesper', 'aurelia', event.peak)
  assert.ok(at < alignmentDepth('vesper', 'aurelia', event.peak - 10), 'depth falls into the peak')
  assert.ok(at < alignmentDepth('vesper', 'aurelia', event.peak + 10), 'depth rises after the peak')
})

test('the announced window is tight enough to make a countdown worth watching', () => {
  // A conjunction lasting a season is a mood, not an event.
  for (const pair of [['cinder', 'vesper'], ['vesper', 'aurelia']] as const) {
    const event = nextConjunction(pair[0], pair[1], 0)
    assert.ok(event)
    assert.ok(event.exit - event.entry < 120, `window ${event.exit - event.entry} is too wide`)
    assert.ok(event.exit - event.entry > 2, `window ${event.exit - event.entry} is too narrow to catch`)
  }
})
