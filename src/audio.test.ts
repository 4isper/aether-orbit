import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventCueTransition, readStoredAmbience, storeAmbience } from './audio.ts'

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

test('the event cue fires on entering a window, not while it ticks', () => {
  const entering = { inProgress: true }
  const waiting = { inProgress: false }
  // The moment begins: cue.
  assert.equal(eventCueTransition(null, entering), true)
  assert.equal(eventCueTransition(waiting, entering), true)
  // Standing inside the window re-announces every second: silence.
  assert.equal(eventCueTransition(entering, entering), false)
  // A countdown chip appearing is not the moment yet: silence.
  assert.equal(eventCueTransition(null, waiting), false)
  assert.equal(eventCueTransition(waiting, waiting), false)
  // The window closing is an ending, not a cue.
  assert.equal(eventCueTransition(entering, waiting), false)
})
