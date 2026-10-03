import { describe, expect, it } from 'vitest'
import { Garden as LiveGarden, comfortIn, onBed, stageOf, type Controls, type Hooks, type Plant } from '../src/sim/garden'

/** The garden under a still, clear summer sky, so each test sees only what it sets up. */
class Garden extends LiveGarden {
  constructor(hooks: Hooks = {}) {
    super(hooks, { still: true })
  }
}
import { Climate } from '../src/sim/climate'
import { WISHES } from '../src/sim/journal'
import { dayProgress, daylight, shadowOf } from '../src/sim/sky'
import { T } from '../src/tuning'

const DT = 1 / 30
const CYCLE = T.day.length + T.day.night

function run(g: Garden, seconds: number, controls: Controls | ((g: Garden) => Controls)) {
  for (let t = 0; t < seconds; t += DT) {
    g.update(DT, typeof controls === 'function' ? controls(g) : controls)
  }
}

function parkOver(g: Garden, x: number, z: number) {
  g.cloud.x = x
  g.cloud.z = z
}

const idle: Controls = { target: null, rain: false }
const KINDS = T.kinds
/** A small seeded random, so climate tests repeat. */
function mulberry(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const kind = (g: Garden, k: Plant['kind']) => g.plants.find((p) => p.kind === k)!
/** Bed plant in the middle row, second column: all four neighbours are in the bed. */
const middle = (g: Garden) => g.plants[5]

describe('weather', () => {
  it('rain wets only the soil under the cloud', () => {
    const g = new Garden()
    const [a, b] = g.plants
    parkOver(g, a.x, a.z)
    run(g, 2, { target: { x: a.x, z: a.z }, rain: true })
    expect(a.moisture).toBeGreaterThan(T.soil.start + 0.2)
    expect(b.moisture).toBeLessThan(T.soil.start)
  })

  it('one cloud waters one plant, not its neighbours', () => {
    const g = new Garden()
    const m = middle(g)
    parkOver(g, m.x, m.z)
    run(g, 2, { target: { x: m.x, z: m.z }, rain: true })
    for (const p of g.plants) {
      if (p !== m) expect(p.moisture).toBeLessThan(T.soil.start + 0.03)
    }
  })

  it('the sun dries soil faster than shade does', () => {
    const g = new Garden()
    const [a, b] = g.plants
    parkOver(g, a.x, a.z)
    run(g, 20, idle)
    expect(a.moisture).toBeGreaterThan(b.moisture)
  })

  it('a cloud runs dry, then must gather a little before raining again', () => {
    const g = new Garden()
    g.cloud.water = 0.07
    const p = g.plants[0]
    parkOver(g, p.x, p.z)
    const hold = { target: { x: p.x, z: p.z }, rain: true }
    run(g, 0.5, hold)
    expect(g.cloud.raining).toBe(true)
    run(g, 0.5, hold)
    expect(g.cloud.raining).toBe(false)
    run(g, 0.5, hold)
    expect(g.cloud.raining).toBe(false)
  })

  it('refills quickly over the pond and slowly anywhere else', () => {
    const pond = new Garden()
    const field = new Garden()
    for (const g of [pond, field]) g.cloud.water = 0
    parkOver(field, 0, 0)
    run(pond, 2, { target: { x: T.pond.x, z: T.pond.z }, rain: false })
    run(field, 2, { target: { x: 0, z: 0 }, rain: false })
    expect(pond.cloud.refilling).toBe(true)
    expect(field.cloud.refilling).toBe(false)
    expect(pond.cloud.water).toBeGreaterThan(field.cloud.water * 5)
  })

  it('follows the pointer and stays inside the fence', () => {
    const g = new Garden()
    run(g, 6, { target: { x: 100, z: -100 }, rain: false })
    expect(g.cloud.x).toBeCloseTo(T.yard.x1, 1)
    expect(g.cloud.z).toBeCloseTo(T.yard.z0, 1)
  })
})

describe('plants', () => {
  it('are content inside their range and stop growing well outside it', () => {
    expect(comfortIn(0.5, [0.4, 0.6])).toBe(1)
    expect(comfortIn(0.4 - T.comfortFalloff, [0.4, 0.6])).toBe(0)
  })

  it('lettuce manages in full sun but grows faster with some shade', () => {
    const shaded = new Garden()
    const sunny = new Garden()
    for (const g of [shaded, sunny]) {
      for (const p of g.plants) p.moisture = 0.7
    }
    const l = kind(shaded, 'lettuce')
    parkOver(shaded, l.x, l.z)
    parkOver(sunny, T.pond.x, T.pond.z)
    run(shaded, 30, { target: { x: l.x, z: l.z }, rain: false })
    run(sunny, 30, idle)
    expect(kind(shaded, 'lettuce').growth).toBeGreaterThan(kind(sunny, 'lettuce').growth * 1.4)
    expect(kind(sunny, 'lettuce').need).toBe(null)
  })

  it('a good soak keeps a tomato content for over a minute', () => {
    const g = new Garden()
    const tom = kind(g, 'tomato')
    tom.moisture = 0.8
    run(g, 75, idle)
    expect(tom.need).toBe(null)
    expect(tom.comfort).toBe(1)
  })

  it('lavender sulks when soaked, and says so', () => {
    const g = new Garden()
    const lav = kind(g, 'lavender')
    lav.moisture = 0.95
    g.update(DT, idle)
    expect(lav.need).toBe('soggy')
    expect(lav.comfort).toBe(0)
  })

  it('a thirsty tomato asks for water', () => {
    const g = new Garden()
    const tom = kind(g, 'tomato')
    tom.moisture = 0.1
    g.update(DT, idle)
    expect(tom.need).toBe('thirsty')
  })

  it('growth never goes backwards and nothing dies', () => {
    const g = new Garden()
    let last = g.plants.map((p) => p.growth)
    for (let i = 0; i < 600; i++) {
      g.update(0.5, { target: { x: 0, z: 0 }, rain: true })
      const now = g.plants.map((p) => p.growth)
      now.forEach((v, j) => expect(v).toBeGreaterThanOrEqual(last[j]))
      last = now
    }
  })

  it('names its stages in order', () => {
    expect(stageOf(0)).toBe('seed')
    expect(stageOf(0.2)).toBe('sprout')
    expect(stageOf(0.5)).toBe('leafy')
    expect(stageOf(0.8)).toBe('flowering')
    expect(stageOf(1)).toBe('bloom')
  })

  it('ferns are content in the shade of the oak without any help', () => {
    const g = new Garden()
    for (const p of g.plants) p.moisture = 0.7
    run(g, 60, idle)
    for (const f of g.plants.filter((p) => p.kind === 'fern')) expect(f.comfort).toBeGreaterThan(0.6)
  })

  it('an apple blossom barely moves without a breeze, and sets fruit with one', () => {
    const still = new Garden()
    const breezy = new Garden()
    for (const g of [still, breezy]) {
      const a = kind(g, 'apple')
      a.growth = T.stages.flowering
      a.moisture = 0.6
      parkOver(g, a.x - 1.5, a.z)
    }
    const a = kind(still, 'apple')
    const at = { x: a.x - 1.5, z: a.z }
    run(still, 10, { target: at, rain: false })
    run(breezy, 10, { target: at, rain: false, breeze: true })
    const gain = (g: Garden) => kind(g, 'apple').growth - T.stages.flowering
    expect(gain(breezy)).toBeGreaterThan(10 * gain(still))
    expect(gain(still)).toBeGreaterThan(0)
  })
})

describe('day and night', () => {
  it('the day starts bright, and a night follows', () => {
    expect(daylight(0)).toBeGreaterThan(0.9)
    const nightAt = T.day.length * (1 - T.day.start) + T.day.night / 2
    expect(daylight(nightAt)).toBe(0)
    expect(daylight(nightAt + CYCLE)).toBe(0)
  })

  it('shadows fall away from the viewer at midday', () => {
    const noon = T.day.length * (0.5 - T.day.start)
    const s = shadowOf(0, 0, 4, noon)
    expect(s.z).toBeLessThan(-1)
    expect(Math.abs(s.x)).toBeLessThan(0.1)
  })

  it('plants rest at night, and moonflowers grow only then', () => {
    const g = new Garden()
    for (const p of g.plants) p.moisture = 0.6
    const nightAt = T.day.length * (1 - T.day.start) + 5
    run(g, nightAt, idle)
    for (const p of g.plants) p.moisture = 0.6
    const tom = kind(g, 'tomato').growth
    const moon = kind(g, 'moonflower').growth
    expect(moon).toBeLessThan(0.06)
    run(g, 30, idle)
    expect(kind(g, 'tomato').growth).toBeCloseTo(tom, 3)
    expect(kind(g, 'moonflower').growth).toBeGreaterThan(moon + 0.2)
    expect(g.plants.every((p) => p.kind === 'moonflower' || p.need === null)).toBe(true)
  })

  it('dew at dawn lifts dry soil, but never past what a plant likes', () => {
    const g = new Garden()
    const dawnAt = T.day.length * (1 - T.day.start) + T.day.night
    run(g, dawnAt - 5, idle)
    for (const p of g.plants) p.moisture = 0.05
    kind(g, 'lavender').moisture = 0.44
    run(g, 5 + T.day.twilight, idle)
    expect(kind(g, 'tomato').moisture).toBeGreaterThan(0.12)
    expect(kind(g, 'lavender').moisture).toBeLessThanOrEqual(T.kinds.lavender.moisture[1])
  })
})

describe('the cloud', () => {
  it('spread wide, it waters several plants gently; gathered, just one', () => {
    const wide = new Garden()
    const tight = new Garden()
    for (const [g, spread] of [[wide, 1], [tight, 0]] as const) {
      g.cloud.capacity = g.cloud.water = T.cloud.maxCapacity
      g.cloud.spread = spread
      const m = middle(g)
      parkOver(g, m.x, m.z)
      run(g, 2, { target: { x: m.x, z: m.z }, rain: true, spread })
    }
    const wetted = (g: Garden) => g.plants.filter((p) => p.moisture > T.soil.start + 0.02).length
    expect(wetted(wide)).toBeGreaterThanOrEqual(5)
    expect(wetted(tight)).toBe(1)
    expect(middle(tight).moisture).toBeGreaterThan(middle(wide).moisture)
  })

  it('grows each time a plant blooms, and can then spread wider', () => {
    const g = new Garden()
    g.cloud.spread = 1
    const before = g.radius
    for (const p of g.plants.slice(0, 3)) p.growth = 0.9999
    for (const p of g.plants.slice(0, 3)) p.moisture = 0.6
    run(g, 1, idle)
    expect(g.cloud.capacity).toBeCloseTo(1 + 3 * T.cloud.capacityPerBloom)
    g.cloud.water = g.cloud.capacity
    expect(g.radius).toBeGreaterThan(before * 1.2)
  })

  it('swells as it drinks at the pond', () => {
    const g = new Garden()
    g.cloud.water = 0.1
    const thin = g.radius
    run(g, 4, { target: { x: T.pond.x, z: T.pond.z }, rain: false })
    expect(g.radius).toBeGreaterThan(thin)
  })

  it('fog damps soil gently, never soaks it, and cannot rain', () => {
    const g = new Garden()
    const f = kind(g, 'fern')
    f.moisture = 0.2
    parkOver(g, f.x, f.z)
    run(g, 60, { target: { x: f.x, z: f.z }, rain: true, fog: true })
    expect(g.cloud.raining).toBe(false)
    expect(f.moisture).toBeGreaterThan(0.45)
    expect(f.moisture).toBeLessThanOrEqual(T.fog.target + 1e-9)
    expect(g.journal.has('fog')).toBe(true)
  })
})

describe('lightning', () => {
  it('needs a full, tight cloud, and says why not', () => {
    const refusals: string[] = []
    const g = new Garden({ onStrikeRefused: (why) => refusals.push(why) })
    g.cloud.water = 0.2
    g.update(DT, { ...idle, strike: true })
    g.cloud.water = 1
    g.cloud.spread = 1
    g.update(DT, { ...idle, strike: true })
    expect(refusals).toEqual(['too-little-water', 'too-spread'])
    expect(g.strike).toBe(null)
  })

  it('enriches the soil it hits, and nowhere else', () => {
    const g = new Garden()
    for (const p of g.plants) p.moisture = 0.6
    const m = middle(g)
    parkOver(g, m.x, m.z)
    g.cloud.water = 1
    g.cloud.spread = 0
    g.update(DT, { target: { x: m.x, z: m.z }, rain: false, strike: true, spread: 0 })
    expect(g.strike).not.toBe(null)
    expect(m.rich).toBeGreaterThan(0.99)
    expect(g.journal.has('lightning')).toBe(true)
    expect(g.plants[0].rich).toBe(0)
  })
})

describe('rainbows', () => {
  it('a long shower in sunshine leaves one behind; a short one does not', () => {
    const g = new Garden()
    const at = { x: 0, z: 0 }
    parkOver(g, 0, 0)
    run(g, 1, { target: at, rain: true })
    run(g, 0.5, { target: at, rain: false })
    expect(g.rainbow).toBe(null)
    run(g, T.rainbow.minShower + 0.5, { target: at, rain: true })
    run(g, 0.5, { target: at, rain: false })
    expect(g.rainbow).not.toBe(null)
    run(g, T.rainbow.lasts + 1, idle)
    expect(g.rainbow).toBe(null)
  })
})

describe('the breeze', () => {
  function bloomedGarden() {
    const g = new Garden()
    for (const p of g.plants) p.growth = 1
    return g
  }

  it('carries seed from bloomed plants out into the lawn, never onto hard ground', () => {
    const g = bloomedGarden()
    for (let t = 0; t < 10; t += DT) {
      g.update(DT, { target: { x: -4 + t * 0.9, z: 1.1 }, rain: false, breeze: true })
    }
    run(g, 4, idle)
    expect(g.wildflowers.length).toBeGreaterThan(5)
    for (const f of g.wildflowers) {
      expect(onBed(f.x, f.z)).toBe(false)
      expect(Math.hypot(f.x - T.pond.x, f.z - T.pond.z)).toBeGreaterThan(T.pond.radius)
      expect(g.unplantable(f.x, f.z)).toBe(false)
    }
  })

  it('does nothing without being called up', () => {
    const g = bloomedGarden()
    for (let t = 0; t < 8; t += DT) {
      g.update(DT, { target: { x: -3 + t * 0.8, z: 1.1 }, rain: false })
    }
    expect(g.seeds.length + g.wildflowers.length).toBe(0)
  })

  it('helps open flowers set fruit', () => {
    const still = new Garden()
    const breezy = new Garden()
    for (const g of [still, breezy]) {
      const tom = g.plants[0]
      tom.growth = T.stages.flowering
      tom.moisture = 0.6
      parkOver(g, tom.x + 1.5, tom.z)
    }
    const at = { x: still.plants[0].x + 1.5, z: still.plants[0].z }
    run(still, 10, { target: at, rain: false })
    run(breezy, 10, { target: at, rain: false, breeze: true })
    expect(breezy.plants[0].growth - T.stages.flowering).toBeGreaterThan(
      2 * (still.plants[0].growth - T.stages.flowering),
    )
  })

  it('wildflowers grow up on their own', () => {
    const g = bloomedGarden()
    for (let t = 0; t < 6; t += DT) {
      g.update(DT, { target: { x: -4 + t, z: 1.1 }, rain: false, breeze: true })
    }
    run(g, T.wild.secondsToGrow + 5, idle)
    expect(g.wildflowers.length).toBeGreaterThan(0)
    expect(g.wildflowers.every((f) => f.growth === 1)).toBe(true)
  })
})

describe('the lawn remembers the weather', () => {
  const lawnSpot = { x: 2, z: 6 }

  it('rain greens dry grass, and it stays green after the ground dries', () => {
    const g = new Garden()
    const before = g.ground.greenAt(lawnSpot.x, lawnSpot.z)
    expect(before).toBeLessThan(0.4)
    parkOver(g, lawnSpot.x, lawnSpot.z)
    run(g, 4, { target: lawnSpot, rain: true })
    expect(g.ground.greenAt(lawnSpot.x, lawnSpot.z)).toBeGreaterThan(0.9)
    expect(g.ground.wetAt(lawnSpot.x, lawnSpot.z)).toBeGreaterThan(0.5)
    run(g, CYCLE, idle)
    expect(g.ground.wetAt(lawnSpot.x, lawnSpot.z)).toBe(0)
    expect(g.ground.greenAt(lawnSpot.x, lawnSpot.z)).toBeGreaterThan(0.9)
  })

  it('a long soak in one place leaves a puddle that dries in a minute or two', () => {
    const g = new Garden()
    parkOver(g, lawnSpot.x, lawnSpot.z)
    g.cloud.water = 1
    run(g, 7, { target: lawnSpot, rain: true })
    expect(g.ground.deepestPuddle).toBeGreaterThan(0.15)
    expect(g.journal.has('puddle')).toBe(true)
    run(g, 30, idle)
    expect(g.ground.deepestPuddle).toBeGreaterThan(0)
    run(g, 120, idle)
    expect(g.ground.deepestPuddle).toBe(0)
  })

  it('the breeze lays the grass over along the wind, and it stands back up', () => {
    const g = new Garden()
    parkOver(g, lawnSpot.x - 3, lawnSpot.z)
    run(g, 1.5, { target: { x: lawnSpot.x + 3, z: lawnSpot.z }, rain: false, breeze: true })
    const k = g.ground.index(lawnSpot.x, lawnSpot.z)
    expect(g.ground.bendX[k]).toBeGreaterThan(0.3)
    run(g, 90, idle)
    expect(Math.hypot(g.ground.bendX[k], g.ground.bendZ[k])).toBeLessThan(0.05)
  })

  it('nothing greens the patio, the bed or the pond', () => {
    const g = new Garden()
    const patio = T.hardGround[1]
    const spots = [
      { x: (patio.x0 + patio.x1) / 2, z: (patio.z0 + patio.z1) / 2 },
      { x: 0, z: 0 },
      { x: T.pond.x, z: T.pond.z },
    ]
    for (const s of spots) {
      parkOver(g, s.x, s.z)
      g.cloud.water = 1
      run(g, 3, { target: s, rain: true })
      expect(g.ground.greenAt(s.x, s.z)).toBe(0)
    }
    // Wet paving darkens, but the pond doesn't count as a puddle.
    expect(g.ground.wetAt(spots[0].x, spots[0].z)).toBeGreaterThan(0.3)
    expect(g.ground.wetAt(T.pond.x, T.pond.z)).toBe(0)
  })

  it('green grass slowly creeps into its neighbours', () => {
    const g = new Garden()
    g.ground.greenDisc(lawnSpot.x, lawnSpot.z, 1, 1)
    const edge = g.ground.greenAt(lawnSpot.x + 1.25, lawnSpot.z)
    run(g, 60, idle)
    expect(g.ground.greenAt(lawnSpot.x + 1.25, lawnSpot.z)).toBeGreaterThan(edge + 0.1)
  })

  it('a plant coming into bloom greens the grass round it', () => {
    const g = new Garden()
    const sun = kind(g, 'sunflower')
    sun.growth = 0.999
    sun.moisture = 0.7
    run(g, 2, idle)
    expect(sun.growth).toBe(1)
    expect(g.ground.greenAt(sun.x + 1, sun.z)).toBeGreaterThan(0.5)
  })
})

describe('lightning scars', () => {
  it('leave a mark that is kept, green the grass, and ring with flowers', () => {
    const g = new Garden()
    const at = { x: 3, z: 6 }
    parkOver(g, at.x, at.z)
    g.cloud.water = 1
    run(g, 0.2, { target: at, rain: false, spread: 0, strike: true })
    expect(g.marks).toHaveLength(1)
    expect(g.ground.greenAt(at.x + 1, at.z)).toBeGreaterThan(0.6)
    run(g, T.lightning.ringAfter + 2, idle)
    expect(g.journal.has('fairy-ring')).toBe(true)
    const ring = g.wildflowers.filter((f) => Math.hypot(f.x - at.x, f.z - at.z) < T.lightning.ring * 1.4)
    expect(ring.length).toBeGreaterThan(4)
    for (const f of ring) expect(Math.hypot(f.x - at.x, f.z - at.z)).toBeGreaterThan(T.lightning.ring * 0.6)
  })
})

describe('the storm', () => {
  it('cannot be called until it has gathered, and greening the lawn gathers it', () => {
    let refused = 0
    let ready = 0
    const g = new Garden({ onStormRefused: () => refused++, onStormReady: () => ready++ })
    g.update(DT, { target: null, rain: false, storm: true })
    expect(refused).toBe(1)
    expect(g.storming).toBe(false)
    // Rain over dry lawn until it has gathered.
    const route = (g: Garden): Controls => {
      const t = g.time
      return { target: { x: -12 + ((t * 2) % 24), z: 7 + Math.sin(t) }, rain: true }
    }
    for (let i = 0; i < 40 && g.storm.charge < 1; i++) {
      g.cloud.water = g.cloud.capacity
      run(g, 5, route)
    }
    expect(ready).toBe(1)
    expect(g.storm.charge).toBe(1)
  })

  it('rains wide, strikes a few times, then clears with the cloud full again', () => {
    let strikes = 0
    const g = new Garden({ onStrike: () => strikes++ })
    g.storm.charge = 1
    g.cloud.water = 0.1
    parkOver(g, 0, 5)
    g.update(DT, { target: { x: 0, z: 5 }, rain: false, storm: true })
    expect(g.storming).toBe(true)
    run(g, T.storm.lasts, { target: { x: 0, z: 5 }, rain: false })
    expect(g.storming).toBe(false)
    expect(strikes).toBe(T.storm.strikes)
    expect(g.cloud.water).toBeCloseTo(g.cloud.capacity)
    // Wide: grass greened well beyond an ordinary cloud's reach.
    expect(g.ground.greenAt(4.5, 5)).toBeGreaterThan(0.8)
    expect(g.journal.has('storm')).toBe(true)
  })

  it('waters every plant under it, but never past what each one likes', () => {
    const g = new Garden()
    g.storm.charge = 1
    parkOver(g, 0, 0)
    g.update(DT, { target: { x: 0, z: 0 }, rain: false, storm: true })
    run(g, T.storm.lasts, { target: { x: 0, z: 0 }, rain: false })
    for (const p of g.plants.filter((p) => p.inBed)) {
      expect(p.moisture).toBeLessThanOrEqual(T.kinds[p.kind].moisture[1] + 1e-9)
      expect(p.need === 'soggy').toBe(false)
    }
  })
})

describe('a whole garden', () => {
  /**
   * A simple-minded player: go to whichever unfinished plant is least happy and
   * give it what it asks for, breeze any blossom that needs it, water the
   * moonflowers at night, and top the cloud up at the pond when it runs low.
   * If this can bring everything into bloom, a person can, comfortably.
   */
  function gardener() {
    let topping = false
    let tending: Plant | null = null
    return (g: Garden): Controls => {
      const c = g.cloud
      const pond = { target: { x: T.pond.x, z: T.pond.z }, rain: false }
      if (c.water < 0.08) topping = true
      if (topping && c.water > Math.min(0.9, c.capacity - 0.05)) topping = false
      if (topping) return pond
      const wanting = (p: Plant) => {
        if (p.growth >= 1) return false
        const k = T.kinds[p.kind]
        if (k.pollen && p.growth >= T.stages.flowering) return true
        if (k.night && g.daylight < 0.5 && p.moisture < k.moisture[0] + 0.05) return true
        return p.need === 'thirsty' || p.need === 'wants-shade'
      }
      if (!tending || !wanting(tending)) {
        tending = g.plants.filter(wanting).sort((a, b) => a.comfort - b.comfort)[0] ?? null
      }
      if (!tending) return pond
      const k = T.kinds[tending.kind]
      const here = Math.hypot(c.x - tending.x, c.z - tending.z) < 0.3
      if (k.pollen && tending.growth >= T.stages.flowering) {
        // Sweep back and forth beside the blossom with the breeze on.
        const sway = Math.sin(g.time * 2) * 1.5
        return { target: { x: tending.x + sway, z: tending.z }, rain: false, breeze: true }
      }
      return {
        target: { x: tending.x, z: tending.z },
        rain: here && tending.moisture < (k.moisture[0] + k.moisture[1]) / 2,
      }
    }
  }

  it('can be brought to full bloom within a few days', () => {
    let blooms = 0
    let full = false
    const g = new Garden({ onBloom: () => blooms++, onFullBloom: () => (full = true) })
    const play = gardener()
    let t = 0
    while (!g.fullBloom && t < 6 * CYCLE) {
      g.update(DT, play(g))
      t += DT
    }
    expect(full).toBe(true)
    expect(blooms).toBe(g.plants.length)
    expect(t).toBeLessThan(4 * CYCLE)
  })

  it('left alone, the garden gets nowhere near full bloom', () => {
    const g = new Garden()
    run(g, CYCLE, idle)
    expect(g.bloomed).toBeLessThan(g.plants.length / 2)
  })

  it('every journal entry has its own id', () => {
    const ids = new Set(WISHES.map((w) => w.id))
    expect(ids.size).toBe(WISHES.length)
  })
})

describe('the climate', () => {
  it('changes the weather on its own, and holds still once you pick one', () => {
    const c = new Climate(mulberry(3))
    const seen = new Set<string>()
    for (let t = 0; t < 1500; t += 1) {
      c.update(1)
      seen.add(c.weather)
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
    c.setWeather('fog')
    for (let t = 0; t < 1500; t += 1) c.update(1)
    expect(c.weather).toBe('fog')
    expect(c.mix.fog).toBeGreaterThan(0.99)
  })

  it('eases from one weather into the next rather than snapping', () => {
    const c = new Climate(mulberry(1))
    c.setWeather('clear')
    for (let i = 0; i < 100; i++) c.update(1)
    c.setWeather('rain')
    c.update(1)
    expect(c.rainfall).toBeGreaterThan(0)
    expect(c.rainfall).toBeLessThan(0.2)
    for (let i = 0; i < 60; i++) c.update(1)
    expect(c.rainfall).toBeGreaterThan(0.95)
  })

  it('turns through all four seasons, and winter brings snow instead of rain', () => {
    const c = new Climate(mulberry(5))
    c.setWeather('rain')
    c.setWeather('auto')
    for (let t = 0; t < T.seasons.length * 4 + 10; t += 1) c.update(1)
    expect(c.seen.size).toBe(4)
    const w = new Climate(mulberry(5))
    w.setWeather('rain')
    w.setSeason('winter')
    for (let t = 0; t < 600; t += 1) w.update(1)
    // Pinned rain stays rain even in winter: the player asked for it.
    expect(w.weather).toBe('rain')
    w.setWeather('auto')
    for (let t = 0; t < 2000; t += 1) {
      w.update(1)
      expect(w.weather).not.toBe('rain')
    }
  })

  it('drifting clouds shade the ground only on a clear day, and move on the wind', () => {
    const c = new Climate(mulberry(2))
    c.setWeather('clear')
    for (let i = 0; i < 60; i++) c.update(1)
    const cl = c.clouds.find((k) => k.fade > 0.9)!
    expect(cl).toBeTruthy()
    expect(c.shadeAt(cl.x, cl.z)).toBeLessThan(0.7)
    const x0 = cl.x
    c.update(1)
    expect(cl.x).toBeGreaterThan(x0)
    c.setWeather('overcast')
    for (let i = 0; i < 80; i++) c.update(1)
    for (const k of c.clouds) expect(c.shadeAt(k.x, k.z)).toBeGreaterThan(0.95)
  })
})

describe('weather over the whole garden', () => {
  it('an overcast day dims the light everywhere', () => {
    const g = new Garden()
    run(g, 20, idle)
    const sunny = g.lightAt(4, 4)
    run(g, 60, { ...idle, weather: 'overcast' })
    expect(g.lightAt(4, 4)).toBeLessThan(sunny * 0.75)
  })

  it('a rainy day waters every plant, but never past what each one likes', () => {
    const g = new Garden()
    for (const p of g.plants) p.moisture = 0.05
    run(g, 1, { ...idle, weather: 'rain' })
    run(g, 400, idle)
    for (const p of g.plants) {
      const kind = KINDS[p.kind]
      expect(p.moisture).toBeGreaterThan(0.1)
      expect(p.moisture).toBeLessThanOrEqual(kind.moisture[1] + 1e-6)
    }
  })

  it('a rainy day wets and slowly greens the whole lawn', () => {
    const g = new Garden()
    const before = g.ground.green.slice()
    run(g, 1, { ...idle, weather: 'rain' })
    run(g, 120, idle)
    let k = g.ground.index(T.yard.x0 + 3, T.yard.z1 - 3)
    expect(g.ground.green[k]).toBeGreaterThan(before[k] + 0.2)
    expect(g.ground.wet[k]).toBeGreaterThan(0.3)
  })

  it('in winter plants rest and ask for nothing, and growth never goes backwards', () => {
    const g = new Garden()
    run(g, 1, { ...idle, season: 'winter' })
    run(g, 60, idle)
    const grown = g.plants.map((p) => p.growth)
    for (const p of g.plants) p.moisture = 0
    run(g, 200, idle)
    g.plants.forEach((p, i) => {
      expect(p.growth).toBe(grown[i])
      expect(p.need).toBeNull()
    })
  })

  it('snow settles in winter, and melts into wet ground when spring comes', () => {
    const g = new Garden()
    run(g, 1, { ...idle, season: 'winter', weather: 'snow' })
    run(g, 200, idle)
    expect(g.ground.snowCover).toBeGreaterThan(0.5)
    run(g, 1, { ...idle, season: 'spring', weather: 'clear' })
    run(g, 200, idle)
    expect(g.ground.snowCover).toBeLessThan(0.05)
  })

  it('the cloud snows in winter instead of raining', () => {
    const g = new Garden()
    run(g, 1, { ...idle, season: 'winter' })
    run(g, 40, idle)
    parkOver(g, 3, 4)
    run(g, 10, { target: { x: 3, z: 4 }, rain: true })
    expect(g.ground.snowAt(3, 4)).toBeGreaterThan(0.2)
  })

  it('leaves fall round the trees in autumn, and the breeze moves them on', () => {
    const g = new Garden()
    run(g, 1, { ...idle, season: 'autumn' })
    run(g, 120, idle)
    const under = g.ground.leavesAt(T.oak.x + 1, T.oak.z + 1)
    expect(under).toBeGreaterThan(0.2)
    expect(g.ground.leavesAt(0, 0)).toBe(0)
    // Blowing moves leaves downwind without making or losing any.
    const ground = g.ground
    const total = () => ground.leaves.reduce((a, b) => a + b, 0)
    const sum = total()
    const k = ground.index(T.oak.x + 1, T.oak.z + 1)
    const was = ground.leaves[k]
    ground.blowLeaves(T.oak.x, T.oak.z, 4, 1, 0, 0.5)
    expect(ground.leaves[k]).not.toBeCloseTo(was, 3)
    expect(total()).toBeCloseTo(sum, 3)
  })
})

describe('wildlife', () => {
  it('rabbits come once the lawn is green, and keep away in the rain', () => {
    const g = new Garden()
    run(g, 20, idle)
    expect(g.visitors.rabbits).toBe(0)
    for (let k = 0; k < g.ground.green.length; k++) if (g.ground.lawn[k]) g.ground.green[k] = 0.9
    run(g, 3, idle)
    expect(g.visitors.rabbits).toBeGreaterThan(0)
    expect(g.visitors.birds).toBeGreaterThan(0)
    run(g, 60, { ...idle, weather: 'rain' })
    expect(g.visitors.rabbits).toBe(0)
    expect(g.visitors.frogs).toBeGreaterThan(0)
  })

  it('geese go over in autumn, and deer only come at dawn and dusk', () => {
    const g = new Garden()
    run(g, 1, { ...idle, season: 'autumn' })
    run(g, 60, idle)
    expect(g.visitors.geese).toBe(true)
    let deerByDay = 0
    let deerAtDusk = 0
    run(g, T.day.length + T.day.night, (gg) => {
      const p = dayProgress(gg.time)
      if (gg.visitors.deer) p > 0.25 && p < 0.75 ? deerByDay++ : deerAtDusk++
      return idle
    })
    expect(deerByDay).toBe(0)
    expect(deerAtDusk).toBeGreaterThan(0)
  })
})
