/**
 * Roll the production build into one self-contained HTML file.
 *
 * The published, no-install version of the game is a single page with the
 * bundle inlined, and it takes its markup and styles from index.html so there
 * is only ever one copy of them. Hand-maintaining a second copy of the HUD
 * markup was going to drift the moment anyone touched it.
 *
 *   node tools/bundle-artifact.mjs [outfile]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'dist/artifact.html'

const assets = readdirSync('dist/assets').filter((f) => f.endsWith('.js'))
if (assets.length !== 1) {
  throw new Error(`expected exactly one bundle in dist/assets, found ${assets.length}`)
}
const js = readFileSync(join('dist/assets', assets[0]), 'utf8')

// The host wraps the page in its own document, so strip our wrapper and keep
// what goes inside it: the title, the styles and the HUD markup.
const html = readFileSync('index.html', 'utf8')
const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>'))
const bodyStart = html.indexOf('>', html.indexOf('<body')) + 1
const body = html
  .slice(bodyStart, html.indexOf('</body>'))
  .replace(/\s*<script\b[^>]*><\/script>/g, '')

// A </script> anywhere in the bundle's own strings would end ours early.
const inlined = js.replace(/<\/script/g, '<\\/script')

const page = `${head.trim()}\n${body.trim()}\n<script type="module">\n${inlined}\n</script>\n`

const exotic = [...page].filter((c) => c.charCodeAt(0) > 127)
if (exotic.length) {
  // Bundlers turn \uXXXX escapes back into raw characters, and a page served
  // without a charset header then renders them as mojibake.
  throw new Error(`page must stay ASCII, found: ${JSON.stringify(exotic.join(''))}`)
}

writeFileSync(out, page)
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`)
