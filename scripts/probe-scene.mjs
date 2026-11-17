/**
 * Debug probe: opens a deep link and dumps the camera plus the live scene
 * graph (three objects are exposed on window.__aetherScene by SceneReady).
 * Usage: node scripts/probe-scene.mjs "/?view=belt&t=100&dpr=1"
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
  try { browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...candidate }); break } catch {}
}
const url = process.argv[2]
const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load' })
await page.waitForSelector('.is-ready', { timeout: 30000 })
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const scene = window.__aetherScene
  if (!scene) return 'no scene handle'
  const camera = window.__aetherCamera
  const camInfo = camera
    ? { pos: [camera.position.x, camera.position.y, camera.position.z].map((v) => +v.toFixed(1)), far: camera.far, near: camera.near }
    : 'no camera'
  const meshes = []
  scene.traverse((obj) => {
    if (obj.isMesh || obj.isPoints || obj.isInstancedMesh) {
      meshes.push({
        kind: obj.isInstancedMesh ? 'instanced' : obj.isPoints ? 'points' : 'mesh',
        visible: obj.visible,
        order: obj.renderOrder,
        uInner: obj.material?.uniforms?.uInner?.value,
        uOuter: obj.material?.uniforms?.uOuter?.value,
      })
    }
  })
  return { camInfo, meshes }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
server.close()
process.exit(0)
