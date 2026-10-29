// Usage: node tools/sheet.mjs <out.png>  (bundles tools/sheet.ts and screenshots it)
import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
const out = process.argv[2] ?? 'sheet.png'
const dir = mkdtempSync(join(tmpdir(), 'sheet-'))
execSync(`npx esbuild tools/sheet.ts --bundle --format=iife --outfile=${dir}/sheet.js --loader:.glsl=text --loader:.jpg=dataurl --loader:.png=dataurl --loader:.glb=file --loader:.ktx2=file --loader:.hdr=file`, { stdio: 'inherit' })
// Inline the bundle: a file:// page cannot load scripts from beside it.
writeFileSync(join(dir, 'index.html'), '<!doctype html><body><script>' + readFileSync(join(dir, 'sheet.js'), 'utf8').replaceAll('</script', '<\\/script') + '</script></body>')
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 600 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto('file://' + join(dir, 'index.html'))
await page.waitForFunction(() => window.done, null, { timeout: 30000 }).catch((e) => errors.push(String(e).slice(0, 200)))
await page.screenshot({ path: out })
await browser.close()
if (errors.length) console.error(errors.join('\n'))
console.log(out)
