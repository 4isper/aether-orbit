import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampExposure,
  EXPOSURE_DEFAULT,
  EXPOSURE_MAX,
  EXPOSURE_MIN,
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
