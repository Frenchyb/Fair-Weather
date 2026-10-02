import { Sound } from './audio'
import { Input } from './input'
import { GardenScene } from './render/scene'
import { Garden } from './sim/garden'
import { T } from './tuning'

const canvas = document.getElementById('view') as HTMLCanvasElement
const hint = document.getElementById('hint')!
const count = document.getElementById('count')!
const tip = document.getElementById('tip')!
const done = document.getElementById('done')!

const sound = new Sound()
const toast = document.getElementById('toast')!
let toastTimer = 0
function say(text: string) {
  toast.textContent = text
  toast.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.style.opacity = '0'), 3200)
}

let blooms = 0
const garden = new Garden({
  onBloom: (p) => {
    sound.bloom()
    blooms++
    const name = T.kinds[p.kind].label.toLowerCase()
    say(blooms === 1
      ? `A ${name} is in bloom. Your cloud can hold a little more now. Hold Shift to blow its seed about.`
      : `A ${name} is in bloom, and your cloud has grown.`)
  },
  onFullBloom: () => {
    done.style.opacity = '1'
    window.setTimeout(() => (done.style.opacity = '0'), 9000)
  },
})
const view = new GardenScene(canvas, garden)
const input = new Input(canvas)
input.onFirstPress = () => sound.start()

addEventListener('resize', () => view.resize())
view.resize()

let last = performance.now()
let hintShown = 0
let lastTip = ''

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now

  const target = input.pointer ? view.groundPointAt(input.pointer.x, input.pointer.y) : null
  // Small steps keep the sim the same at any frame rate.
  const steps = Math.ceil(dt / (1 / 60))
  const controls = { target, rain: input.rain, breeze: input.breeze, spread: input.spread }
  for (let i = 0; i < steps; i++) garden.update(dt / steps, controls)
  sound.setRaining(garden.cloud.raining)
  sound.setBreeze(garden.cloud.breezing)
  view.render(garden, dt)

  const wild = garden.wildflowers.length
  count.textContent =
    `${garden.bloomed} of ${garden.plants.length} in bloom` + (wild ? `, ${wild} wildflowers` : '')

  // The instructions step aside once the player has rained for a moment.
  if (garden.cloud.raining) hintShown += dt
  if (hintShown > 6) hint.style.opacity = '0'

  const plant = view.plantNear(garden, target)
  let text = ''
  if (plant) {
    const kind = T.kinds[plant.kind]
    const feeling = {
      thirsty: 'It is thirsty.',
      soggy: 'Its roots are too wet.',
      'wants-sun': 'It wants more sun.',
      'wants-shade': 'It wants some shade.',
    }
    const mood = plant.growth >= 1 ? 'In full bloom.' : plant.need ? feeling[plant.need] : 'It is happy.'
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
Object.assign(window, { fairWeather: { garden, view } })
