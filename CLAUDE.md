# Fair Weather — notes for Claude

A cozy garden game: you are the weather over a raised bed. Browser, TypeScript,
three.js, Vite, vitest. Concept and plan: `/mnt/project-files/weather-game/concept-and-plan.md`
(in the Game Design project). This code started in `frenchyb/ac130_game/fair-weather/`.

## Rules for changing this code

1. **`src/sim/` never imports three.js.** Growth and weather are pure maths with tests.
2. **Numbers live in `src/tuning.ts`.**
3. **`src/render/` reads the garden and never writes to it.**
4. Run `npm test` and `npm run build` before claiming anything works.
5. **Peaceful first.** Nothing dies, no timer, no score. Plants that are unhappy
   pause and droop; growth never goes backwards. A test enforces it.

## Gotchas

- The cloud's shade is painted by `render/shade.ts` from the same radius and soft
  edge the sim uses for light, not by a shadow map, so what you see is exactly
  what the plants feel. The cloud itself casts no shadow.
- One cloud should water one plant. Plants sit 1.1 m apart; with a 0.9 m radius
  and 0.5 m soft edge a neighbour gets almost nothing. A test covers this.
- The pointer is projected onto the bed's top (`y = T.bed.height`) using the
  canvas's own `getBoundingClientRect()`. Check in Playwright at
  `deviceScaleFactor: 2`; the AC-130 game lost three rounds to a Retina bug.
- Headless Chromium here renders a frame or two a second, so browser checks
  wait on `garden.time`, not wall time. `window.fairWeather` exposes the garden.
- `tools/bundle-artifact.mjs` builds the published single page from `index.html`
  and refuses non-ASCII. Plant icons are drawn on canvas for that reason.
- The test gardener in `test/garden.test.ts` is a crude bot; if it can reach full
  bloom under 300 s, a person can. Re-run it after turning any growth dial.
