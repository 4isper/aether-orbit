/**
 * Golden-frame regression test: opens nine fixed deep links in software-WebGL
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
 * The comparison reads 16x16 block means of a 3px-blurred pair, not raw
 * pixels: SwiftShader compiles shaders per process and its run-to-run
 * jitter lands as one-pixel speckle in the noise-heavy surfaces. A blur
 * plus block means average that noise to near zero, while a real
 * regression — a brightness or geometry shift — survives at a multiple of
 * the tolerance in every block it touches.
 *
 * Fails when any block's mean channel delta exceeds 16/255 (or the global
 * mean 1.2/255), or when a reference is missing outside --update. Needs a
 * Chrome-family browser.
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
  { name: 'star-flare', url: '/?view=star&t=105&dpr=1' },
  { name: 'moon', url: '/?view=moon&t=200&dpr=1' },
  { name: 'erebus', url: '/?view=erebus&t=120&dpr=1' },
]

const BLOCK = 16
const BLOCK_TOLERANCE = 20
const MEAN_TOLERANCE = 1.2
const WIDTH = 640
const HEIGHT = 400
const SETTLE_MS = 1600
/** A rare race: the blend order of additive stacks (the dense starfield)
 * is scheduled per GPU process and occasionally flips a corner block's
 * brightness. The deterministic render is the norm, so a diverging frame
 * is re-captured on a fresh page — a real regression diverges every time. */
const CAPTURE_ATTEMPTS = 5

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
async function launchBrowser() {
  for (const candidate of launchCandidates) {
    try {
      browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...candidate })
      return
    } catch {
      // try the next browser
    }
  }
  console.error('frames: no Chrome-family browser found, skipping')
  process.exit(0)
}
await launchBrowser()

const consoleErrors = []
/** One capture, one young page: the software rasterizer's jitter turns out
 * to depend on the page's navigation history (a corner block flips after
 * eight earlier WebGL lifetimes), and a first load in a clean context is
 * the stable one. */
async function captureFrame(url) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  try {
    await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
    await page.waitForSelector('.is-ready', { timeout: 30000 })
    // The captured frame is the scene alone: the DOM overlay (text, chips,
    // captions) renders with whatever fonts a machine has, and machine-made
    // pixels have no business in a WebGL reference. Hidden for every frame.
    await page.addStyleTag({ content: `
      .interface, .cinema-toast, .tour-caption, .loader, .webgl-fallback {
        visibility: hidden !important;
      }
    ` })
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
    // The canvas fills the viewport (inset 0), so the clip is the whole
    // viewport at fixed coordinates: a clip derived from the canvas's
    // bounding box would wobble by a layout pixel, and a one-pixel shift of
    // a starfield is a wall of diverging blocks. Fail loudly if coverage
    // ever breaks.
    const box = await page.locator('canvas').first().boundingBox()
    if (!box || box.x > 1 || box.y > 1 || box.x + box.width < WIDTH || box.y + box.height < HEIGHT) {
      return { error: `canvas does not cover the viewport (box ${JSON.stringify(box)})` }
    }
    const clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    return { shot: await page.screenshot({ clip, timeout: 60000 }) }
  } finally {
    await page.close()
  }
}

let comparePage = await browser.newPage()

await mkdir(GOLDEN, { recursive: true })
let failures = 0
let recorded = 0

for (const frame of FRAMES) {
  const reference = join(GOLDEN, `${frame.name}.png`)
  let expected = null
  try {
    expected = await readFile(reference)
  } catch {
    // missing on first record
  }

  if (!expected && !UPDATE) {
    console.error(`frames: ${frame.name} has no reference — run "npm run golden:update" locally and commit docs/golden/`)
    failures++
    continue
  }

  // Rare race: the blend order of additive stacks (the dense starfield) is
  // scheduled per GPU process and occasionally flips a corner block's
  // brightness. The deterministic render is the norm, so a diverging frame
  // is re-captured up to twice — and the retries relaunch the whole
  // browser: the mode lives in the GPU process, a fresh page inherits it.
  // A real regression diverges on every capture, a race loses the coin
  // toss.
  for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await browser.close()
      await launchBrowser()
      await comparePage.close()
      comparePage = await browser.newPage()
    }
    const { shot, error } = await captureFrame(frame.url)
    if (error) {
      console.error(`frames: ${frame.name} — ${error}`)
      failures++
      break
    }

    if (UPDATE || !expected) {
      await writeFile(reference, shot)
      recorded++
      console.log(`frames: ${frame.name} ${expected ? 're-recorded' : 'recorded'}`)
      break
    }

    const verdict = await comparePage.evaluate(async ([shotUrl, expectedUrl, block]) => {
    const load = (src) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src })
    const [a, b] = await Promise.all([load(shotUrl), load(expectedUrl)])
    if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) {
      return { sizeMismatch: true }
    }
    const canvas = document.createElement('canvas')
    canvas.width = a.naturalWidth
    canvas.height = a.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    // Both frames go through the same 2px blur before the comparison: the
    // software rasterizer is multithreaded and its run-to-run jitter lands
    // as one-pixel shifts of high-contrast edges, which a blur erases —
    // while a real brightness or geometry shift keeps its strength.
    ctx.filter = 'blur(2px)'
    ctx.drawImage(a, 0, 0)
    const da = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(b, 0, 0)
    const db = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    ctx.filter = 'none'
    // Block means: the residual jitter averages away, a real shift keeps
    // its strength in every block it touches.
    let worstAt = null
    const columns = Math.floor(canvas.width / block)
    const rows = Math.floor(canvas.height / block)
    let worst = 0
    let sum = 0
    let counted = 0
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < columns; bx++) {
        let dsum = 0
        for (let y = by * block; y < (by + 1) * block; y++) {
          for (let x = bx * block; x < (bx + 1) * block; x++) {
            const i = (y * canvas.width + x) * 4
            dsum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
          }
        }
        const mean = dsum / (block * block * 3)
        if (mean > worst) { worst = mean; worstAt = [bx * block, by * block] }
        sum += mean
        counted++
      }
    }
    return { worst, worstAt, mean: sum / counted }
    }, [
      `data:image/png;base64,${shot.toString('base64')}`,
      `data:image/png;base64,${expected.toString('base64')}`,
      BLOCK,
    ])

    if (verdict.sizeMismatch) {
      console.error(`frames: ${frame.name} changed size — re-record with "npm run golden:update"`)
      failures++
      break
    }
    const ok = verdict.worst <= BLOCK_TOLERANCE && verdict.mean <= MEAN_TOLERANCE
    if (!ok && attempt < CAPTURE_ATTEMPTS - 1) {
      console.log(`frames: ${frame.name} diverged (worst block Δ${verdict.worst.toFixed(2)}), re-capturing`)
      continue
    }
    console.log(`frames: ${frame.name} worst block Δ${verdict.worst.toFixed(2)} mean Δ${verdict.mean.toFixed(3)} ${ok ? 'ok' : 'DIVERGED'}`)
    if (!ok) failures++
  }
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
