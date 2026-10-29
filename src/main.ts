import { Sound } from './audio'
import { Input, SEASON_KEYS, WEATHER_KEYS } from './input'
import { SEASONS, WEATHERS, type Season, type WeatherKind } from './sim/climate'
import { GardenScene } from './render/scene'
import { HEIGHT as PLANT_TOP } from './render/plants'
import { Garden, type StrikeRefusal } from './sim/garden'
import { WISHES } from './sim/journal'
import { dayProgress } from './sim/sky'
import { T } from './tuning'

const canvas = document.getElementById('view') as HTMLCanvasElement
const hint = document.getElementById('hint')!
const count = document.getElementById('count')!
const tip = document.getElementById('tip')!
const done = document.getElementById('done')!
const toast = document.getElementById('toast')!
const journal = document.getElementById('journal')!
const wishList = document.getElementById('wishes')!
const journalHead = document.getElementById('journal-head')!
const gauges = document.getElementById('gauges')!
const el = (id: string) => document.getElementById(id)!
const [when, lawnBar, lawnPc, bloomsEl, waterBar, waterPc, stormBar, stormPc, stormNote] = [
  'when', 'lawn-bar', 'lawn-pc', 'blooms', 'water-bar', 'water-pc', 'storm-bar', 'storm-pc', 'storm-note',
].map(el)
const pc = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`
const weatherRow = document.getElementById('weather-row')!
const seasonRow = document.getElementById('season-row')!

let toastTimer = 0
function say(text: string) {
  toast.textContent = text
  toast.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.style.opacity = '0'), 4000)
}

// The journal: things to try, ticked off as they happen.
const items = new Map<string, HTMLLIElement>()
for (const w of WISHES) {
  const li = document.createElement('li')
  li.textContent = w.text
  wishList.appendChild(li)
  items.set(w.id, li)
}
function toggleJournal() {
  journal.classList.toggle('closed')
}
journalHead.addEventListener('click', toggleJournal)
// It starts folded away; a new entry ticked off opens it for a moment.
journal.classList.add('closed')
let journalTimer = 0

const REFUSED: Record<StrikeRefusal, string> = {
  'too-little-water': 'Lightning needs a fuller cloud. Rest it over the pond first.',
  'too-spread': 'Gather the cloud in tight first: press Z.',
  'too-soon': 'The lightning is still building after the last strike. Try again in a moment.',
}

const sound = new Sound()
let blooms = 0
const garden = new Garden({
  onBloom: (p) => {
    sound.bloom()
    blooms++
    const name = T.kinds[p.kind].label
    say(
      blooms === 1
        ? `The first ${name.toLowerCase()} is in bloom, and your cloud can hold a little more.`
        : `${name} in bloom.`,
    )
  },
  onFullBloom: () => {
    done.style.opacity = '1'
    window.setTimeout(() => (done.style.opacity = '0'), 9000)
  },
  onWish: (id) => {
    const li = items.get(id)
    li?.classList.add('done')
    if (li) say(`Journal: ${li.textContent}`)
    if (journal.classList.contains('closed')) {
      journal.classList.remove('closed')
      clearTimeout(journalTimer)
      journalTimer = window.setTimeout(() => journal.classList.add('closed'), 6000)
    }
    sound.bloom()
  },
  onStrike: () => sound.thunder(),
  onSound: (s) => sound.play(s),
  onStrikeRefused: (why) => REFUSED[why] && say(REFUSED[why]),
  onRainbow: () => say('A rainbow. The butterflies are coming out.'),
  onStormReady: () => say('A storm has gathered. Press G to let it go wherever your cloud is.'),
  onStorm: () => {
    say('Here it comes. Steer it round the garden.')
    sound.thunder()
  },
  onStormRefused: () => say('The storm is still gathering. Green more of the lawn, or bring something into bloom.'),
  onStormEnd: () => say('The storm has passed, and the cloud is full again.'),
})
// Phones (and ?lite) draw at one pixel per CSS pixel, without ambient occlusion or bloom.
const phone = matchMedia('(pointer: coarse)').matches
const view = new GardenScene(canvas, garden, phone || new URLSearchParams(location.search).has('lite'))
const input = new Input(canvas)
// A phone can drop the GPU context when the page is backgrounded; start afresh rather than show a black frame.
canvas.addEventListener('webglcontextlost', () => location.reload())
input.onFirstPress = () => sound.start()
input.onToggleJournal = toggleJournal

// The performance overlay (P): frames a second, draw calls and triangles, against the budget.
const perf = document.getElementById('perf')!
let perfOn = new URLSearchParams(location.search).has('perf')
let perfFrames = 0
let perfClock = 0
input.onTogglePerf = () => {
  perfOn = !perfOn
  perf.style.display = perfOn ? 'block' : 'none'
}
if (perfOn) perf.style.display = 'block'
// Phones have no P key: tapping the count card toggles the overlay too.
count.style.pointerEvents = 'auto'
count.addEventListener('click', () => input.onTogglePerf?.())
// Debug views (V) show the overlay too, with numbers read off the picture: how
// bright it is on average, and how much of it is near black or blown out.
input.onDebugView = () => {
  const V = GardenScene.VIEWS
  view.view = V[(V.indexOf(view.view) + 1) % V.length]
  perfOn = view.view !== 'normal' || perfOn
  perf.style.display = perfOn ? 'block' : 'none'
}
const probe = document.createElement('canvas')
probe.width = 64
probe.height = 40
function pictureStats() {
  const g = probe.getContext('2d', { willReadFrequently: true })!
  g.drawImage(canvas, 0, 0, probe.width, probe.height)
  const px = g.getImageData(0, 0, probe.width, probe.height).data
  let sum = 0
  let dark = 0
  let bright = 0
  const n = px.length / 4
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255
    sum += l
    if (l < 0.06) dark++
    if (l > 0.95) bright++
  }
  return { mean: sum / n, dark: dark / n, bright: bright / n }
}
function showPerf(wall: number) {
  perfFrames++
  perfClock += wall
  if (!perfOn || perfClock < 0.5) return
  const fps = perfFrames / perfClock
  perfFrames = perfClock = 0
  const info = view.renderer.info.render
  const b = T.perf
  const row = (label: string, v: number, ok: boolean) => `<span class="${ok ? '' : 'over'}">${label} ${v.toLocaleString('en')}</span>`
  perf.innerHTML = [
    row('fps', Math.round(fps), fps >= b.fps),
    row('draw calls', info.calls, info.calls <= b.drawCalls),
    row('triangles', info.triangles, info.triangles <= b.triangles),
    `<span>pixel ratio ${view.renderer.getPixelRatio()}</span>`,
    ...(view.view === 'normal'
      ? []
      : (() => {
          const st = pictureStats()
          const pc = (v: number) => `${Math.round(v * 100)}%`
          return [`<span>view ${view.view} (V)</span>`, `<span>mean light ${pc(st.mean)}</span>`, `<span>near black ${pc(st.dark)}, blown ${pc(st.bright)}</span>`]
        })()),
  ].join('<br>')
}

// The weather and season buttons, bottom right. Auto lets the climate decide.
const NAMES: Record<string, string> = {
  auto: 'Auto',
  clear: 'Clear',
  overcast: 'Overcast',
  rain: 'Rain',
  fog: 'Fog',
  snow: 'Snow',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
}
const keyFor = (map: Record<string, string>, v: string) => Object.keys(map).find((k) => map[k] === v)?.replace('Digit', '')
const skyPanel = document.getElementById('sky')!
const short = matchMedia('(max-height: 500px)')
canvas.addEventListener('pointerdown', () => skyPanel.classList.remove('open'))
const weatherButtons = new Map<string, HTMLButtonElement>()
const seasonButtons = new Map<string, HTMLButtonElement>()
function button(row: HTMLElement, map: Map<string, HTMLButtonElement>, value: string, key: string | undefined, pick: () => void) {
  const b = document.createElement('button')
  b.innerHTML = NAMES[value] + (key ? `<kbd>${key}</kbd>` : '')
  b.addEventListener('click', () => {
    // On a short (phone) screen the panel sits folded to today's weather and season; a tap unfolds it.
    if (short.matches && !skyPanel.classList.contains('open')) {
      skyPanel.classList.add('open')
      return
    }
    pick()
    input.press()
    skyPanel.classList.remove('open')
  })
  row.appendChild(b)
  map.set(value, b)
}
for (const w of ['auto', ...WEATHERS] as (WeatherKind | 'auto')[]) {
  button(weatherRow, weatherButtons, w, keyFor(WEATHER_KEYS, w), () => (input.weatherAsked = w))
}
for (const se of ['auto', ...SEASONS] as (Season | 'auto')[]) {
  button(seasonRow, seasonButtons, se, keyFor(SEASON_KEYS, se), () => (input.seasonAsked = se))
}
function showSky() {
  const cl = garden.climate
  for (const [w, b] of weatherButtons) {
    b.classList.toggle('on', w === 'auto' ? !cl.weatherPinned : cl.weatherPinned && cl.weather === w)
    b.classList.toggle('now', w === cl.weather)
  }
  for (const [se, b] of seasonButtons) {
    b.classList.toggle('on', se === 'auto' ? !cl.seasonPinned : cl.seasonPinned && cl.season === se)
    b.classList.toggle('now', se === cl.season)
  }
}

const WEATHER_SAY: Record<WeatherKind, string> = {
  clear: 'The sky is clearing.',
  overcast: 'It is clouding over.',
  rain: 'A rainy day is setting in. Everything gets a drink.',
  fog: 'Fog is rolling in.',
  snow: 'It is starting to snow.',
}
const SEASON_SAY: Record<Season, string> = {
  spring: 'Spring. Everything is waking up.',
  summer: 'Summer. Long warm days; the soil dries faster.',
  autumn: 'Autumn. The leaves are turning, and the geese are on the move.',
  winter: 'Winter. The garden rests: nothing grows, nothing needs you. Snow, if it comes, will settle.',
}
let shownWeather = garden.climate.weather
let shownSeason = garden.climate.season

addEventListener('resize', () => view.resize())
view.resize()

let last = performance.now()
let hintShown = 0
let hintClock = 0
let lastTip = ''

const FEELING = {
  thirsty: 'It is thirsty.',
  soggy: 'Its roots are too wet.',
  'wants-sun': 'It wants more sun.',
  'wants-shade': 'It wants some shade.',
}

function frame(now: number) {
  const wall = (now - last) / 1000
  const dt = Math.min(0.1, wall)
  last = now

  const pan = input.panDirection(canvas.getBoundingClientRect())
  if (pan.x || pan.z) view.pan(pan.x * T.camera.panSpeed * dt, pan.z * T.camera.panSpeed * dt)
  if (input.turn) view.turn(input.turn * T.camera.turnSpeed * dt)
  const zoom = input.takeZoom()
  if (zoom !== 1) view.zoomBy(zoom)

  const target = input.pointer ? view.groundPointAt(input.pointer.x, input.pointer.y) : null
  // Small steps keep the sim the same at any frame rate.
  const steps = Math.ceil(dt / (1 / 60))
  const strike = input.takeStrike()
  const storm = input.takeStorm()
  const weather = input.weatherAsked ?? undefined
  const season = input.seasonAsked ?? undefined
  input.weatherAsked = input.seasonAsked = null
  for (let i = 0; i < steps; i++) {
    garden.update(dt / steps, {
      target,
      rain: input.rain,
      breeze: input.breeze,
      fog: input.fog,
      spread: input.spread,
      strike: strike && i === 0,
      storm: storm && i === 0,
      weather: i === 0 ? weather : undefined,
      season: i === 0 ? season : undefined,
    })
  }
  if (input.fog && !garden.cloud.fogging) input.fog = false
  const cl = garden.climate
  const showering = (garden.cloud.raining && !cl.dormant) || garden.storming
  const c = garden.cloud
  const showerNear = (x: number, z: number, r: number) => c.raining && !cl.dormant && Math.hypot(c.x - x, c.z - z) < garden.radius + r
  const storming = garden.storming ? 1 : 0
  const sky = cl.rainfall * 0.85
  sound.setRaining(
    Math.max(showering ? 1 : 0, sky),
    Math.max(storming, sky, showerNear(-12, -9, 5) ? 0.8 : 0),
    Math.max(storming, sky, showerNear(T.pond.x, T.pond.z, T.pond.radius) ? 1 : 0),
  )
  const mix = cl.mix
  sound.setBreeze(garden.cloud.breezing, Math.max(storming, mix.rain * 0.35 + mix.overcast * 0.2 + mix.snow * 0.25))
  view.render(garden, dt, wall)
  showPerf(wall)
  const h = garden.habitat
  // Crickets on a warm, dry night.
  const warm = cl.look.summer + cl.look.spring * 0.5
  const crickets = (1 - garden.daylight) * warm * (1 - cl.rainfall) * (cl.dormant ? 0 : 1)
  const singing = h.birds.mode === 'nest' ? 0 : h.birds.mode === 'quiet' ? h.birds.adults * 0.2 : h.birds.adults
  const croaking = h.frogs.mode === 'chorus' ? h.frogs.adults * 1.5 : h.frogs.mode === 'croak' ? h.frogs.adults : 0
  const p = dayProgress(garden.time)
  const dawn = garden.daylight > 0.02 && p < 0.16 && !cl.dormant ? 1 : 0
  sound.ambience(dt, singing, croaking, crickets, dawn)
  sound.setBees(h.bees.mode === 'busy' ? Math.min(1, garden.bloomed / 4) : 0)
  for (const e of view.wildlife.events.splice(0)) sound.play(e)
  // Sheets snapping on the line in a breeze.
  const out = garden.people.wash.items.some((it) => it.out)
  if (out && (c.breezing || garden.storming) && Math.random() < dt * 0.6) sound.play('snap')
  if (cl.season !== shownSeason) {
    shownSeason = cl.season
    say(SEASON_SAY[cl.season])
  } else if (cl.weather !== shownWeather) {
    say(WEATHER_SAY[cl.weather])
  }
  shownWeather = cl.weather
  showSky()

  // Every number on screen has its label, and the storm says what to do next.
  const st = garden.storm
  const ready = !garden.storming && st.charge >= 1
  gauges.classList.toggle('on', garden.storming)
  gauges.classList.toggle('ready', ready)
  waterBar.style.width = waterPc.textContent = pc(c.water / c.capacity)
  stormBar.style.width = stormPc.textContent = pc(garden.storming ? 1 : st.charge)
  stormNote.textContent = garden.storming
    ? 'Storm! Steer it round with the cloud.'
    : ready
      ? 'Storm ready: press G to let it go.'
      : c.water / c.capacity < 0.3
        ? 'Cloud running low: rest it over the pond to refill.'
        : 'Hold to rain. The storm charges as the lawn greens and plants bloom; press G to let it go when full.'

  const wild = garden.wildflowers.length
  const night = garden.daylight < 0.5 ? 'night' : 'day'
  when.textContent = `${NAMES[cl.season]}, ${night}`
  lawnBar.style.width = lawnPc.textContent = pc(garden.ground.greenShare)
  bloomsEl.textContent = `${garden.bloomed} of ${garden.plants.length}` + (wild ? `, ${wild} wildflowers` : '')

  // The instructions step aside once the player has rained a little, or after a short while.
  if (garden.cloud.raining) hintShown += dt
  hintClock += wall
  if (hintShown > T.hud.hintAfterRain || hintClock > T.hud.hintFor) hint.style.opacity = '0'

  // While it rains, the plant named is the one under the cloud, and the card sits over it.
  const plant = view.plantNear(garden, c.raining ? { x: c.x, z: c.z } : target)
  let text = ''
  if (plant) {
    const kind = T.kinds[plant.kind]
    let mood = plant.need ? FEELING[plant.need] : 'It is happy.'
    if (plant.growth >= 1) mood = 'In full bloom.'
    if (c.raining && Math.hypot(plant.x - c.x, plant.z - c.z) < garden.radius) mood = plant.need === 'soggy' ? 'It has had plenty: move on.' : 'Drinking it in.'
    else if (kind.pollen && plant.growth >= T.stages.flowering && !plant.pollinating) {
      mood = 'In blossom: give it a breeze.'
    } else if (plant.rich > 0) mood += ' The soil is rich from the lightning.'
    text = `${kind.label} likes ${kind.likes}. ${mood}`
  }
  if (text !== lastTip) {
    if (text) tip.textContent = text
    tip.style.opacity = text ? '1' : '0'
    lastTip = text
  }
  if (plant) {
    const at = view.screenOf(plant.x, (plant.inBed ? T.bed.height : 0) + PLANT_TOP[plant.kind] * Math.max(0.3, plant.growth), plant.z)
    const r = tip.getBoundingClientRect()
    const x = Math.min(innerWidth - r.width / 2 - 12, Math.max(r.width / 2 + 12, at.x))
    tip.style.left = `${x}px`
    tip.style.top = `${Math.max(r.height + 12, at.y - 14)}px`
  }

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Handle for the console and for automated browser checks.
Object.assign(window, { fairWeather: { garden, view, input } })
