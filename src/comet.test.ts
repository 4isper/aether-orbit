import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { keplerSpeed } from './orbits.ts'
import { cometOrbit, cometOrbitPoint, cometPeriod, cometPosition, nextPerihelion, PERIHELION_RADIUS, tailParticlePosition } from './comet.ts'

const scratch = new Vector3()

const HEAD = new Vector3(4, 0.5, -2)
const ANTI_SUN = HEAD.clone().normalize()
const TAIL_LENGTH = 6

test('periapsis and apoapsis match the configured ellipse', () => {
  const peri = cometOrbitPoint(0, scratch).length()
  const apo = cometOrbitPoint(Math.PI, scratch).length()
  assert.ok(Math.abs(peri - cometOrbit.periapsis) < 1e-6, `periapsis ${peri}`)
  assert.ok(Math.abs(apo - cometOrbit.apoapsis) < 1e-6, `apoapsis ${apo}`)
})

test('the orbit repeats after one period', () => {
  const start = cometPosition(0, new Vector3())
  const end = cometPosition(cometPeriod, scratch)
  assert.ok(start.distanceTo(end) < 1e-6)
})

test('the Kepler solver stays continuous across a full orbit', () => {
  let previous = cometOrbitPoint(0, new Vector3())
  for (let m = 0.01; m <= Math.PI * 2; m += 0.01) {
    const current = cometOrbitPoint(m, scratch)
    const step = previous.distanceTo(current)
    assert.ok(step < 0.5, `position jumped ${step} at mean anomaly ${m}`)
    const radius = current.length()
    assert.ok(radius >= cometOrbit.periapsis - 1e-6, `radius ${radius} below periapsis at m=${m}`)
    assert.ok(radius <= cometOrbit.apoapsis + 1e-6, `radius ${radius} above apoapsis at m=${m}`)
    previous.copy(current)
  }
})

test('the comet moves faster near periapsis than near apoapsis (Kepler II)', () => {
  const meanMotion = (Math.PI * 2) / cometPeriod
  const timeAtPeriapsis = ((Math.PI * 2 - cometOrbit.meanAnomalyAtZero) % (Math.PI * 2)) / meanMotion
  const timeAtApoapsis = ((Math.PI - cometOrbit.meanAnomalyAtZero) % (Math.PI * 2)) / meanMotion
  const nearPeri = cometPosition(timeAtPeriapsis - 0.4, new Vector3())
    .distanceTo(cometPosition(timeAtPeriapsis, scratch))
  const nearApo = cometPosition(timeAtApoapsis - 0.4, new Vector3())
    .distanceTo(cometPosition(timeAtApoapsis, scratch))
  assert.ok(nearPeri > nearApo * 2, `periapsis step ${nearPeri} vs apoapsis step ${nearApo}`)
})

test('tail particles stream away from the star', () => {
  const point = tailParticlePosition(1, TAIL_LENGTH, 0, HEAD, ANTI_SUN, 0, 0, new Vector3())
  const expected = HEAD.clone().addScaledVector(ANTI_SUN, TAIL_LENGTH)
  assert.ok(point.distanceTo(expected) < 1e-9, `point ${point.toArray()}`)
})

test('the ion tail is exactly anti-sunward, whatever the motion', () => {
  // The solar wind is radial: every particle sits on the straight anti-sun
  // line; the dust tail's ballistic curve is dust.ts's business, not the
  // ion tail's.
  for (const t of [0.3, 0.7, 1]) {
    const point = tailParticlePosition(t, TAIL_LENGTH, 0, HEAD, ANTI_SUN, 0, 0, new Vector3())
    const expected = HEAD.clone().addScaledVector(ANTI_SUN, t * TAIL_LENGTH)
    assert.ok(point.distanceTo(expected) < 1e-9, `ion particle at t=${t} left the radial line`)
  }
})

test('the comet tracks negative time the same as the equivalent positive time', () => {
  // Reversed playback feeds negative time into the same Kepler solver.
  const reversed = cometPosition(-42, new Vector3())
  const forward = cometPosition(-42 + cometPeriod, new Vector3())
  assert.ok(reversed.distanceTo(forward) < 1e-6, `gap ${reversed.distanceTo(forward)}`)
})

test('nextPerihelion lands on the periapsis, strictly ahead', () => {
  for (let start = 0; start <= 500; start += 23) {
    const event = nextPerihelion(start)
    // Inside an ongoing blaze window the peak sits behind `now` — the second
    // half of the same moment; only a future window must lie strictly ahead.
    assert.ok(event.inProgress || event.peak >= start, `peak ${event.peak} behind start ${start}`)
    const radius = cometPosition(event.peak, new Vector3()).length()
    assert.ok(
      Math.abs(radius - cometOrbit.periapsis) < 1e-3,
      `peak radius ${radius} is not the periapsis ${cometOrbit.periapsis}`,
    )
    assert.ok(event.entry < event.peak && event.peak < event.exit, 'window is not ordered')
    assert.ok(event.inProgress === (start >= event.entry && start <= event.exit))
  }
})

test('perihelion repeats on the orbit period', () => {
  const first = nextPerihelion(0)
  // The next lap is announced once the current blaze window has closed.
  const second = nextPerihelion(first.exit + 1)
  assert.ok(Math.abs(second.peak - first.peak - cometPeriod) < 1e-6, `period drift ${second.peak - first.peak}`)
})

test('the comet flies the planets\' Kepler-3, not a private clock', () => {
  // One gravity constant for every heliocentric lap: the period falls out of
  // keplerSpeed at the semi-major axis, like the planets' own years do.
  const semiMajor = (cometOrbit.periapsis + cometOrbit.apoapsis) / 2
  const expected = (Math.PI * 2) / keplerSpeed(semiMajor)
  const first = nextPerihelion(0)
  const second = nextPerihelion(first.exit + 1)
  assert.ok(
    Math.abs(second.peak - first.peak - expected) < 1e-6,
    `comet lap ${second.peak - first.peak} vs the honest ${expected}`,
  )
})

test('the perihelion window matches the comet actually blazing', () => {
  const event = nextPerihelion(0)
  // Inside the window the comet is within the announced radius; just outside
  // it the tails have visibly faded.
  const entryRadius = cometPosition(event.entry, new Vector3()).length()
  const exitRadius = cometPosition(event.exit, new Vector3()).length()
  assert.ok(entryRadius <= PERIHELION_RADIUS + 1e-6, `entry radius ${entryRadius}`)
  assert.ok(exitRadius <= PERIHELION_RADIUS + 1e-6, `exit radius ${exitRadius}`)
  const before = cometPosition(event.entry - 0.3, new Vector3()).length()
  const after = cometPosition(event.exit + 0.3, new Vector3()).length()
  assert.ok(before > PERIHELION_RADIUS, `before radius ${before}`)
  assert.ok(after > PERIHELION_RADIUS, `after radius ${after}`)
})

test('the blaze window stays "now" through its second half', () => {
  const event = nextPerihelion(0)
  // One second past the peak the comet is still burning: the announcement
  // must not jump to the next lap's window.
  const after = nextPerihelion(event.peak + 1)
  assert.ok(after.inProgress, 'the second half of the blaze window went dark')
  assert.ok(after.peak < event.peak + 5, 'the peak walked a lap away from the fire')
})
