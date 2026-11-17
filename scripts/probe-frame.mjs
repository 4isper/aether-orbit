import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'
const DIST = join(process.cwd(), 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const file = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const body = await readFile(join(DIST, file))
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
let browser = null
for (const candidate of [{ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' }, { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' }]) {
  try { browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...candidate }); break } catch {}
}
const [,, name, url] = process.argv
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
await page.waitForSelector('.is-ready', { timeout: 30000 })
await page.addStyleTag({ content: '.interface { visibility: hidden !important; }' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `/tmp/probe-${name}.png`, clip: { x: 0, y: 0, width: 640, height: 400 } })
await browser.close(); server.close()
console.log('captured', name)
process.exit(0)
