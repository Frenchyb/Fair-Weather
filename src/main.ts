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
const garden = new Garden({
  onBloom: () => sound.bloom(),
  onFullBloom: () => (done.style.opacity = '1'),
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
  for (let i = 0; i < steps; i++) garden.update(dt / steps, { target, rain: input.rain })
  sound.setRaining(garden.cloud.raining)
  view.render(garden, dt)

  count.textContent = `${garden.bloomed} of ${garden.plants.length} in bloom`

  // The instructions step aside once the player has rained for a moment.
  if (garden.cloud.raining) hintShown += dt
  if (hintShown > 2) hint.style.opacity = '0'

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
