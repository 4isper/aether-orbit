import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampExposure,
  EXPOSURE_DEFAULT,
  EXPOSURE_MAX,
  EXPOSURE_MIN,
  eyeAdaptation,
  EYE_MAX,
  EYE_MIN,
  readStoredExposure,
  storeExposure,
} from './exposure.ts'

test('the exposure clamps into its range: the frame never goes black or blown', () => {
  assert.equal(clampExposure(EXPOSURE_DEFAULT), EXPOSURE_DEFAULT)
  assert.equal(clampExposure(EXPOSURE_MIN - 10), EXPOSURE_MIN)
  assert.equal(clampExposure(EXPOSURE_MAX + 10), EXPOSURE_MAX)
  assert.equal(clampExposure(Number.NaN), EXPOSURE_DEFAULT, 'junk reads as the default')
})

test('the exposure intent round-trips through storage', () => {
  const map = new Map<string, string>()
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
  }
  assert.equal(readStoredExposure(storage), EXPOSURE_DEFAULT, 'no record — the default')
  storeExposure(1.45, storage)
  assert.ok(Math.abs(readStoredExposure(storage) - 1.45) < 1e-9, 'the stored value reads back')
  storeExposure(99, storage)
  assert.equal(readStoredExposure(storage), EXPOSURE_MAX, 'an out-of-range record clamps on read')
  // Private mode: the choice just does not persist.
  const throwing = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  storeExposure(1.3, throwing)
  assert.equal(readStoredExposure(throwing), EXPOSURE_DEFAULT, 'a failed read falls back to the default')
})

test('the eye meters unity at Aurelia and opens toward the dark', () => {
  // The meter is a pure function of the camera's distance from Solis: 1 at
  // the calibration orbit, opening outward, closing down in close — a
  // partial compensation of the honest inverse square.
  assert.ok(Math.abs(eyeAdaptation(9) - 1) < 1e-12, 'the meter drifts at its own calibration orbit')
  const vesper = eyeAdaptation(20)
  const cinder = eyeAdaptation(14)
  assert.ok(vesper > cinder && cinder > 1, 'outer worlds must meter brighter than inner ones')
  assert.ok(
    Math.abs(vesper - (20 / 9) ** 0.3) < 1e-12,
    `the meter is not the declared third-of-auto curve: ${vesper}`,
  )
  assert.ok(eyeAdaptation(4.6) < 1, 'diving at the comet must stop the meter down')
  assert.ok(eyeAdaptation(1) === EYE_MIN, 'the meter bottoms out near the star')
  assert.ok(eyeAdaptation(340) === EYE_MAX, 'the meter tops out far out')
  for (const distance of [-3, 0, Number.NaN]) {
    const value = eyeAdaptation(distance)
    assert.ok(Number.isFinite(value) && value >= EYE_MIN && value <= EYE_MAX, `junk distance ${distance} escaped the band`)
  }
})
