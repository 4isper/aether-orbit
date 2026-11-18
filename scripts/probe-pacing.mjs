/**
 * Frame-pacing probe on the REAL GPU: opens a deep link, waits for the scene,
 * then records every requestAnimationFrame delta for ~8 s and prints the
 * histogram — median, p90, p99, worst frame, hitch counts. This is the
 * objective answer to "does the camera still jerk": a calm view shows a tight
 * distribution at the display cadence, a jerky one shows spikes.
 * Usage: node scripts/probe-pacing.mjs <name> <url>
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'

const DIST = join(process.cwd(), 'dist')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
const server = createServer(async (req, res) => {
  const file = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const body = await readFile(join(DIST, file))
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
let browser = null
for (const candidate of [
  { channel: 'chrome' },
  { channel: 'msedge' },
  { channel: 'chromium' },
  { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
]) {
  try { browser = await chromium.launch({ headless: true, ...candidate }); break } catch {}
}
const [,, name, url] = process.argv
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const messages = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) messages.push(`${m.type()}: ${m.text().slice(0, 200)}`) })
page.on('pageerror', (e) => messages.push(`pageerror: ${String(e).slice(0, 200)}`))
await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
await page.waitForSelector('.is-ready', { timeout: 30000 })
await page.waitForTimeout(3000) // shaders warm up before the sample window

const stats = await page.evaluate(() => new Promise((resolve) => {
  const deltas = []
  let last = performance.now()
  const t0 = last
  function tick(now) {
    deltas.push(now - last)
    last = now
    if (now - t0 < 8000) requestAnimationFrame(tick)
    else {
      deltas.shift() // the first delta spans the idle gap, not real pacing
      deltas.sort((a, b) => a - b)
      const n = deltas.length
      const mean = deltas.reduce((s, d) => s + d, 0) / n
      resolve({
        fps: Math.round(1000 / mean),
        meanMs: +mean.toFixed(1),
        median: +deltas[Math.floor(n / 2)].toFixed(1),
        p90: +deltas[Math.floor(n * 0.9)].toFixed(1),
        p99: +deltas[Math.floor(n * 0.99)].toFixed(1),
        max: +deltas[n - 1].toFixed(1),
        hitches33: deltas.filter((d) => d > 33).length,
        hitches50: deltas.filter((d) => d > 50).length,
        frames: n,
      })
    }
  }
  requestAnimationFrame(tick)
}))
console.log(JSON.stringify(stats))
if (messages.length) console.log(messages.slice(0, 6).join('\n'))
await page.screenshot({ path: `/tmp/pacing-${name}.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } })
await browser.close()
server.close()
process.exit(0)
