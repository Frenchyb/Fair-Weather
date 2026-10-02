import { describe, expect, it } from 'vitest'
import { Garden, comfortIn, stageOf, type Controls, type Plant } from '../src/sim/garden'
import { T } from '../src/tuning'

const DT = 1 / 30

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
    const middle = g.plants[4]
    parkOver(g, middle.x, middle.z)
    run(g, 2, { target: { x: middle.x, z: middle.z }, rain: true })
    for (const p of g.plants) {
      if (p !== middle) expect(p.moisture).toBeLessThan(T.soil.start + 0.03)
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

  it('follows the pointer and stays in the yard', () => {
    const g = new Garden()
    run(g, 5, { target: { x: 100, z: -100 }, rain: false })
    expect(g.cloud.x).toBeCloseTo(T.yard.halfWidth, 1)
    expect(g.cloud.z).toBeCloseTo(-T.yard.halfDepth, 1)
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
    const lettuce = (g: Garden) => g.plants.find((p) => p.kind === 'lettuce')!
    const l = lettuce(shaded)
    parkOver(shaded, l.x, l.z)
    parkOver(sunny, T.pond.x, T.pond.z)
    run(shaded, 30, { target: { x: l.x, z: l.z }, rain: false })
    run(sunny, 30, idle)
    expect(lettuce(shaded).growth).toBeGreaterThan(lettuce(sunny).growth * 1.4)
    expect(lettuce(sunny).need).toBe(null)
  })

  it('a good soak keeps a tomato content for over a minute', () => {
    const g = new Garden()
    const tom = g.plants.find((p) => p.kind === 'tomato')!
    tom.moisture = 0.8
    run(g, 75, idle)
    expect(tom.need).toBe(null)
    expect(tom.comfort).toBe(1)
  })

  it('lavender sulks when soaked, and says so', () => {
    const g = new Garden()
    const lav = g.plants.find((p) => p.kind === 'lavender')!
    lav.moisture = 0.95
    g.update(DT, idle)
    expect(lav.need).toBe('soggy')
    expect(lav.comfort).toBe(0)
  })

  it('a thirsty tomato asks for water', () => {
    const g = new Garden()
    const tom = g.plants.find((p) => p.kind === 'tomato')!
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
})

describe('a whole summer', () => {
  /**
   * A simple-minded player: go to whichever unfinished plant is least happy and
   * give it what it asks for, topping the cloud up at the pond when it runs low.
   * If this can reach full bloom, a person can, comfortably.
   */
  function gardener() {
    let topping = false
    let tending: Plant | null = null
    return (g: Garden): Controls => {
      const c = g.cloud
      if (c.water < 0.08) topping = true
      if (topping && c.water > 0.9) topping = false
      if (topping) return { target: { x: T.pond.x, z: T.pond.z }, rain: false }
      const wanting = (p: Plant) =>
        p.growth < 1 && (p.need === 'thirsty' || p.need === 'wants-shade')
      if (!tending || !wanting(tending)) {
        tending = g.plants.filter(wanting).sort((a, b) => a.comfort - b.comfort)[0] ?? null
      }
      if (!tending) return { target: { x: T.pond.x, z: T.pond.z }, rain: false }
      const here = Math.hypot(c.x - tending.x, c.z - tending.z) < 0.3
      const kind = T.kinds[tending.kind]
      return {
        target: { x: tending.x, z: tending.z },
        rain: here && tending.moisture < (kind.moisture[0] + kind.moisture[1]) / 2,
      }
    }
  }

  it('can be brought to full bloom in a few minutes', () => {
    let blooms = 0
    let full = false
    const g = new Garden({ onBloom: () => blooms++, onFullBloom: () => (full = true) })
    const play = gardener()
    let t = 0
    while (!g.fullBloom && t < 600) {
      g.update(DT, play(g))
      t += DT
    }
    expect(full).toBe(true)
    expect(blooms).toBe(9)
    expect(t).toBeLessThan(300)
  })

  it('left alone, the garden gets nowhere near full bloom', () => {
    const g = new Garden()
    run(g, 300, idle)
    expect(g.bloomed).toBeLessThan(6)
  })
})

describe('the cloud', () => {
  it('spread wide, it waters several plants gently; gathered, just one', () => {
    const wide = new Garden()
    const tight = new Garden()
    const mid = (g: Garden) => g.plants[4]
    for (const [g, spread] of [[wide, 1], [tight, 0]] as const) {
      g.cloud.capacity = g.cloud.water = T.cloud.maxCapacity
      g.cloud.spread = spread
      parkOver(g, mid(g).x, mid(g).z)
      run(g, 2, { target: { x: mid(g).x, z: mid(g).z }, rain: true, spread })
    }
    const wetted = (g: Garden) => g.plants.filter((p) => p.moisture > T.soil.start + 0.02).length
    expect(wetted(wide)).toBeGreaterThanOrEqual(5)
    expect(wetted(tight)).toBe(1)
    expect(mid(tight).moisture).toBeGreaterThan(mid(wide).moisture)
  })

  it('grows each time a plant blooms, and can then spread wider', () => {
    const g = new Garden()
    g.cloud.spread = 1
    const before = g.radius
    for (const p of g.plants.slice(0, 3)) p.growth = 0.9999
    g.update(DT, idle)
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
})

describe('the breeze', () => {
  function bloomedGarden() {
    const g = new Garden()
    for (const p of g.plants) p.growth = 1
    return g
  }

  it('carries seed from bloomed plants out into the grass', () => {
    const g = bloomedGarden()
    // Sweep slowly left to right along the front of the bed, breeze on.
    for (let t = 0; t < 8; t += DT) {
      g.update(DT, { target: { x: -3 + t * 0.8, z: 1.1 }, rain: false, breeze: true })
    }
    run(g, 4, idle)
    expect(g.wildflowers.length).toBeGreaterThan(5)
    for (const f of g.wildflowers) {
      expect(Math.abs(f.x) < T.bed.width / 2 && Math.abs(f.z) < T.bed.depth / 2).toBe(false)
      expect(Math.hypot(f.x - T.pond.x, f.z - T.pond.z)).toBeGreaterThan(T.pond.radius)
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
      g.update(DT, { target: { x: -3 + t, z: 1.1 }, rain: false, breeze: true })
    }
    run(g, T.wild.secondsToGrow + 5, idle)
    expect(g.wildflowers.length).toBeGreaterThan(0)
    expect(g.wildflowers.every((f) => f.growth === 1)).toBe(true)
  })
})
