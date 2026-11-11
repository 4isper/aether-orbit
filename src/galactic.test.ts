import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { createRandom } from './random.ts'
import { galacticBandDirection } from './galactic.ts'

const NORMAL = new Vector3(0.177, 0.984, 0).normalize()

test('band directions hug the galactic plane', () => {
  const random = createRandom(3107)
  const out = new Vector3()
  let meanOffset = 0
  let maxOffset = 0
  for (let i = 0; i < 2500; i++) {
    galacticBandDirection(random, NORMAL, 0.16, out)
    const offset = Math.abs(out.dot(NORMAL))
    meanOffset += offset
    maxOffset = Math.max(maxOffset, offset)
  }
  meanOffset /= 2500
  // A uniform sphere would average 0.5; a band this tight sits far below it.
  assert.ok(meanOffset < 0.14, `mean offset ${meanOffset.toFixed(3)}`)
  assert.ok(maxOffset < 0.45, `max offset ${maxOffset.toFixed(3)}`)
})

test('band directions stay unit length', () => {
  const random = createRandom(8841)
  const out = new Vector3()
  for (let i = 0; i < 500; i++) {
    galacticBandDirection(random, NORMAL, 0.16, out)
    assert.ok(Math.abs(out.length() - 1) < 1e-6, `length ${out.length()}`)
  }
})

test('band directions spread over the whole circle, not one arc', () => {
  const random = createRandom(5150)
  const out = new Vector3()
  const seen = new Set<string>()
  for (let i = 0; i < 400; i++) {
    galacticBandDirection(random, NORMAL, 0.16, out)
    // coarse octant of the band: the sign pattern of the in-plane components
    const key = `${out.x > 0},${out.z > 0},${Math.abs(out.x) > Math.abs(out.z)}`
    seen.add(key)
  }
  assert.ok(seen.size >= 7, `covered ${seen.size} octants of 8`)
})
