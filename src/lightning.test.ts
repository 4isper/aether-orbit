import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LIGHTNING_CELLS, lightningStrikes } from './lightning.ts'

test('strikes are a pure function of the clock', () => {
  for (const time of [0, 33.3, -120, 640]) {
    const a = lightningStrikes(time, new Array(LIGHTNING_CELLS).fill(null))
    const b = lightningStrikes(time, new Array(LIGHTNING_CELLS).fill(null))
    assert.deepEqual(a, b)
  }
})

test('the night sky is mostly flash-free: low duty cycle', () => {
  // A storm that never rests is a sunrise, not a storm.
  let active = 0
  let samples = 0
  for (let t = 0; t < 2000; t += 0.1) {
    const strikes = lightningStrikes(t, new Array(LIGHTNING_CELLS).fill(null))
    if (strikes.some((s) => s !== null && s.strength > 0)) active += 1
    samples += 1
  }
  assert.ok(active / samples < 0.25, `duty cycle ${(active / samples).toFixed(2)} is too busy`)
})

test('each cell reaches full strength at its strike and goes dark between', () => {
  for (let cell = 0; cell < LIGHTNING_CELLS; cell++) {
    let peak = 0
    let peakTime = 0
    for (let t = 0; t < 60; t += 0.01) {
      const strikes = lightningStrikes(t, new Array(LIGHTNING_CELLS).fill(null))
      const s = strikes[cell]
      if (s && s.strength > peak) {
        peak = s.strength
        peakTime = t
      }
    }
    assert.ok(peak > 0.85, `cell ${cell} never flashes harder than ${peak}`)
    const before = lightningStrikes(peakTime - 1.5, new Array(LIGHTNING_CELLS).fill(null))[cell]
    assert.ok(!before || before.strength === 0, `cell ${cell} glows between strikes`)
  }
})

test('strikes stay in the mid-latitude storm belt, away from the aurora ovals', () => {
  for (let t = 0; t < 60; t += 0.5) {
    const strikes = lightningStrikes(t, new Array(LIGHTNING_CELLS).fill(null))
    for (const s of strikes) {
      if (!s) continue
      assert.ok(s.u >= 0 && s.u < 1, `longitude ${s.u} out of range`)
      assert.ok(s.v >= 0.15 && s.v <= 0.85, `latitude ${s.v} rides the poles`)
    }
  }
})
