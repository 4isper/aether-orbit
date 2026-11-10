import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRandom } from './random.ts'

test('seeded random is deterministic and bounded', () => {
  const a = createRandom(4217)
  const b = createRandom(4217)
  for (let i = 0; i < 1000; i++) {
    const value = a()
    assert.ok(value >= 0 && value < 1, `value ${value} out of [0, 1)`)
    assert.equal(value, b(), `sequence diverged at step ${i}`)
  }
})

test('different seeds produce different sequences', () => {
  assert.notEqual(createRandom(1)(), createRandom(2)())
})
