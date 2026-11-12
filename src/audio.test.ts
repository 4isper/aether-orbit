import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readStoredAmbience, storeAmbience } from './audio.ts'

test('ambience intent round-trips, or reads off without storage', () => {
  storeAmbience(true)
  if (typeof localStorage === 'undefined') {
    // No storage in this runtime: the read must fail soft, not throw.
    assert.equal(readStoredAmbience(), false)
  } else {
    assert.equal(readStoredAmbience(), true)
    storeAmbience(false)
    assert.equal(readStoredAmbience(), false)
  }
})

test('anything but the stored-on marker reads as off', () => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('aether-ambience', 'yes')
  assert.equal(readStoredAmbience(), false)
})
