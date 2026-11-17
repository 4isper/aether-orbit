import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'
const DIST = join(process.cwd(), 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const file = req.url.split('?')[0]
  let body = null
  if (file === '/probe-glow.html') body = await readFile(join(process.cwd(), 'scripts', 'probe-glow.html'))
  else if (file === '/three.module.js') body = await readFile(join(process.cwd(), 'node_modules/three/build/three.module.js'))
  else if (file === '/three.core.js') body = await readFile(join(process.cwd(), 'node_modules/three/build/three.core.js'))
  else if (file === '/postprocessing.esm.js') body = await readFile(join(process.cwd(), 'node_modules/postprocessing/build/postprocessing.js'))
  else if (file === '/postprocessing.module.js') body = await readFile(join(process.cwd(), 'node_modules/postprocessing/build/postprocessing.esm.js'))
  if (body) {
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'text/javascript' }).end(body)
  } else {
    res.writeHead(404).end(); fails.push('404 ' + file)
  }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
let browser = null
for (const candidate of [{ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' }, { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' }]) {
  try { browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...candidate }); break } catch {}
}
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
const errors = []
const fails = []
page.on('console', m => errors.push(m.type() + ': ' + m.text().slice(0, 150)))
page.on('requestfailed', r => fails.push(r.url().slice(-80)))
page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url().slice(0, 120)))
await page.goto(`http://127.0.0.1:${port}/probe-glow.html`, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/probe-glow-isolated.png', clip: { x: 0, y: 0, width: 640, height: 400 } })
console.log('console:', errors.slice(0, 4)); console.log('served-fails:', fails.slice(0, 6))
await browser.close(); server.close()
process.exit(0)
