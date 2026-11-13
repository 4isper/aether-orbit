/**
 * Headless shader smoke test: builds nothing, serves ./dist, opens every
 * view of the scene in a software-WebGL Chromium and fails if the console
 * records any error - which is how GLSL compile/link failures surface.
 * CI runs this after the build; locally it skips with a notice when no
 * Chromium-family browser is installed.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
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
const VIEWS = ['star', 'aurelia', 'cinder', 'vesper', 'belt', 'comet', 'erebus', 'moon', 'system']
const VIEW_SETTLE_MS = 4000

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

// CI runners ship Google Chrome; local machines may have Edge, Brave or a
// Playwright-managed Chromium instead. Software WebGL needs the SwiftShader
// opt-in flag on current builds.
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
  console.log('smoke skipped: no Chromium-family browser available')
  server.close()
  process.exit(0)
}

const page = await browser.newPage()
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(String(error)))

let webglOk = true
page.once('close', () => {})
await page.goto(`http://127.0.0.1:${port}/?view=star`)
webglOk = await page.evaluate(() => {
  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
})
if (!webglOk) {
  console.error('smoke failed: WebGL is not available in the headless browser')
  await browser.close()
  server.close()
  process.exit(1)
}

for (const view of VIEWS) {
  process.stdout.write(`smoke: view ${view} ... `)
  await page.goto(`http://127.0.0.1:${port}/?view=${view}`)
  // The nav buttons enable once the scene reports ready, which only happens
  // after the first frames of that view have actually rendered. The nav is
  // the one readiness signal present in every view, system overview included.
  // SwiftShader's first context creation is slow, so this needs headroom.
  await page.waitForFunction(() => {
    const button = document.querySelector('nav button')
    return Boolean(button && !button.disabled)
  }, { timeout: 60000 })
  await page.waitForTimeout(VIEW_SETTLE_MS)
  process.stdout.write('ready\n')
}

await browser.close()
server.close()

if (errors.length > 0) {
  console.error(`smoke failed: ${errors.length} console error(s)`)
  for (const error of errors) console.error(`  ${error.slice(0, 500)}`)
  process.exit(1)
}
console.log(`smoke ok: ${VIEWS.length} views rendered, console clean`)
