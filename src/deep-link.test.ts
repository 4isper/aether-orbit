import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deepLinkUrl, formatTimeParam, parseTimeParam } from './deep-link.ts'
import type { CameraPose } from './camera-math.ts'

const POSE: CameraPose = { yaw: 0.21, pitch: -0.05, zoom: 9.4 }

test('deepLinkUrl composes view, pose and time into one address', () => {
  // The home view without extras stays a bare path.
  assert.equal(deepLinkUrl('aurelia'), '/')
  assert.equal(deepLinkUrl('aurelia', null, null), '/')
  // Time alone rides on the home view.
  assert.equal(deepLinkUrl('aurelia', null, 42), '/?t=42')
  // A pose without time keeps the historical shape.
  assert.equal(deepLinkUrl('moon', POSE), '/?view=moon&yaw=0.21&pitch=-0.05&zoom=9.4')
  // Everything together: view, framing, and the shared moment.
  assert.equal(
    deepLinkUrl('moon', POSE, 42),
    '/?view=moon&yaw=0.21&pitch=-0.05&zoom=9.4&t=42',
  )
  // A pose without a time must not leave a dangling "t=".
  assert.equal(deepLinkUrl('aurelia', POSE), '/?yaw=0.21&pitch=-0.05&zoom=9.4')
})

test('parseTimeParam accepts 0 and negatives, rejects junk', () => {
  assert.equal(parseTimeParam(new URLSearchParams('t=0')), 0)
  assert.equal(parseTimeParam(new URLSearchParams('t=-5.5')), -5.5)
  assert.equal(parseTimeParam(new URLSearchParams('t=128.4')), 128.4)
  assert.equal(parseTimeParam(new URLSearchParams('t=abc')), null)
  assert.equal(parseTimeParam(new URLSearchParams('t=')), null)
  assert.equal(parseTimeParam(new URLSearchParams('')), null)
  // Infinity in, null out: the param never survives as a non-finite number.
  assert.equal(parseTimeParam(new URLSearchParams('t=1e999')), null)
  // Absurdly far moments are malformed shares, not valid times.
  assert.equal(parseTimeParam(new URLSearchParams('t=1e10')), null)
})

test('formatTimeParam keeps one decimal so roundtrips are exact', () => {
  assert.equal(formatTimeParam(0), '0')
  assert.equal(formatTimeParam(42), '42')
  assert.equal(formatTimeParam(1234.5678), '1234.6')
  assert.equal(formatTimeParam(-5.55), '-5.5')
  assert.equal(formatTimeParam(Number.NaN), null)
  assert.equal(formatTimeParam(Infinity), null)
  const formatted = formatTimeParam(128.34)
  assert.ok(formatted)
  assert.equal(parseTimeParam(new URLSearchParams(`t=${formatted}`)), 128.3)
})
