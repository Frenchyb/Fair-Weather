#!/usr/bin/env node
/**
 * Every model that goes into the game passes through here first:
 *
 *   npm run shrink -- path/to/model.glb [more.glb ...]
 *
 * writes `src/assets/<name>.glb`, simplified towards `T`-style budgets below,
 * with meshopt-compressed geometry and textures capped at 1k WebP. The world's
 * GLTFLoader carries the meshopt decoder, so the output loads as is.
 * Prints the size before and after, and the triangle count.
 */
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'

// Keep at most this share of vertices, and never move a surface by more than this share of the model's size.
const RATIO = 0.5
const ERROR = 0.002
const TEXTURE = 1024

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: npm run shrink -- model.glb [more.glb ...]')
  process.exit(1)
}
const cli = join('node_modules', '.bin', 'gltf-transform')
for (const file of files) {
  const out = join('src', 'assets', basename(file).replace(/\.(glb|gltf)$/i, '.glb'))
  execFileSync(cli, [
    'optimize', file, out,
    '--simplify',
    '--simplify-ratio', String(RATIO),
    '--simplify-error', String(ERROR),
    '--texture-compress', 'webp',
    '--texture-size', String(TEXTURE),
    '--compress', 'meshopt',
  ], { stdio: 'inherit' })
  const info = execFileSync(cli, ['inspect', out, '--format', 'csv'], { encoding: 'utf8' })
  const tris = [...info.matchAll(/,TRIANGLES,\d+,(\d+),/g)].reduce((n, m) => n + Number(m[1]), 0)
  const kb = (f) => (statSync(f).size / 1024).toFixed(1)
  console.log(`${file}: ${kb(file)} KB -> ${out}: ${kb(out)} KB${tris ? `, ${tris} triangles` : ''}`)
}
