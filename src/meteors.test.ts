import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import {
  METEOR_IDLE,
  METEOR_LIFE,
  METEOR_ORBIT_RADIUS,
  METEOR_SPEED,
  SHOWER_PERIOD,
  SHOWER_THRESHOLD,
  meteorAlpha,
  meteorPhase,
  meteorPoint,
  meteorSpawn,
  nextShower,
  showerIntensity,
  showerMeteor,
  showerRadiant,
  showerSpawn,
} from './meteors.ts'

const ORIGIN = () => new Vector3()

/** The first moment at or after `time` with no shower activity at all. */
function calmAfter(time: number) {
  let calm = time
  while (showerIntensity(calm) > 0) calm += 1
  return calm
}

/** The first moment at or after `time` inside the announced window. */
function ragingAfter(time: number) {
  let raging = time
  while (showerIntensity(raging) < SHOWER_THRESHOLD) raging += 1
  return raging
}

test('spawns are deterministic per slot and cycle, and vary between cycles', () => {
  const a = meteorSpawn(9127, 3)
  const b = meteorSpawn(9127, 3)
  assert.ok(a.origin.distanceTo(b.origin) < 1e-12)
  assert.ok(a.velocity.distanceTo(b.velocity) < 1e-12)

  const next = meteorSpawn(9127, 4)
  assert.ok(a.origin.distanceTo(next.origin) > 1e-3, 'consecutive cycles reused the same path')
})

test('a spawn flies tangentially inside the star shell', () => {
  for (const slotSeed of [9127, 3313, 7717, 4217]) {
    for (let cycle = 0; cycle < 40; cycle++) {
      const { origin, velocity } = meteorSpawn(slotSeed, cycle)
      const radius = origin.length()
      assert.ok(radius >= METEOR_ORBIT_RADIUS[0] && radius <= METEOR_ORBIT_RADIUS[1], `radius ${radius}`)
      const speed = velocity.length()
      assert.ok(speed >= METEOR_SPEED[0] && speed <= METEOR_SPEED[1], `speed ${speed}`)
      // Purely tangential: the streak never leaves the shell.
      assert.ok(Math.abs(velocity.dot(origin) / (speed * radius)) < 1e-6, `radial drift at slot ${slotSeed} cycle ${cycle}`)
    }
  }
})

test('phase stays inside one cycle and lands on the same spawn within it', () => {
  const seed = 3313
  const t = 137.4
  const phase = meteorPhase(seed, t)
  assert.ok(phase.age >= 0 && phase.age < phase.cycle, `age ${phase.age} outside cycle ${phase.cycle}`)
  assert.ok(phase.cycle > METEOR_LIFE[0] + METEOR_IDLE[0] - 1e-9)

  const early = meteorPhase(seed, t + 0.05)
  assert.ok(early.spawn.origin.distanceTo(phase.spawn.origin) < 1e-12, 'spawn changed mid-flight')
  assert.ok(Math.abs(early.age - phase.age - 0.05) < 1e-9, 'age does not advance with time')
})

test('phases are desynced between slots', () => {
  const a = meteorPhase(9127, 50)
  const b = meteorPhase(7717, 50)
  assert.ok(Math.abs(a.age - b.age) > 1e-3, 'all slots burn at the same moment')
})

test('alpha envelope: dark at the edges, bright in the middle', () => {
  const life = 1.2
  assert.equal(meteorAlpha(0, life), 0)
  assert.equal(meteorAlpha(-0.5, life), 0)
  assert.equal(meteorAlpha(life, life), 0)
  assert.equal(meteorAlpha(life + 3, life), 0)
  const mid = meteorAlpha(life * 0.5, life)
  assert.ok(mid > 0 && mid <= 1, `mid alpha ${mid}`)
  assert.ok(meteorAlpha(life * 0.1, life) < mid, 'fade-in has not peaked yet')
  assert.ok(meteorAlpha(life * 0.9, life) < mid, 'fade-out has left the peak')
})

test('head rides exactly along the velocity', () => {
  const { origin, velocity } = meteorSpawn(4217, 2)
  const point = meteorPoint({ origin, velocity }, 0.7, ORIGIN())
  const expected = origin.clone().addScaledVector(velocity, 0.7)
  assert.ok(point.distanceTo(expected) < 1e-12)
})

test('the shower is a pure function of the clock, reversal included', () => {
  for (const time of [0, 87.3, -300, 1200]) {
    assert.equal(showerIntensity(time), showerIntensity(time))
    // Two full cycles back replays the same rain: the phase matches to a
    // rounding hair, far below anything the eye could see.
    assert.ok(
      Math.abs(showerIntensity(time) - showerIntensity(time - 2 * SHOWER_PERIOD)) < 1e-9,
      `reversal drifted at t=${time}`,
    )
  }
})

test('the sky keeps the shower rare: a low duty cycle', () => {
  let active = 0
  let samples = 0
  for (let t = 0; t < 3000; t += 0.25) {
    if (showerIntensity(t) > 0) active += 1
    samples += 1
  }
  assert.ok(active / samples < 0.2, `duty cycle ${(active / samples).toFixed(2)} never ends`)
})

test('nextShower finds a window the chip can announce', () => {
  const event = nextShower(calmAfter(0))
  assert.ok(event, 'no shower found within the horizon')
  assert.ok(event.entry < event.peak && event.peak < event.exit, 'window edges are ordered')
  assert.ok(showerIntensity(event.peak) >= SHOWER_THRESHOLD, 'the peak is too faint to announce')
  assert.ok(showerIntensity(event.entry - 0.5) < SHOWER_THRESHOLD, 'entry sits inside the calm')
  assert.ok(showerIntensity(event.exit + 0.5) < SHOWER_THRESHOLD, 'exit sits inside the calm')
})

test('a shower already underway is announced as happening now', () => {
  const raging = nextShower(ragingAfter(calmAfter(0)))
  assert.ok(raging && raging.inProgress, 'the ongoing shower went unannounced')
})

test('every streak of one shower flies from a single radiant', () => {
  const radiant = showerRadiant(4, ORIGIN())
  assert.ok(Math.abs(radiant.length() - 1) < 1e-9, 'the radiant is not a unit direction')
  for (let slot = 0; slot < 6; slot++) {
    for (let cycle = 0; cycle < 30; cycle++) {
      const { velocity } = showerSpawn(2113 + slot * 137, cycle, 4)
      const away = velocity.clone().normalize()
      // Parallel trajectories: each streak points away from the radiant point.
      assert.ok(away.dot(radiant) < -0.97, `streak ${slot}/${cycle} ignores the radiant`)
    }
  }
})

test('shower streaks gather near the radiant and stay in the shell', () => {
  const radiant = showerRadiant(2, ORIGIN())
  for (let slot = 0; slot < 6; slot++) {
    for (let cycle = 0; cycle < 30; cycle++) {
      const { origin, velocity } = showerSpawn(5801 + slot * 173, cycle, 2)
      const radius = origin.length()
      assert.ok(radius >= METEOR_ORBIT_RADIUS[0] && radius <= METEOR_ORBIT_RADIUS[1], `radius ${radius}`)
      assert.ok(origin.clone().normalize().dot(radiant) > 0.7, 'the origin drifted off the radiant')
      const speed = velocity.length()
      assert.ok(speed >= METEOR_SPEED[0] && speed <= METEOR_SPEED[1], `speed ${speed}`)
    }
  }
})

test('showers differ: the next rain takes another radiant and paths', () => {
  const first = showerSpawn(2113, 5, 4)
  const second = showerSpawn(2113, 5, 5)
  assert.ok(first.origin.distanceTo(second.origin) > 1e-3, 'the next shower replayed the same paths')
  const radiantA = showerRadiant(4, ORIGIN())
  const radiantB = showerRadiant(5, ORIGIN())
  assert.ok(radiantA.angleTo(radiantB) > 0.1, 'every shower radiates from the same point')
})

test('shower slots burn often and deterministically through the veil', () => {
  const start = ragingAfter(calmAfter(0)) + 3
  const phase = showerMeteor(2113, start)
  assert.ok(phase.age >= 0 && phase.age < phase.cycle, 'age outside the cycle')
  // A shower is a rain: the gap between flights is far shorter than the
  // ambient slots' idle stretch.
  assert.ok(phase.cycle < METEOR_IDLE[0] + METEOR_LIFE[0], `cycle ${phase.cycle} is too sparse`)
  // Rebase to mid-flight so the +0.05 step cannot cross a cycle boundary.
  const mid = start - phase.age + phase.cycle * 0.5
  const later = showerMeteor(2113, mid + 0.05)
  assert.ok(later.spawn.origin.distanceTo(phase.spawn.origin) < 1e-12, 'spawn changed mid-flight')
})
