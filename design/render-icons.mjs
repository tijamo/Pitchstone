/**
 * Renders the icon PNGs from the SVG masters.
 *
 *   npm i playwright --no-save && node design/render-icons.mjs
 *
 * Playwright is deliberately not a dependency — it is a tool, not part of the
 * app, the same way the `verify` skill treats it. Chromium is pre-installed at
 * the path below and its version may not match Playwright's bundled one, so
 * executablePath is always passed explicitly and `playwright install` is never
 * run.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/** [source svg, output png, pixel size] */
const JOBS = [
  ['public/icon.svg', 'public/icon-192.png', 192],
  ['public/icon.svg', 'public/icon-512.png', 512],
  ['public/icon.svg', 'public/apple-touch-icon.png', 180],
  ['design/icon-maskable.svg', 'public/icon-maskable-512.png', 512],
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

for (const [src, out, size] of JOBS) {
  const svg = readFileSync(resolve(root, src), 'utf-8')
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })
  // The SVG is laid out at exactly the viewport size with nothing else on the
  // page, so the screenshot is the icon and nothing but the icon.
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}
     </style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  )
  await page.screenshot({
    path: resolve(root, out),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
  console.log(`${out}  ${size}x${size}`)
}

await browser.close()
