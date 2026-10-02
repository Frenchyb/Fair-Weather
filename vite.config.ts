import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths so the built bundle runs from any directory.
  base: './',
  build: { target: 'es2022' },
})
