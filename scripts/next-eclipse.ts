/**
 * Debug probe: print the next eclipse/transit windows from a given moment,
 * so deep links can land exactly on the peak of the shadow.
 * Usage: node --experimental-strip-types scripts/next-eclipse.ts [now] [mode]
 */
import { nextEclipse, nextTransit } from '../src/eclipse.ts'

const now = Number(process.argv[2] ?? 0)
const mode = process.argv[3] ?? 'eclipse'
const ev = mode === 'transit' ? nextTransit(now) : nextEclipse(now)
if (!ev) {
  console.log('no window found')
} else {
  console.log(JSON.stringify({
    entry: +ev.entry.toFixed(4),
    peak: +ev.peak.toFixed(4),
    exit: +ev.exit.toFixed(4),
    spanDays: +(ev.exit - ev.entry).toFixed(4),
    inDaysFromNow: +(ev.entry - now).toFixed(2),
  }))
}
