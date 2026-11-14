import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventCueTransition, readStoredAmbience, storeAmbience, voicesFromEvent } from './audio.ts'

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

test('only a moment in progress speaks, and only its own voice', () => {
  // The cyclone's wind belongs to the ocean, the rumble to the star, the
  // patter to the sky: one announcement, one voice.
  assert.deepEqual(
    voicesFromEvent({ kind: 'cyclone', inProgress: true }),
    { cyclone: true, flare: false, shower: false },
  )
  assert.deepEqual(
    voicesFromEvent({ kind: 'flare', inProgress: true }),
    { cyclone: false, flare: true, shower: false },
  )
  assert.deepEqual(
    voicesFromEvent({ kind: 'shower', inProgress: true }),
    { cyclone: false, flare: false, shower: true },
  )
  // A countdown is not the moment yet: silence.
  assert.deepEqual(
    voicesFromEvent({ kind: 'cyclone', inProgress: false }),
    { cyclone: false, flare: false, shower: false },
  )
  assert.equal(voicesFromEvent(null).shower, false)
  // Kinds without a voice of their own stay silent.
  assert.deepEqual(
    voicesFromEvent({ kind: 'transit', inProgress: true }),
    { cyclone: false, flare: false, shower: false },
  )
})
