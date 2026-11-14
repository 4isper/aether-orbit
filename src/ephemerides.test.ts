import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listEphemerides } from './ephemerides.ts'

/** Every stream the schedule walks, named the way entries name themselves:
 * a conjunction and a periapsis carry the body their label talks about. */
const STREAMS = [
  'transit',
  'eclipse',
  'perihelion',
  'perihelion/erebus',
  'conjunction/vesper',
  'conjunction/aurelia',
  'storm',
  'shower',
]

function streamName(entry: { kind: string; body?: string }) {
  return entry.body ? `${entry.kind}/${entry.body}` : entry.kind
}

test('the schedule is sorted and every window is an honest window', () => {
  for (let start = 0; start <= 2000; start += 71) {
    const list = listEphemerides(start)
    assert.ok(list.length > 0, `the schedule is empty at t=${start}`)
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1].entry <= list[i].entry,
        `the schedule breaks order at t=${start}: ${list[i - 1].entry} then ${list[i].entry}`)
    }
    for (const entry of list) {
      assert.ok(entry.entry <= entry.peak && entry.peak <= entry.exit,
        `window ${streamName(entry)} at t=${start} misorders its edges: ${entry.entry} ${entry.peak} ${entry.exit}`)
      assert.ok(entry.exit > entry.entry,
        `window ${streamName(entry)} at t=${start} has no width`)
    }
  }
})

test('the same moment reads the same schedule twice (determinism)', () => {
  assert.deepEqual(listEphemerides(1234.5), listEphemerides(1234.5))
})

test('every stream of the sky reaches the schedule at every moment', () => {
  // Each scanner promises its next window inside its own horizon (the slowest
  // is the Cinder→Vesper synodic, ~1462 units); a 1900-unit schedule horizon
  // therefore never comes up thin on any stream, at any moment.
  for (let start = 0; start <= 3000; start += 113) {
    const seen = new Set(listEphemerides(start).map(streamName))
    for (const stream of STREAMS) {
      assert.ok(seen.has(stream), `stream ${stream} missing from the schedule at t=${start}`)
    }
  }
})

test('a stream never repeats itself: occurrences follow one another', () => {
  for (let start = 0; start <= 2000; start += 149) {
    const byStream = new Map<string, { entry: number; peak: number; exit: number }[]>()
    for (const entry of listEphemerides(start)) {
      const key = streamName(entry)
      const windows = byStream.get(key) ?? []
      windows.push(entry)
      byStream.set(key, windows)
    }
    for (const [stream, windows] of byStream) {
      for (let i = 1; i < windows.length; i++) {
        assert.ok(windows[i].entry > windows[i - 1].exit,
          `stream ${stream} repeats a window at t=${start}`)
      }
    }
  }
})

test('a window still covers its own peak when the clock lands on it', () => {
  // "To the moment" lands exactly on a peak: the schedule read there must
  // show that same window as happening now, whatever stream it came from.
  const peaks = listEphemerides(400).map((entry) => entry.peak)
  assert.ok(peaks.length > 0)
  for (const peak of peaks) {
    const covering = listEphemerides(peak)
      .filter((entry) => entry.entry <= peak && peak <= entry.exit)
    assert.ok(covering.some((entry) => Math.abs(entry.peak - peak) < 0.1),
      `no window covers its own peak t=${peak}`)
  }
})

test('the schedule stays honest at deep time, where deep links wander', () => {
  // Deep links may carry ?t= up to 1e9, and the panel reads the schedule
  // there too. No single window outlives 150 units — the widest is the
  // storm's active veil (0.32 of a 240-unit period) — so a window whose
  // peak lies further back than that is a stale leftover, not a moment.
  for (const start of [1e5, 1e6, 1e8]) {
    for (const entry of listEphemerides(start)) {
      assert.ok(Number.isFinite(entry.peak),
        `window ${streamName(entry)} has a non-finite peak at t=${start}`)
      assert.ok(entry.peak >= start - 150,
        `stale window ${streamName(entry)} at t=${start}: peak ${entry.peak}`)
    }
  }
})
