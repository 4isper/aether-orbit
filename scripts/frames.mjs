/**
 * Golden-frame regression test: opens fixed deep links in software-WebGL
 * Chromium and compares the rendered canvas against committed references in
 * docs/golden/. Reduced motion freezes every private accumulator, the shared
 * clock lands on the deep-linked ?t=, and the camera sits on the shared pose,
 * so each frame is a pure function of the URL — the same discipline the deep
 * links already promise, now pinned pixel by pixel.
 *
 * Every URL pins ?dpr=1: the quality ladder reads the display's frame rate
 * and would otherwise pick a different canvas size on every run.
 *
 * The screenshot captures the canvas alone: DOM text renders with whatever
 * fonts a machine has, but the WebGL frame depends only on the build.
 *
 * Usage: node scripts/frames.mjs            # compare (CI)
 *        node scripts/frames.mjs --update   # re-record the references
 *
 * Fails when a frame diverges beyond tolerance (mean channel delta over
 * 1.5/255, or more than 0.3% of pixels shifting hard) or when a reference
 * is missing outside --update. Needs a Chrome-family browser.
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')
const GOLDEN = join(ROOT, 'docs', 'golden')
const UPDATE = process.argv.includes('--update')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain',
}

/** Fixed moments: flare peak on the star's orbit, cyclone over the ocean,
 * the ring system, the desert, the belt interior and the overview. */
const FRAMES = [
  { name: 'aurelia-cyclone', url: '/?view=aurelia&t=16&yaw=0&pitch=0.12&zoom=6&dpr=1' },
  { name: 'aurelia-flare', url: '/?view=aurelia&t=105&yaw=0.2&pitch=0.1&zoom=7&dpr=1' },
  { name: 'vesper-rings', url: '/?view=vesper&t=120&yaw=-0.2&pitch=0.08&zoom=8&dpr=1' },
  { name: 'cinder', url: '/?view=cinder&t=300&yaw=0.1&pitch=0.1&zoom=8&dpr=1' },
  { name: 'belt', url: '/?view=belt&t=100&dpr=1' },
  { name: 'system', url: '/?view=system&t=150&dpr=1' },
]

const MEAN_TOLERANCE = 1.5
const HARD_DELTA = 30
const HARD_FRACTION = 0.003
const WIDTH = 640
const HEIGHT = 400
const SETTLE_MS = 1600

const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0]
  const file = path === '/' ? '/index.html' : path
  try {
    const body = await readFile(join(DIST, file))
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('not found')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const launchCandidates = [
  { channel: 'chrome' },
  { channel: 'msedge' },
  { channel: 'chromium' },
  { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
]
let browser = null
for (const candidate of launchCandidates) {
  try {
    browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...candidate })
    break
  } catch {
    // try the next browser
  }
}
if (!browser) {
  console.error('frames: no Chrome-family browser found, skipping')
  process.exit(0)
}

const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
await page.emulateMedia({ reducedMotion: 'reduce' })
const consoleErrors = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', (err) => consoleErrors.push(String(err)))

await mkdir(GOLDEN, { recursive: true })
let failures = 0
let recorded = 0

for (const frame of FRAMES) {
  await page.goto(`http://127.0.0.1:${port}${frame.url}`, { waitUntil: 'load' })
  await page.waitForSelector('.is-ready', { timeout: 30000 })
  // The canvas bitmap must hold one size before the capture: a screenshot
  // taken mid-resize would compare against a different shape.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return false
    const size = `${canvas.width}x${canvas.height}`
    if (window.__frameSize === size) return true
    window.__frameSize = size
    return false
  }, undefined, { polling: 250, timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(SETTLE_MS)
  // Clip the viewport to the canvas: element screenshots inherit the
  // element's own box, which can wobble while the page settles; the clip
  // is a constant 640x400 of the composited frame.
  const box = await page.locator('canvas').first().boundingBox()
  const clip = {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: Math.min(box.width, WIDTH - Math.max(0, box.x)),
    height: Math.min(box.height, HEIGHT - Math.max(0, box.y)),
  }
  const shot = await page.screenshot({ clip, timeout: 60000 })
  const reference = join(GOLDEN, `${frame.name}.png`)

  let expected = null
  try {
    expected = await readFile(reference)
  } catch {
    // missing on first record
  }

  if (!expected) {
    if (UPDATE) {
      await writeFile(reference, shot)
      recorded++
      console.log(`frames: ${frame.name} recorded`)
      continue
    }
    console.error(`frames: ${frame.name} has no reference — run "npm run golden:update" locally and commit docs/golden/`)
    failures++
    continue
  }

  if (UPDATE) {
    await writeFile(reference, shot)
    recorded++
    console.log(`frames: ${frame.name} re-recorded`)
    continue
  }

  const verdict = await page.evaluate(async ([shotUrl, expectedUrl, hardDelta]) => {
    const load = (src) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src })
    const [a, b] = await Promise.all([load(shotUrl), load(expectedUrl)])
    if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) {
      return { sizeMismatch: true }
    }
    const canvas = document.createElement('canvas')
    canvas.width = a.naturalWidth
    canvas.height = a.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(a, 0, 0)
    const da = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(b, 0, 0)
    const db = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    let hard = 0
    const count = canvas.width * canvas.height
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
      sum += d
      if (d > hardDelta * 3) hard++
    }
    return { mean: sum / (count * 3), hardFraction: hard / count }
  }, [
    `data:image/png;base64,${shot.toString('base64')}`,
    `data:image/png;base64,${expected.toString('base64')}`,
    HARD_DELTA,
  ])

  if (verdict.sizeMismatch) {
    console.error(`frames: ${frame.name} changed size — re-record with "npm run golden:update"`)
    failures++
    continue
  }
  const ok = verdict.mean <= MEAN_TOLERANCE && verdict.hardFraction <= HARD_FRACTION
  console.log(`frames: ${frame.name} mean Δ${verdict.mean.toFixed(3)} hard ${(verdict.hardFraction * 100).toFixed(3)}% ${ok ? 'ok' : 'DIVERGED'}`)
  if (!ok) failures++
}

await browser.close()
server.closeAllConnections()
server.close()

if (consoleErrors.length) {
  console.error('frames: console errors:', consoleErrors)
  failures++
}

if (failures > 0) {
  console.error(`frames: ${failures} failure(s)`)
  process.exit(1)
}
console.log(recorded > 0 ? `frames: ${recorded} reference(s) written` : 'frames: all references match')
process.exit(0)
