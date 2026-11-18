/**
 * Debug probe on the REAL GPU (no SwiftShader): opens a deep link, captures
 * a screenshot and every console error/warning — shader compile failures on
 * real GPUs print here but not in the SwiftShader golden runs.
 * Usage: node scripts/probe-real-gpu.mjs <name> <url>
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
const [,, name, url, locale] = process.argv
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
// An optional third argument pins the UI locale (localStorage, RU default):
// release checks open every view in EN to catch layout drift.
if (locale) {
  await page.addInitScript((value) => {
    localStorage.setItem('aether-locale', value)
  }, locale)
}
const messages = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) messages.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => messages.push(`pageerror: ${String(e).slice(0, 300)}`))
await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
await page.waitForSelector('.is-ready', { timeout: 30000 })
await page.waitForTimeout(10000)
await page.screenshot({ path: `/tmp/real-${name}.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } })
console.log(messages.length ? messages.slice(0, 8).join('\n') : 'console clean')
await browser.close()
server.close()
process.exit(0)
