#!/usr/bin/env node
/**
 * Screenshots at fixed camera marks, for the before/after every visual round ends with.
 *
 *   node tools/shot.mjs <page url> <out dir> [width height dpr] [marks]
 *
 * Desktop: 1280 800 2.  Phone held sideways: 844 390 3.  Marks default to all of
 * MARKS below, comma-separated to pick. Add `?lite` to the URL on a machine
 * without a GPU (headless here manages about a frame a second without it).
 * Every mark starts from the same garden: everything in bloom, a green lawn,
 * late morning, so two rounds' pictures differ only by what the round changed.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const MARKS = {
  overview: { focus: [-2, 1], zoom: 1, time: 72 },
  bed: { focus: [0, -1], zoom: 0.45, time: 72 },
  patio: { focus: [-11, -3], zoom: 0.45, time: 72 },
  pond: { focus: [-6, 4.5], zoom: 0.5, time: 72 },
  orchard: { focus: [11.5, -10], zoom: 0.6, time: 72 },
  oak: { focus: [12, 4], zoom: 1, time: 72 },
  dusk: { focus: [-2, 1], zoom: 1, time: 160 },
  rain: { focus: [-2, 1], zoom: 1, time: 72, key: 'Digit3' },
}

const [url, out, w = '1280', h = '800', dpr = '2', pick] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out dir> [width height dpr] [marks]')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url)
await page.waitForFunction(() => window.fairWeather?.garden.time > 1, null, { timeout: 300000 })
const later = (s) => page.evaluate((s) => window.fairWeather.garden.time + s, s).then((t) =>
  page.waitForFunction((t) => window.fairWeather.garden.time > t, t, { timeout: 600000 }))
for (const name of pick ? pick.split(',') : Object.keys(MARKS)) {
  const m = MARKS[name]
  if (m.key) await page.keyboard.press(m.key)
  await page.evaluate((m) => {
    const { garden, view } = window.fairWeather
    garden.time = m.time
    for (const p of garden.plants) p.growth = 1
    for (let k = 0; k < garden.ground.green.length; k++) garden.ground.green[k] = 0.9
    view.focus.set(m.focus[0], m.focus[1])
    view.zoomBy(m.zoom / view.zoom)
  }, m)
  await later(4)
  const file = join(out, `${name}-${w}x${h}.png`)
  await page.screenshot({ path: file, timeout: 600000 })
  console.log(file)
  if (m.key) await page.keyboard.press('Digit0')
}
if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '))
await browser.close()
