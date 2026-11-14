/**
 * The ephemerides: one schedule of every deterministic sky moment, whatever
 * view the camera holds. Each stream keeps its own scanner — the shared
 * nextWindow here, the analytic periapsis windows of the comet and the dwarf
 * there — and this module walks them forward with a cursor, merging every
 * announcement into one sorted list. Pure functions of the simulation time:
 * pause, reversal and deep links replay the same schedule.
 */
import { nextEclipse, nextTransit } from './eclipse.ts'
import { nextConjunction } from './conjunction.ts'
import { nextPerihelion } from './comet.ts'
import { nextShower } from './meteors.ts'
import { nextStorm } from './storms.ts'
import { nextErebusPeriapsis } from './erebus.ts'

/** The kinds of sky moment the scene announces — the schedule and the
 * per-view chip speak the same names. */
export type EventKind = 'transit' | 'eclipse' | 'perihelion' | 'conjunction' | 'storm' | 'shower'

/** The body an entry's label names: a conjunction names its target, a
 * periapsis names its world. Everything else is its own subject. */
export type EventBody = 'erebus' | 'vesper' | 'aurelia'

export type EphemerisEntry = {
  kind: EventKind
  body?: EventBody
  /** First contact, deepest alignment, last moment inside. */
  entry: number
  peak: number
  exit: number
}

type EventStream = {
  kind: EventKind
  body?: EventBody
  /** The next window at or after `now` — a per-module scanner, unchanged. */
  next: (now: number) => { entry: number; peak: number; exit: number } | null
}

/** One row per stream, each on the clock its scanner already owns. */
const STREAMS: EventStream[] = [
  { kind: 'transit', next: nextTransit },
  { kind: 'eclipse', next: nextEclipse },
  { kind: 'perihelion', next: nextPerihelion },
  { kind: 'perihelion', body: 'erebus', next: nextErebusPeriapsis },
  { kind: 'conjunction', body: 'vesper', next: (now) => nextConjunction('cinder', 'vesper', now) },
  { kind: 'conjunction', body: 'aurelia', next: (now) => nextConjunction('vesper', 'aurelia', now) },
  { kind: 'storm', next: nextStorm },
  { kind: 'shower', next: nextShower },
]

/**
 * How far ahead the schedule reaches, in time units. The slowest sky clock
 * is the Cinder→Vesper conjunction: the two outer years (≈610 and ≈1047)
 * put their synodic meeting ≈1462 units apart, and its scan horizon adds a
 * quarter for safety. 1900 covers one meeting of every stream.
 */
export const EPHEMERIS_HORIZON = 1900

/** Occurrences per stream: the next two show the rhythm of the sky without
 * crowding the panel with comet laps. */
export const EPHEMERIS_DEPTH = 2

/**
 * The scanners refine a window's exit to the inside of the boundary, so
 * resuming from a bare exit would re-read the same crossing; a step past it
 * starts the next window honestly.
 */
const CURSOR_STEP = 0.01

/** Up to `depth` occurrences of one stream, strictly after one another. */
function streamWindows(stream: EventStream, now: number): EphemerisEntry[] {
  const windows: EphemerisEntry[] = []
  const horizon = now + EPHEMERIS_HORIZON
  let cursor = now
  while (windows.length < EPHEMERIS_DEPTH) {
    const window = stream.next(cursor)
    if (!window || window.entry > horizon) break
    windows.push({ kind: stream.kind, body: stream.body, ...window })
    cursor = window.exit + CURSOR_STEP
  }
  return windows
}

/**
 * The schedule: every stream's next windows merged and sorted by first
 * contact, so the in-progress moment leads the list and the rest follow in
 * the order the sky delivers them.
 */
export function listEphemerides(now: number): EphemerisEntry[] {
  return STREAMS
    .flatMap((stream) => streamWindows(stream, now))
    .sort((a, b) => a.entry - b.entry)
}
