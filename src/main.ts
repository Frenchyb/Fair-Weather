import { Sound } from './audio'
import { Input } from './input'
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
if (window.innerWidth < 700) journal.classList.add('closed')

const REFUSED: Record<StrikeRefusal, string> = {
  'too-little-water': 'Lightning needs a fuller cloud. Rest it over the pond first.',
  'too-spread': 'Gather the cloud in tight first: scroll down, or press Q.',
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
const view = new GardenScene(canvas, garden)
const input = new Input(canvas)
input.onFirstPress = () => sound.start()
input.onToggleJournal = toggleJournal

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
  const dt = Math.min(0.1, (now - last) / 1000)
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
  for (let i = 0; i < steps; i++) {
    garden.update(dt / steps, {
      target,
      rain: input.rain,
      breeze: input.breeze,
      fog: input.fog,
      spread: input.spread,
      strike: strike && i === 0,
      storm: storm && i === 0,
    })
  }
  if (input.fog && !garden.cloud.fogging) input.fog = false
  sound.setRaining(garden.cloud.raining || garden.storming)
  sound.setBreeze(garden.cloud.breezing)
  view.render(garden, dt)

  const st = garden.storm
  stormBadge.className = garden.storming ? 'on' : st.charge >= 1 ? 'ready' : ''
  stormBadge.style.setProperty('--charge', String(garden.storming ? 1 : st.charge))
  stormBadge.textContent = garden.storming ? 'Storm' : st.charge >= 1 ? 'Storm ready: G' : 'Storm gathering'

  const wild = garden.wildflowers.length
  const night = garden.daylight < 0.5 ? 'Night. ' : ''
  count.textContent =
    `${night}${garden.bloomed} of ${garden.plants.length} in bloom, lawn ${Math.round(garden.ground.greenShare * 100)}% green` +
    (wild ? `, ${wild} wildflowers` : '')

  // The instructions step aside once the player has rained for a while.
  if (garden.cloud.raining) hintShown += dt
  if (hintShown > 6) hint.style.opacity = '0'

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
