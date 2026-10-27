# Fair Weather: history and the reasons behind the rules

The CLAUDE.md of 2026-10-24, kept whole: the stories behind each rule and
trap. CLAUDE.md now keeps only the traps.

A cozy garden game: you are the weather over a back garden (house, raised bed,
orchard, oak, pond). Browser, TypeScript,
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

- **Weather leaves marks (Rick, 2026-10-02: "lack of lasting effects").** The lawn
  is a grid in `sim/ground.ts`: green (only ever rises, like growth), surface
  water (puddles above `puddleAt`) and how far the grass is laid over. The
  renderer packs it into a small texture each frame (`render/ground.ts`) that
  the lawn, the paving and the grass blades all sample in their shaders
  (`render/shade.ts`). Lightning marks are kept for good and heal into fairy
  rings. New weather should leave something behind too.
- **The cloud floats at `T.cloud.height` (9 m), above the oak and the roof,** and is
  drawn `T.cloud.look` times wider than the shower it drops. The pointer still
  marks the ground where the rain lands, not the cloud: the AC-130 game learned
  that effects landing away from the pointer read as a bug. The faint veil from
  the cloud's base to the ground is what joins the two up.
- The storm (G) is charged by greening the lawn and by blooms, waters plants only
  up to what each likes (a gift, never a soaking), and ends with the cloud full.
- Post-processing is n8ao (ambient occlusion) plus bloom. `GardenScene.adapt`
  drops resolution, then AO, if frames run long; headless checks end up at 1x.
- The cloud's shade is painted by `render/shade.ts` from the same radius and soft
  edge the sim uses for light, not by a shadow map, so what you see is exactly
  what the plants feel. The cloud itself casts no shadow.
- At its default spread one cloud waters one plant (plants sit 1.1 m apart). The
  player can spread it wide (X, or Z to gather) to water several gently: rain per area
  falls with the square of the radius, so wide is never a free win. Each bloom
  raises `capacity`, which is what lets it spread wider. Tests cover all of this.
- **Calm over busy (Rick, 2026-10-02):** v1 felt stressful, "bouncing around
  trying to keep all the plants happy". A good soak should last well over a
  minute, and lettuce manages in full sun (shade is a bonus). A test asserts a
  soaked tomato is still content after 75 s. Don't tighten these without asking.
- The breeze (Shift or right button) blows the way the cloud is moving. It
  pollinates open flowers (a growth bonus, never required) and carries seed
  from bloomed plants into the lawn, where wildflowers grow by themselves.
  Seed scatter uses the garden's own seeded random, so tests are repeatable.
- Wheel zooms and Q/E turn the view; spread moved to Z/X in round 4.
- The pointer is projected onto the bed's top (`y = T.bed.height`) using the
  canvas's own `getBoundingClientRect()`. Check in Playwright at
  `deviceScaleFactor: 2`; the AC-130 game lost three rounds to a Retina bug.
- Headless Chromium here renders a frame or two a second, so browser checks
  wait on `garden.time`, not wall time. `window.fairWeather` exposes the garden.
- `tools/bundle-artifact.mjs` builds the published single page from `index.html`
  and refuses non-ASCII. Plant icons are drawn on canvas for that reason.
- **Night must not read as shade.** Plants only update their remembered light
  while it is day, and ask for nothing while asleep; otherwise every plant
  would cry "wants sun" at dusk. Moonflowers are the reverse.
- The oak's shade in the sim is `shadowOf(oak, crownHeight, time)` from
  `sim/sky.ts`, the same sun the renderer lights with, so the shadow you see
  under the oak is the shade the ferns get. If you move the sun, move it there.
- Over the bed the pointer is projected onto the bed's top; elsewhere onto the
  lawn (`GardenScene.groundPointAt`). Panning moves the camera's `focus`, never
  the cloud: the cloud only ever follows the ground point under the pointer.
- The journal (`sim/journal.ts`) doubles as the instructions: each entry says
  how to do the thing. New mechanics should arrive with an entry.
- `pkill -f "vite preview"` from a shell whose own command line contains that
  text kills the shell. Start previews on a fresh port instead.
- The test gardener in `test/garden.test.ts` is a crude bot; if it can reach full
  bloom under 300 s, a person can. Re-run it after turning any growth dial.
- **A living world (Rick, 2026-10-03: "not me just guiding one individual
  cloud around").** `sim/climate.ts` holds the day's weather (clear, overcast,
  rain, fog, snow) and the season. Both change on their own and can be pinned
  from the HUD (keys 0-9). Changes ease through `mix` and `look`, never snap;
  render reads those blends. Drifting `climate.clouds` shade the sim only on a
  clear day, and `render/drift.ts` paints the same shade (`uSkyClouds`).
- Winter rests the garden: `climate.growth` is 0 and nobody asks for anything,
  so growth still never goes backwards. The player's cloud snows instead of
  raining. Snow and fallen leaves live on the ground grid and reach shaders as a
  second texture, `uCover` (R snow, G leaves). Everything takes snow on its
  upward faces; `foliage` turns in autumn and goes bare (discard) in winter.
- Tests build gardens with `{ still: true }` (clear summer, no drifting clouds)
  so each sees only what it sets up. Climate tests use their own seeded random.
- **Rose and Walter (Rick, 2026-10-03)** live in `sim/people.ts`: a task queue
  each, re-planned from the weather when it empties, dropped when the weather
  turns (rain on the washing, storm, downpour, night). Rose does the washing on
  `T.wash`'s line and rescues it when rain starts; a sheet she can't reach in
  `rescueFor` seconds stays out dripping. Walk routes go through `detour()` so
  nobody crosses the bed or the pond; a test checks it. They emit sounds through
  `Hooks.onSound`; `render/people.ts` only poses them by `doing` and `carry`.
- **Animals live here (Rick, 2026-10-03).** `sim/habitat.ts` holds each
  species' count, mode and young; nothing ever leaves for good, they only hide.
  Young come once a year (`habitat.year` turns winter to spring). The renderer
  (`render/wildlife.ts`, builders in `render/critters.ts`) decides positions.
  Footprints in snow are `render/tracks.ts`. The shared `leg` geometry hangs
  down from its origin and `cone` points along +z; props want `rod`/`peak`.
- Sound effects only, no music: Rick's call. Every new creature or chore gets a
  `Sound.play(name)` case.
- `sim/wildlife.ts` says how many of each visitor are about; `render/wildlife.ts`
  decides where they wander and keeps shy ones out of the player's rain.
  Critters are drawn larger than life (`T.render.critterSize`) because a
  life-size robin is a speck from the usual height.
- Grey days lower `toneMappingExposure`; the sky above is rarely in view from
  the usual pitch, so dull weather has to read from the light on the ground.
- The final colour grade (`render/grade.ts`) runs **after** `OutputPass`, in
  display space, and blends a grade per weather, dusk, night and storm from
  `T.look.grades`. Tone mapping is AgX; the grade puts back the colour AgX takes out.
- Grass blades are double-sided with normals pointing up. three.js flips the
  normal on a back face, which turned every blade seen from behind black; the
  grass shader undoes that flip. Keep it, or the lawn goes back to black streaks.
- Plants are built from leaf, petal and frond outlines in `render/leaves.ts`,
  welded into one mesh per plant (`Bundle`), with flowers and fruit separate so
  they can open and ripen. Anything added to a plant's foliage needs a vertex
  colour (`painted`), or it renders black under the vertex-coloured material.
- Photographed wood, roof, plaster and bark are laid on in metres by
  `metricUV`, so their repeat in `T.look.tile` is metres per tile. Boxes from
  `box()` get it automatically.

## Dead ends

Things tried and dropped, so nobody tries them again.

- **Pointer lock for the cloud** (inherited from the AC-130 game's lesson): effects
  landing away from the pointer read as a bug. The cloud follows the ground point
  under the pointer instead.
- **Cloned materials in the static weld** stopped runtime tint changes reaching
  the screen; the weld now reuses a material every piece shares.
- **Baking a kept material's colour into vertex colours** applied the tint twice
  and turned the boxwood balls near-black (2026-10-24). Bake the tint only when
  the material is cloned.
- **Tree crowns as a few smooth lumps** read as "blobs on sticks" (fresh-eyes
  review). Crowns are leaf sprays now; a solid core is kept only inside, darker.
- **One uniform downwind lean on the grass** read as combed fur. Lean now turns
  by patch, and only a gust band lays the grass right over.
- **Star-shaped leaf sprays** (5-7 leaves evenly round a point) read as maple
  leaves on the apple trees. Sprays are 3-5 leaves at uneven angles.
- **A screenshot mark with the camera inside the oak** (orchard mark at focus
  11, -4): the crown filled the frame. The oak now fades when the camera is in it.
- **A shader varying assigned before it was declared** made the grass vanish
  with no page error, only a console one. `tools/shot.mjs` now reports console
  errors.
- **AgX tone mapping** took colour out that the grade had to put back; switched
  to Neutral (playbook 2.3) for a colourful garden.
- **A 1.4 MB HDR sky** for environment light; the generated sky dome costs nothing
  and matches the sky we draw.
- **Rigged CC0 people for Rose and Walter (2026-10-27).** Quaternius and Poly Pizza
  are blocked from the cloud; OpenGameArt's rigged humans are young, armoured or
  toy-like, and the three.js Mixamo samples are young too. Faces, hands, hair and
  shoulders were built in code instead. A four-view sheet from Rick is the way to
  a real model.
- **A cylinder rain veil brightest at its rim** read as a glass tube with hard
  sides; it now fades out at its silhouette, its top and the ground.
- **One soil tile per bed plant** showed moisture as a grid of squares; the bed is
  one soil box now, with a soft round patch per plant.
