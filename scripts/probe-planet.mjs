import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'
const DIST = join(process.cwd(), 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const file = req.url.split('?')[0]
  let body = null
  if (file === '/probe-planet.html') body = await readFile(join(process.cwd(), 'scripts', 'probe-planet.html'))
  else if (file === '/three.module.js') body = await readFile(join(process.cwd(), 'node_modules/three/build/three.module.js'))
  else if (file === '/three.core.js') body = await readFile(join(process.cwd(), 'node_modules/three/build/three.core.js'))
  else {
    try { body = await readFile(join(DIST, file)) } catch {}
  }
  if (body) res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : MIME[extname(file)] ?? 'application/octet-stream' }).end(body)
  else res.writeHead(404).end()
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
let browser = null
for (const candidate of [{ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' }, { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' }]) {
  try { browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...candidate }); break } catch {}
}
const [,, name, stage] = process.argv
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await page.goto(`http://127.0.0.1:${port}/probe-planet.html?stage=${stage}`, { waitUntil: 'load' })
const px = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const gl = canvas.getContext('webgl2')
  const r = new Uint8Array(4)
  // render is running on the loop; read via preserveDrawingBuffer-less trick:
  // draw the canvas onto a 2d canvas in the same frame is unreliable, so use
  // the debug renderer info instead — fall back to a screenshot compare.
  return { w: canvas.width, h: canvas.height, hasGL: !!gl }
})
console.log('canvas:', JSON.stringify(px))
await page.screenshot({ path: `/tmp/planet-stage${stage}.png`, clip: { x: 0, y: 0, width: 640, height: 400 } })
console.log('stage', stage, 'errors:', errors.length ? errors.slice(0, 3) : 'clean')
await browser.close(); server.close()
process.exit(0)
