import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSession, saveSession, type StoredSession } from './session.ts'

/** A Map-backed Storage double: the same surface the browser gives. */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  } as Storage
}

test('a saved session roundtrips through the storage', () => {
  const storage = fakeStorage()
  saveSession(storage, { view: 'vesper', pose: { yaw: 0.2, pitch: -0.1, zoom: 10.4 }, time: 137.4 })
  const session = loadSession(storage, ['vesper', 'aurelia'])
  assert.deepEqual(session, { view: 'vesper', pose: { yaw: 0.2, pitch: -0.1, zoom: 10.4 }, time: 137.4 })
})

test('a partial save merges into the stored record', () => {
  const storage = fakeStorage()
  saveSession(storage, { view: 'comet' })
  saveSession(storage, { time: 42 })
  const session = loadSession(storage, ['comet'])
  assert.deepEqual(session, { view: 'comet', time: 42 })
})

test('a view unknown to the scene is rejected, not restored', () => {
  const storage = fakeStorage()
  saveSession(storage, { view: 'narnia' as StoredSession['view'] })
  assert.equal(loadSession(storage, ['aurelia']), null)
})

test('malformed records are dropped instead of poisoning the load', () => {
  const storage = fakeStorage()
  storage.setItem('aether-session', '{not json')
  assert.equal(loadSession(storage, ['aurelia']), null)
  // A broken field drops alone: the view stays alive, the pose is gone.
  storage.setItem('aether-session', JSON.stringify({ view: 'aurelia', pose: { yaw: 'x' } }))
  assert.deepEqual(loadSession(storage, ['aurelia']), { view: 'aurelia' })
  storage.setItem('aether-session', JSON.stringify({ view: 'aurelia', time: 'yesterday' }))
  assert.deepEqual(loadSession(storage, ['aurelia']), { view: 'aurelia' })
  // Nothing valid left in the record: no session at all.
  storage.setItem('aether-session', JSON.stringify({ pose: { yaw: 'x' } }))
  assert.equal(loadSession(storage, ['aurelia']), null)
})

test('an empty storage reads as no session', () => {
  assert.equal(loadSession(fakeStorage(), ['aurelia']), null)
})
