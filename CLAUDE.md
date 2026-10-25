# Fair Weather — notes for Claude

A cozy garden game: you are the weather over a back garden. Browser, TypeScript,
three.js, Vite, vitest. Plan: `/mnt/project-files/weather-game/concept-and-plan.md`.
Look: `/mnt/project-files/fair-weather/art-direction.md`. Procedures:
`/mnt/project-files/playbook/playbook.md`. History and the reasons behind
the rules: `docs/notes.md`.

## Rules

1. **`src/sim/` never imports three.js.** Growth and weather are pure maths with tests.
2. **Numbers live in `src/tuning.ts`.**
3. **`src/render/` reads the garden and never writes to it.**
4. Run `npm test` and `npm run build` before claiming anything works.
5. **Peaceful first.** Nothing dies, no timer, no score; growth never goes
   backwards (a test enforces it). Calm over busy: don't tighten watering or
   drying without asking Rick.
6. Every round ends with `tools/shot.mjs` before/afters (desktop 1280x800 at 2x,
   phone 844x390) and a fresh-eyes review against the art direction.

## Traps

- **Retina:** the pointer is projected using the canvas's own
  `getBoundingClientRect()`; the canvas has explicit CSS size. Check pointer work
  in Playwright at `deviceScaleFactor: 2`.
- **Headless Chromium** manages about a frame a second, and only with `?lite`.
  Wait on `garden.time`, not wall time. `window.fairWeather` exposes the garden.
- `tools/bundle-artifact.mjs` builds the single published page from
  `index.html` and refuses non-ASCII.
- `pkill -f "vite preview"` from a shell whose own command contains that text kills the shell.
- **What you see is what the plants feel:** cloud shade (`render/shade.ts`) and the
  oak's shadow (`shadowOf` in `sim/sky.ts`) come from the sim's own numbers. Move
  the sun in one place and both follow.
- The pointer marks where the rain lands, not the cloud (9 m up). Panning moves
  the camera's `focus`, never the cloud.
- **Night must not read as shade:** plants only update remembered light by day.
- Tests build gardens with `{ still: true }`. The test gardener must reach full
  bloom under 300 s; re-run it after turning any growth dial.
- **Draw calls (press P for the overlay; budget in `T.perf`).** Static scenery
  is welded (`render/batch.ts`): anything that changes at runtime must be named
  in the `keep` list or use a material only it owns, or the change stops
  reaching the screen. Animals and people weld per moving part (`weldParts`);
  repeated flowers, bees and butterflies are instanced.
- **Grass** is the island proof's meadow: one tuft drawn tufts x tufts times,
  each placed in the vertex shader from `gl_InstanceID` on a grid snapped to the
  camera's focus (`meadowUniforms`), kept off bed, pond and paving by a mask
  texture. Blades are double-sided with up normals, and the shader undoes
  three.js's back-face flip (remove it and the lawn gets black streaks).
- **One wind:** `fwGustAt` in `shade.ts` is a gust field travelling downwind
  (`uAir`, `uAirDir`, from the climate). Grass and tree crowns both read it, so a
  gust crosses everything at once. New swaying things should read it too.
- **Tree crowns** are `canopy()` sprays of real leaves over darker lumps, with
  normals bent out from the centre; trunks fork into a bough per lump (`trunk()`).
  The oak is front-faced only and fades when the camera is inside it.
- **Plant foliage** is welded per plant (`Bundle` in `render/leaves.ts`); anything
  added needs a vertex colour (`painted`) or it renders black.
- Photographed surfaces are laid on in metres (`metricUV`); `T.look.tile` is
  metres per tile. Boxes from `box()` get it automatically.
- The colour grade (`render/grade.ts`) runs after `OutputPass`, in display space.
  Tone mapping is Neutral. Grey days lower exposure, because the sky is rarely in view.
  Sky light is generated (`skyLight()`), no HDR file.
- **Debug views (V):** greyscale, clay (light and shadow only) and normals, with
  mean light, near-black and blown-out shares on the overlay. Read the numbers
  before tuning a look by eye.
- **One shadow rule:** everything in the garden, people and animals included, uses
  a `shaded()` material, so the cloud's and drifting clouds' shade darkens it all
  together (`creature` skips snow). A plain material won't darken under the cloud.
- Dead ends are logged at the bottom of `docs/notes.md`; add to it when you drop something.
- Shared geometry: `leg` hangs down from its origin and `cone` points along +z.
- Models go through `npm run shrink` (meshopt); the loader carries the decoder.
- Sound effects only, no music (Rick's call). Every new creature or chore gets a
  `Sound.play(name)` case.
