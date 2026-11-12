import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import {
  METEOR_IDLE,
  METEOR_LIFE,
  METEOR_ORBIT_RADIUS,
  METEOR_SPEED,
  meteorAlpha,
  meteorPhase,
  meteorPoint,
  meteorSpawn,
} from './meteors.ts'

const ORIGIN = () => new Vector3()

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
