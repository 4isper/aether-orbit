/**
 * Mobile UI/UX audit probe: opens every view in an emulated phone (touch,
 * DPR 3, mobile UA) in portrait and landscape, and reports per view:
 *  - horizontal overflow (scrollWidth vs clientWidth on <html>)
 *  - tap-target sizes of the interactive chrome (nav buttons, chip, controls)
 *  - a full-page screenshot
 * Usage: node scripts/probe-mobile.mjs <name> <url> [landscape]
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
const [,, name, url, orientation] = process.argv
// iPhone 14 descriptor by hand: playwright-core does not ship the device table.
const context = await browser.newContext({
  viewport: orientation === 'landscape' ? { width: 844, height: 390 } : { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  locale: 'en-US',
})
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
await page.waitForSelector('.is-ready', { timeout: 30000 })
await page.waitForTimeout(5000)

const report = await page.evaluate(() => {
  const doc = document.documentElement
  const overflow = doc.scrollWidth - doc.clientWidth
  // Tap targets: every visible button/anchor-ish control with its box.
  const targets = []
  for (const el of document.querySelectorAll('button, a, [role="button"], input[type="range"]')) {
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    if (box.width === 0 || box.height === 0) continue
    targets.push({
      label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28),
      w: Math.round(box.width), h: Math.round(box.height),
      y: Math.round(box.top),
    })
  }
  const small = targets.filter((t) => t.w < 40 || t.h < 24)
  return {
    overflow,
    targetCount: targets.length,
    smallTargets: small.slice(0, 10),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio,
  }
})
await page.screenshot({ path: `/tmp/mobile-${name}.png`, fullPage: false })
console.log(JSON.stringify({ name, ...report, errors: errors.slice(0, 4) }))
await browser.close()
server.close()
process.exit(0)
