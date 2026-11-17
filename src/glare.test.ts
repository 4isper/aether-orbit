import assert from 'node:assert/strict'
import { test } from 'node:test'
import { glareFactor } from './glare.ts'

test('looking away from the star produces no glare', () => {
  assert.equal(glareFactor(0.2, 400), 0)
  assert.equal(glareFactor(0.9, 400), 0)
  // Ninety degrees off is the orbit camera's home: the star to the side.
  assert.equal(glareFactor(0, 400), 0)
})

test('a centered close star floods the view, bounded', () => {
  const glare = glareFactor(1, 300)
  assert.ok(glare > 0.5, `straight-on inside 3.4 R☉ gives ${glare}`)
  assert.ok(glare <= 1, 'bounded above')
})

test('glare grows monotonically as the star centers', () => {
  let previous = -1
  for (let dot = 0.9; dot <= 1; dot += 0.005) {
    const glare = glareFactor(dot, 400)
    assert.ok(glare >= previous, `glare fell from ${previous} to ${glare} at dot ${dot}`)
    previous = glare
  }
})

test('a far star is a small sun: glare fades with distance', () => {
  assert.ok(glareFactor(1, 45_000) < glareFactor(1, 300), 'overview distance should not flood')
  // The composed star view (4.9 R☉ ≈ 535 units) keeps its granulation readable.
  assert.ok(glareFactor(1, 535) < 0.15, `star view glare ${glareFactor(1, 535)} is too strong`)
  assert.equal(glareFactor(1, 45_000), 0)
})
