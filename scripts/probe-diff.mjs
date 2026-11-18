/**
 * Motion-bisection probe: on the real GPU, captures two frames ~350 ms
 * apart and reports WHERE the frame changes — the whole frame means the
 * camera, a disc means the surface, a stripe means the sky layers.
 * Usage: node scripts/probe-diff.mjs <name> <url>
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
await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
await page.waitForSelector('.is-ready', { timeout: 30000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `/tmp/diff-${name}-a.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } })
await page.waitForTimeout(350)
await page.screenshot({ path: `/tmp/diff-${name}-b.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } })
const b1 = (await readFile(`/tmp/diff-${name}-a.png`)).toString('base64')
const b2 = (await readFile(`/tmp/diff-${name}-b.png`)).toString('base64')
const report = await page.evaluate(async ([a, b]) => {
  const load = (src) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src })
  const [ia, ib] = await Promise.all([load('data:image/png;base64,' + a), load('data:image/png;base64,' + b)])
  const w = ia.naturalWidth, h = ia.naturalHeight
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(ia, 0, 0)
  const da = ctx.getImageData(0, 0, w, h).data
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(ib, 0, 0)
  const db = ctx.getImageData(0, 0, w, h).data
  let minX = w, minY = h, maxX = -1, maxY = -1, changed = 0
  const rows = new Set(), cols = new Set()
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      const d = Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2])
      if (d > 24) {
        changed++
        rows.add(y); cols.add(x)
      }
    }
  }
  const span = (set) => set.size ? [Math.min(...set), Math.max(...set)] : null
  return {
    changedPx: changed,
    changedFraction: +(changed / ((w/2)*(h/2))).toFixed(3),
    rows: span(rows),
    cols: span(cols),
  }
}, [b1, b2])
console.log(name, JSON.stringify(report))
await browser.close()
server.close()
process.exit(0)
