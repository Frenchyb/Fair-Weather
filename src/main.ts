import { Sound } from './audio'
import { Input, SEASON_KEYS, WEATHER_KEYS } from './input'
import { SEASONS, WEATHERS, type Season, type WeatherKind } from './sim/climate'
import { GardenScene } from './render/scene'
import { Garden, type StrikeRefusal } from './sim/garden'
import { WISHES } from './sim/journal'
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
const stormBadge = document.getElementById('storm')!
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
  'too-soon': '',
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
const view = new GardenScene(canvas, garden, new URLSearchParams(location.search).has('lite'))
const input = new Input(canvas)
input.onFirstPress = () => sound.start()
input.onToggleJournal = toggleJournal

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
const weatherButtons = new Map<string, HTMLButtonElement>()
const seasonButtons = new Map<string, HTMLButtonElement>()
function button(row: HTMLElement, map: Map<string, HTMLButtonElement>, value: string, key: string | undefined, pick: () => void) {
  const b = document.createElement('button')
  b.innerHTML = NAMES[value] + (key ? `<kbd>${key}</kbd>` : '')
  b.addEventListener('click', () => {
    pick()
    input.press()
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
  sound.setRaining(Math.max(showering ? 1 : 0, cl.rainfall * 0.85))
  sound.setBreeze(garden.cloud.breezing)
  view.render(garden, dt, wall)
  const v = garden.visitors
  // Crickets on a warm, dry night.
  const warm = cl.look.summer + cl.look.spring * 0.5
  const crickets = (1 - garden.daylight) * warm * (1 - cl.rainfall) * (cl.dormant ? 0 : 1)
  sound.ambience(dt, v.birds, v.frogs, crickets)
  for (const e of view.wildlife.events.splice(0)) {
    if (e === 'honk') sound.honk()
    else if (e === 'flutter') sound.flutter()
  }
  if (cl.season !== shownSeason) {
    shownSeason = cl.season
    say(SEASON_SAY[cl.season])
  } else if (cl.weather !== shownWeather) {
    say(WEATHER_SAY[cl.weather])
  }
  shownWeather = cl.weather
  showSky()

  const st = garden.storm
  stormBadge.classList.toggle('on', garden.storming)
  stormBadge.classList.toggle('ready', !garden.storming && st.charge >= 1)
  stormBadge.style.setProperty('--charge', String(garden.storming ? 1 : st.charge))
  stormBadge.textContent = garden.storming ? 'Storm' : st.charge >= 1 ? 'Storm ready: G' : 'Storm gathering'

  const wild = garden.wildflowers.length
  const night = garden.daylight < 0.5 ? 'night' : 'day'
  count.textContent =
    `${NAMES[cl.season]}, ${night}. ${garden.bloomed} of ${garden.plants.length} in bloom, lawn ${Math.round(garden.ground.greenShare * 100)}% green` +
    (wild ? `, ${wild} wildflowers` : '')

  // The instructions step aside once the player has rained for a while.
  if (garden.cloud.raining) hintShown += dt
  if (hintShown > 6 || garden.time > 40) hint.style.opacity = '0'

  const plant = view.plantNear(garden, target)
  let text = ''
  if (plant) {
    const kind = T.kinds[plant.kind]
    let mood = plant.need ? FEELING[plant.need] : 'It is happy.'
    if (plant.growth >= 1) mood = 'In full bloom.'
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

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Handle for the console and for automated browser checks.
Object.assign(window, { fairWeather: { garden, view, input } })
