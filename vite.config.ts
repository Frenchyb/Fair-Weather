import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths so the built bundle runs from any directory.
  base: './',
  // The published game is one HTML file, so textures and the sky go inline too.
  build: { target: 'es2022', assetsInlineLimit: 8 * 1024 * 1024 },
  assetsInclude: ['**/*.hdr', '**/*.glb'],
})
