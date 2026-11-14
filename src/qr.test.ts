import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qrCode } from './qr.ts'

const LINK = 'https://aether-orbit-three.vercel.app/?view=moon'

test('the same link encodes twice into the same code', () => {
  assert.deepEqual(qrCode(LINK), qrCode(LINK))
})

test('different links draw different modules', () => {
  const one = qrCode(LINK)
  const other = qrCode('https://aether-orbit-three.vercel.app/?view=erebus')
  assert.notEqual(one.path, other.path)
})

test('a longer link never shrinks the symbol', () => {
  const short = qrCode(LINK)
  const long = qrCode(`${LINK}&yaw=1.2&pitch=-0.4&zoom=9.5&t=8421`)
  assert.ok(long.size >= short.size)
})

/** A finder is the 7×7 mark in each corner: dark outer frame, a light ring
 * inside it, a dark 3×3 eye in the middle. Reading them proves the code we
 * render is a QR code and not just a scatter of squares. */
function assertFinder(modules: boolean[][], x0: number, y0: number) {
  for (let i = 0; i < 7; i++) {
    assert.ok(modules[y0][x0 + i], `top edge dark at ${x0 + i},${y0}`)
    assert.ok(modules[y0 + 6][x0 + i], `bottom edge dark at ${x0 + i},${y0 + 6}`)
    assert.ok(modules[y0 + i][x0], `left edge dark at ${x0},${y0 + i}`)
    assert.ok(modules[y0 + i][x0 + 6], `right edge dark at ${x0 + 6},${y0 + i}`)
  }
  assert.ok(!modules[y0 + 1][x0 + 1], 'the light ring inside the frame')
  assert.ok(modules[y0 + 3][x0 + 3], 'the dark eye in the middle')
}

test('the matrix holds three finder marks and no quiet-zone border', () => {
  const { size, modules } = qrCode(LINK)
  assert.ok(size >= 21, 'the smallest symbol is 21 modules')
  // No quiet zone inside the matrix: the corners are the finders themselves.
  assertFinder(modules, 0, 0)
  assertFinder(modules, size - 7, 0)
  assertFinder(modules, 0, size - 7)
})

test('the path draws exactly the dark modules as unit squares', () => {
  const { size, modules, path } = qrCode(LINK)
  const dark = modules.flat().filter(Boolean).length
  const squares = path.match(/M\d+ \d+h1v1h-1z/g)
  assert.equal(squares?.length, dark)
  assert.ok(!path.includes('M' + size), 'no module starts beyond the symbol')
})
