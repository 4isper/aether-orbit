import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addJournalFrame, readJournal, JOURNAL_LIMIT } from './journal.ts'

const VIEWS = ['aurelia', 'cinder', 'vesper', 'star', 'comet', 'moon', 'belt', 'erebus', 'system'] as const

/** A storage stub with the two methods the journal touches. */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
  }
}

function frame(overrides: Partial<Parameters<typeof addJournalFrame>[1]> = {}) {
  return {
    view: 'aurelia' as (typeof VIEWS)[number],
    time: 42.5,
    thumbnail: 'data:image/webp;base64,AAAA',
    takenAt: 1700000000000,
    ...overrides,
  }
}

test('a saved frame reads back the same', () => {
  const storage = memoryStorage()
  addJournalFrame(storage, frame(), VIEWS)
  const list = readJournal(storage, VIEWS)
  assert.equal(list.length, 1)
  assert.equal(list[0].view, 'aurelia')
  assert.equal(list[0].time, 42.5)
  assert.equal(list[0].thumbnail, 'data:image/webp;base64,AAAA')
})

test('the journal reads newest first', () => {
  const storage = memoryStorage()
  addJournalFrame(storage, frame({ time: 1, takenAt: 100 }), VIEWS)
  addJournalFrame(storage, frame({ time: 2, takenAt: 200 }), VIEWS)
  addJournalFrame(storage, frame({ time: 3, takenAt: 300 }), VIEWS)
  const times = readJournal(storage, VIEWS).map((entry) => entry.time)
  assert.deepEqual(times, [3, 2, 1])
})

test('the journal keeps a bounded log: the oldest frames fall off', () => {
  const storage = memoryStorage()
  for (let i = 0; i < JOURNAL_LIMIT + 4; i++) {
    addJournalFrame(storage, frame({ time: i, takenAt: 1000 + i }), VIEWS)
  }
  const list = readJournal(storage, VIEWS)
  assert.equal(list.length, JOURNAL_LIMIT)
  assert.equal(list[0].time, JOURNAL_LIMIT + 3, 'the newest frame must lead')
  assert.equal(list[JOURNAL_LIMIT - 1].time, 4, 'the oldest kept frame is the first to survive')
})

test('the same frame twice updates its place instead of repeating', () => {
  const storage = memoryStorage()
  addJournalFrame(storage, frame({ time: 1, takenAt: 100 }), VIEWS)
  addJournalFrame(storage, frame({ time: 2, takenAt: 200 }), VIEWS)
  addJournalFrame(storage, frame({ time: 1, takenAt: 300 }), VIEWS)
  const list = readJournal(storage, VIEWS)
  assert.equal(list.length, 2)
  assert.equal(list[0].time, 1, 'the re-saved frame moves to the front')
  assert.equal(list[0].takenAt, 300)
})

test('a broken entry falls out alone: the rest of the log survives', () => {
  const storage = memoryStorage()
  addJournalFrame(storage, frame({ time: 1, takenAt: 100 }), VIEWS)
  // Corrupt one entry in place, as a stale or hand-edited record would be.
  addJournalFrame(storage, frame({ time: 2, takenAt: 200, thumbnail: 'not-a-data-url' }), VIEWS)
  addJournalFrame(storage, frame({ time: 3, takenAt: 300 }), VIEWS)
  const list = readJournal(storage, VIEWS)
  assert.deepEqual(list.map((entry) => entry.time), [3, 1])
})

test('a frame naming a view the scene does not know is dropped', () => {
  const storage = memoryStorage()
  addJournalFrame(storage, frame({ view: 'jupiter' as never }), VIEWS)
  assert.equal(readJournal(storage, VIEWS).length, 0)
})

test('a frame with an implausible time or date is dropped', () => {
  const storage = memoryStorage()
  addJournalFrame(storage, frame({ time: 1e12 }), VIEWS)
  addJournalFrame(storage, frame({ takenAt: -5 }), VIEWS)
  addJournalFrame(storage, frame({ thumbnail: 'data:image/webp;base64,' + 'x'.repeat(300_000) }), VIEWS)
  assert.equal(readJournal(storage, VIEWS).length, 0)
})

test('malformed JSON reads as an empty journal', () => {
  const storage = memoryStorage()
  storage.setItem('aether-journal', '{oops')
  assert.deepEqual(readJournal(storage, VIEWS), [])
})
