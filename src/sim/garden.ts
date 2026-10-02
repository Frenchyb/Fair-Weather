/**
 * The garden: a raised bed, an orchard, sunflowers, ferns under an oak and
 * moonflowers by the pond, all under one cloud, the sun everywhere the cloud is
 * not, and the weather the player calls up: rain, a breeze, fog and lightning.
 *
 * Pure maths, no three.js. Coordinates are metres on the ground plane, x to
 * the right (east) and z towards the viewer (south).
 */
import { T, type KindName } from '../tuning'
import { Ground } from './ground'
import { WISHES, type WishId } from './journal'
import { daylight, shadowOf } from './sky'

export type Need = 'thirsty' | 'soggy' | 'wants-sun' | 'wants-shade'
export type Stage = 'seed' | 'sprout' | 'leafy' | 'flowering' | 'bloom'
export type WildKind = 'poppy' | 'cornflower' | 'daisy' | 'buttercup'
export const WILD_KINDS: WildKind[] = ['poppy', 'cornflower', 'daisy', 'buttercup']

export interface Plant {
  kind: KindName
  x: number
  z: number
  /** True for the plants in the raised bed. */
  inBed: boolean
  moisture: number
  /** Light averaged over the last `T.lightMemory` seconds of daylight. */
  light: number
  /** 0 seed to 1 full bloom. Never goes down. */
  growth: number
  /** 0 to 1, how content it is right now. */
  comfort: number
  /** Comfort smoothed, for posture. */
  mood: number
  /** What it would most like changed, or null when content or asleep. */
  need: Need | null
  /** True while the breeze is on its flowers. */
  pollinating: boolean
  /** 0 to 1: soil richness left by a lightning strike, fading. */
  rich: number
  /** Seconds until it next lets a seed go in the breeze. */
  seedTimer: number
}

export interface Cloud {
  x: number
  z: number
  /** Velocity over the ground, m/s. */
  vx: number
  vz: number
  /** Water held, in units where a new cloud holds 1. */
  water: number
  /** Most it can hold. Grows each time a plant comes into bloom. */
  capacity: number
  /** 0 gathered tight, 1 spread wide. */
  spread: number
  raining: boolean
  /** Seconds of unbroken rain so far. */
  shower: number
  /** True while it is resting over the pond and drinking. */
  refilling: boolean
  breezing: boolean
  /** Lying low over the ground as fog. */
  fogging: boolean
  /** Unit vector the breeze blows along. */
  windX: number
  windZ: number
}

export interface Seed {
  x: number
  z: number
  vx: number
  vz: number
  /** Seconds left before it settles. */
  flight: number
  kind: WildKind
}

export interface Wildflower {
  x: number
  z: number
  kind: WildKind
  growth: number
}

export interface Rainbow {
  x: number
  z: number
  age: number
}

export interface Strike {
  x: number
  z: number
  age: number
}

/** Where lightning has struck: a scorch that heals into a fairy ring. Kept for good. */
export interface Mark {
  x: number
  z: number
  age: number
}

export interface Storm {
  /** 0 to 1; at 1 the player can call it. */
  charge: number
  /** Seconds of storm left, 0 when there isn't one. */
  left: number
  /** Seconds until its next lightning strike. */
  nextStrike: number
}

export interface Controls {
  /** Where the player is pointing on the ground, or null to stay put. */
  target: { x: number; z: number } | null
  rain: boolean
  breeze?: boolean
  fog?: boolean
  /** True for the one step in which lightning is asked for. */
  strike?: boolean
  /** Desired spread, 0 to 1. Omit to leave it as it is. */
  spread?: number
  /** True for the one step in which the storm is called. */
  storm?: boolean
}

export type StrikeRefusal = 'too-little-water' | 'too-spread' | 'too-soon'

export interface Hooks {
  onBloom?: (plant: Plant) => void
  onFullBloom?: () => void
  onSprout?: (flower: Wildflower) => void
  onWish?: (id: WishId) => void
  onStrike?: (strike: Strike) => void
  onStrikeRefused?: (why: StrikeRefusal) => void
  onRainbow?: (rainbow: Rainbow) => void
  onDawn?: () => void
  onStormReady?: () => void
  onStorm?: () => void
  onStormRefused?: () => void
  onStormEnd?: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 1 if `v` is inside the range, falling to 0 at `comfortFalloff` outside it. */
export function comfortIn(v: number, [lo, hi]: [number, number]) {
  const off = v < lo ? lo - v : v > hi ? v - hi : 0
  return clamp(1 - off / T.comfortFalloff, 0, 1)
}

export function stageOf(growth: number): Stage {
  const s = T.stages
  if (growth >= s.bloom) return 'bloom'
  if (growth >= s.flowering) return 'flowering'
  if (growth >= s.leafy) return 'leafy'
  if (growth >= s.sprout) return 'sprout'
  return 'seed'
}

export function onBed(x: number, z: number, margin = 0) {
  return Math.abs(x) < T.bed.width / 2 + margin && Math.abs(z) < T.bed.depth / 2 + margin
}

/** Every plant in the garden: the bed's grid first, then everything else. */
export function plantings() {
  const out: { kind: KindName; x: number; z: number; inBed: boolean }[] = []
  const rows = T.layout.length
  T.layout.forEach((row, r) =>
    row.forEach((kind, c) =>
      out.push({
        kind,
        x: (c - (row.length - 1) / 2) * T.spacing.x,
        z: (r - (rows - 1) / 2) * T.spacing.z,
        inBed: true,
      }),
    ),
  )
  for (const p of T.plantings) out.push({ ...p, inBed: false })
  return out
}

export class Garden {
  readonly plants: Plant[] = []
  readonly cloud: Cloud
  readonly seeds: Seed[] = []
  readonly wildflowers: Wildflower[] = []
  readonly journal = new Set<WishId>()
  readonly marks: Mark[] = []
  readonly ground: Ground
  readonly storm: Storm = { charge: T.storm.start, left: 0, nextStrike: 0 }
  rainbow: Rainbow | null = null
  strike: Strike | null = null
  time = 0
  fullBloom = false
  private seed = 12345
  private sinceStrike = Infinity
  private wasDay = true

  constructor(private hooks: Hooks = {}) {
    for (const p of plantings()) {
      this.plants.push({
        ...p,
        moisture: T.soil.start,
        light: 1,
        growth: 0,
        comfort: 1,
        mood: 1,
        need: null,
        pollinating: false,
        rich: 0,
        seedTimer: 0,
      })
    }
    this.cloud = {
      x: T.pond.x,
      z: T.pond.z,
      vx: 0,
      vz: 0,
      water: T.cloud.startWater,
      capacity: 1,
      spread: T.cloud.startSpread,
      raining: false,
      shower: 0,
      refilling: false,
      breezing: false,
      fogging: false,
      windX: 1,
      windZ: 0,
    }
    for (const p of this.plants) this.assess(p, 1)
    this.ground = new Ground(() => this.random())
  }

  get storming() {
    return this.storm.left > 0
  }

  get daylight() {
    return daylight(this.time)
  }

  /** Radius of the cloud's shade and rain on the ground right now. */
  get radius() {
    const c = this.cloud
    const { gathered, spreadBase, spreadPerCapacity, emptyShrink } = T.cloud.size
    const wide = spreadBase + spreadPerCapacity * (c.capacity - 1)
    const fill = c.water / c.capacity
    const r = lerp(gathered, wide, c.spread) * (1 - emptyShrink * (1 - fill))
    return c.fogging ? r * T.fog.scale : r
  }

  /** Width of the shade's soft edge, which grows with the cloud. */
  get softEdge() {
    return T.cloud.softEdge * (this.radius / T.cloud.size.reference)
  }

  /** Rain per unit area relative to a cloud of the reference size: wide is gentle. */
  get rainIntensity() {
    return (T.cloud.size.reference / this.radius) ** 2
  }

  /** How much of the cloud is over a point: 1 under its middle, 0 clear of it. */
  coverage(x: number, z: number) {
    const d = Math.hypot(x - this.cloud.x, z - this.cloud.z)
    const r = this.radius
    const soft = this.softEdge
    return 1 - smoothstep(r - soft / 2, r + soft / 2, d)
  }

  /** Where the oak's shade falls right now. */
  oakShade() {
    const o = T.oak
    return shadowOf(o.x, o.z, o.crownHeight, this.time)
  }

  /** Sunlight reaching a point on the ground, 0 to 1. */
  lightAt(x: number, z: number) {
    const under = this.cloud.fogging ? T.fog.light : T.cloud.shadeLight
    const cloud = 1 - this.coverage(x, z) * (1 - under)
    const s = this.oakShade()
    const d = Math.hypot(x - s.x, z - s.z)
    const r = T.oak.crownRadius
    const oak = 1 - (1 - smoothstep(r * 0.6, r * 1.2, d)) * (1 - T.oak.shadeLight)
    return this.daylight * Math.min(cloud, oak)
  }

  /** How strongly the breeze is blowing at a point: 1 near the cloud, 0 well clear. */
  breezeAt(x: number, z: number) {
    if (!this.cloud.breezing) return 0
    const d = Math.hypot(x - this.cloud.x, z - this.cloud.z)
    const reach = this.radius + T.wind.reach
    return 1 - smoothstep(reach * 0.6, reach, d)
  }

  overPond() {
    const c = this.cloud
    return Math.hypot(c.x - T.pond.x, c.z - T.pond.z) < T.pond.radius
  }

  /** True where nothing wild should take root. */
  unplantable(x: number, z: number) {
    const m = T.wild.margin
    const y = T.yard
    if (x < y.x0 + m || x > y.x1 - m || z < y.z0 + m || z > y.z1 - m) return true
    if (onBed(x, z, m)) return true
    if (Math.hypot(x - T.pond.x, z - T.pond.z) < T.pond.radius + m) return true
    if (Math.hypot(x - T.oak.x, z - T.oak.z) < 0.9) return true
    for (const h of T.hardGround) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true
    for (const p of this.plants) {
      if (!p.inBed && Math.hypot(x - p.x, z - p.z) < (T.kinds[p.kind].reach ?? 0.4) * 0.6) return true
    }
    return false
  }

  get bloomed() {
    return this.plants.filter((p) => p.growth >= 1).length
  }

  update(dt: number, controls: Controls) {
    this.time += dt
    this.sinceStrike += dt
    const day = this.daylight
    const isDay = day > 0.5
    if (isDay && !this.wasDay) this.dawn()
    this.wasDay = isDay

    this.moveCloud(dt, controls)
    if (controls.strike) this.tryStrike()
    if (controls.storm) this.callStorm()
    if (this.storming) this.rage(dt)
    this.weatherGround(dt)
    for (const p of this.plants) this.tend(p, dt, day)
    this.drift(dt)
    this.age(dt)

    const c = this.cloud
    if (c.raining) {
      const wet = this.plants.filter((p) => this.coverage(p.x, p.z) > 0.4).length
      if (wet >= 3) this.wish('three-at-once')
    }
    if (c.fogging && this.plants.some((p) => p.kind === 'fern' && this.coverage(p.x, p.z) > 0.4)) {
      this.wish('fog')
    }
    if (day < 0.2 && this.wildflowers.length >= 10) this.wish('fireflies')
    if (this.wildflowers.length >= 60) this.wish('meadow')
    if (this.ground.deepestPuddle > 0.15) this.wish('puddle')
    if (this.marks.some((m) => m.age > T.lightning.ringAfter)) this.wish('fairy-ring')
    if (this.ground.greenShare >= 0.5) this.wish('green-half')
    if (!this.fullBloom && this.plants.every((p) => p.growth >= 1)) {
      this.fullBloom = true
      this.wish('all')
      this.hooks.onFullBloom?.()
    }
  }

  private wish(id: WishId) {
    if (this.journal.has(id)) return
    this.journal.add(id)
    this.hooks.onWish?.(id)
  }

  /** Dew settles overnight: dry soil comes up a little, never past what a plant likes. */
  private dawn() {
    for (const p of this.plants) {
      const top = T.kinds[p.kind].moisture[1]
      if (p.moisture < top) p.moisture = Math.min(top, p.moisture + T.dew)
    }
    this.hooks.onDawn?.()
  }

  private moveCloud(dt: number, { target, rain, breeze = false, fog = false, spread }: Controls) {
    const c = this.cloud
    const x0 = c.x
    const z0 = c.z
    if (target) {
      const y = T.yard
      const tx = clamp(target.x, y.x0, y.x1)
      const tz = clamp(target.z, y.z0, y.z1)
      const k = 1 - Math.exp(-T.cloud.followRate * dt)
      c.x += (tx - c.x) * k
      c.z += (tz - c.z) * k
    }
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / T.wind.turnLag)
      c.vx += ((c.x - x0) / dt - c.vx) * k
      c.vz += ((c.z - z0) / dt - c.vz) * k
    }
    if (spread !== undefined) {
      const k = 1 - Math.exp(-T.cloud.spreadRate * dt)
      c.spread += (clamp(spread, 0, 1) - c.spread) * k
    }

    // The breeze follows the way the cloud is going; at rest it keeps its last heading.
    c.breezing = breeze
    const speed = Math.hypot(c.vx, c.vz)
    if (speed > T.wind.minSpeedToTurn) {
      c.windX = c.vx / speed
      c.windZ = c.vz / speed
    }

    // Fog is the cloud lying low: it cannot rain, and it slowly uses its water.
    c.fogging = fog && c.water > 0.02
    if (c.fogging) c.water = Math.max(0, c.water - T.fog.use * dt)

    // Once it has run dry it needs a little in hand before it rains again,
    // or holding the button over an empty cloud would flicker rain on and off.
    const was = c.raining
    c.raining = !c.fogging && rain && c.water > (c.raining ? 0 : T.cloud.minToRain)
    if (c.raining) {
      c.water = Math.max(0, c.water - T.cloud.rainUse * dt)
      if (c.water === 0) c.raining = false
    }
    if (c.raining) c.shower += dt
    else if (was) this.showerEnded()

    c.refilling = !c.raining && !c.fogging && this.overPond() && c.water < c.capacity
    const refill = c.refilling ? T.cloud.pondRefill : c.raining || c.fogging ? 0 : T.cloud.passiveRefill
    c.water = Math.min(c.capacity, c.water + refill * dt)
  }

  /** A good shower in sunshine leaves a rainbow behind it. */
  private showerEnded() {
    const c = this.cloud
    const r = T.rainbow
    if (c.shower >= r.minShower && this.daylight >= r.minDaylight) {
      this.rainbow = { x: c.x, z: c.z, age: 0 }
      this.wish('rainbow')
      this.hooks.onRainbow?.(this.rainbow)
    }
    c.shower = 0
  }

  private tryStrike() {
    const c = this.cloud
    const L = T.lightning
    let why: StrikeRefusal | null = null
    if (this.sinceStrike < L.cooldown) why = 'too-soon'
    else if (c.water < L.minWater) why = 'too-little-water'
    else if (c.spread > L.maxSpread) why = 'too-spread'
    if (why) {
      this.hooks.onStrikeRefused?.(why)
      return
    }
    this.sinceStrike = 0
    c.water -= L.cost
    this.strikeAt(c.x, c.z, this.radius + 0.6)
  }

  /**
   * Lightning really does feed the soil: it fixes nitrogen out of the air. It
   * leaves a scorch that heals greener than before, with wildflowers and then
   * mushrooms coming up in a ring round it.
   */
  private strikeAt(x: number, z: number, feeds: number) {
    const L = T.lightning
    this.strike = { x, z, age: 0 }
    for (const p of this.plants) {
      if (Math.hypot(p.x - x, p.z - z) < feeds) p.rich = 1
    }
    for (let i = 0; i < L.seeds; i++) {
      const a = (i / L.seeds) * Math.PI * 2 + this.random() * 0.5
      const flight = 0.6 + this.random() * 0.6
      const v = (L.ring * (0.85 + this.random() * 0.3)) / flight
      this.seeds.push({
        x,
        z,
        vx: Math.cos(a) * v,
        vz: Math.sin(a) * v,
        flight,
        kind: WILD_KINDS[Math.floor(this.random() * WILD_KINDS.length)],
      })
    }
    this.marks.push({ x, z, age: 0 })
    if (this.marks.length > L.marks) this.marks.shift()
    this.ground.greenDisc(x, z, L.greenRadius, L.green)
    this.wish('lightning')
    this.hooks.onStrike?.(this.strike)
  }

  private callStorm() {
    const s = this.storm
    if (this.storming || s.charge < 1) {
      this.hooks.onStormRefused?.()
      return
    }
    s.charge = 0
    s.left = T.storm.lasts
    s.nextStrike = T.storm.lasts / T.storm.strikes / 2
    this.wish('storm')
    this.hooks.onStorm?.()
  }

  /** A storm rains wide round the cloud, strikes now and then, and gusts. */
  private rage(dt: number) {
    const s = this.storm
    const S = T.storm
    const c = this.cloud
    s.left = Math.max(0, s.left - dt)
    for (const p of this.plants) {
      const d = Math.hypot(p.x - c.x, p.z - c.z)
      if (d > S.radius) continue
      const top = T.kinds[p.kind].moisture[1]
      if (p.moisture < top) p.moisture = Math.min(top, p.moisture + S.soak * dt)
    }
    s.nextStrike -= dt
    if (s.nextStrike <= 0) {
      s.nextStrike = S.lasts / S.strikes
      const a = this.random() * Math.PI * 2
      const d = (0.3 + 0.6 * this.random()) * S.radius
      const x = clamp(c.x + Math.cos(a) * d, T.yard.x0 + 1, T.yard.x1 - 1)
      const z = clamp(c.z + Math.sin(a) * d, T.yard.z0 + 1, T.yard.z1 - 1)
      this.strikeAt(x, z, 1.5)
    }
    if (s.left === 0) {
      c.water = c.capacity
      if (this.daylight >= T.rainbow.minDaylight) {
        this.rainbow = { x: c.x, z: c.z, age: 0 }
        this.wish('rainbow')
        this.hooks.onRainbow?.(this.rainbow)
      }
      this.hooks.onStormEnd?.()
    }
  }

  /** What the weather does to the lawn, and how a greener lawn charges the storm. */
  private weatherGround(dt: number) {
    const g = this.ground
    const c = this.cloud
    let greened = 0
    if (c.raining) greened += g.rain(c.x, c.z, this.radius, this.softEdge, this.rainIntensity * dt)
    if (this.storming) {
      const S = T.storm
      g.rain(c.x, c.z, S.radius, S.softEdge, S.rain * dt)
      g.blow(c.x, c.z, S.radius, c.windX, c.windZ, S.gust * T.ground.bendRate * dt)
    }
    if (c.breezing) {
      g.blow(c.x, c.z, this.radius + T.wind.reach, c.windX, c.windZ, T.ground.bendRate * dt)
    }
    g.settle(dt, this.daylight)
    this.charge(greened * T.storm.perGreen)
  }

  private charge(by: number) {
    const s = this.storm
    if (by <= 0 || this.storming || s.charge >= 1) return
    s.charge = Math.min(1, s.charge + by)
    if (s.charge >= 1) this.hooks.onStormReady?.()
  }

  private tend(p: Plant, dt: number, day: number) {
    const kind = T.kinds[p.kind]
    const cover = this.coverage(p.x, p.z)
    const light = this.lightAt(p.x, p.z)
    const s = T.soil
    let dm = -(s.baseDry + s.sunDry * light) * dt
    if (this.cloud.raining) dm += s.rainRate * this.rainIntensity * cover * dt
    if (this.cloud.fogging && p.moisture < T.fog.target) {
      dm += Math.min(T.fog.target - p.moisture, T.fog.rate * cover * dt)
    }
    p.moisture = clamp(p.moisture + dm, 0, 1)
    // Plants judge the light by day only, so night doesn't read as deep shade.
    if (day > 0.5) {
      const daytime = light / day
      p.light += (daytime - p.light) * (1 - Math.exp(-dt / T.lightMemory))
    }

    this.assess(p, day)
    const before = p.growth
    const breeze = this.breezeAt(p.x, p.z)
    const flowering = p.growth >= T.stages.flowering && p.growth < 1
    p.pollinating = breeze > 0.3 && flowering
    // Moving air on open flowers sets fruit. For most plants it's a bonus; an
    // apple's blossom crawls along without it.
    let fruiting = 1
    if (p.pollinating) fruiting = 1 + T.wind.pollinateBoost * breeze
    else if (flowering && kind.pollen) fruiting = T.wind.withoutPollen
    const awake = kind.night ? 1 - day : day
    const rich = 1 + T.lightning.richBoost * p.rich
    const rate = (p.comfort * (kind.pace ?? 1) * awake * fruiting * rich) / T.secondsToBloom
    p.growth = Math.min(1, p.growth + rate * dt)
    p.rich = Math.max(0, p.rich - dt / T.lightning.richFor)
    p.mood += (p.comfort - p.mood) * (1 - Math.exp(-dt / T.moodLag))
    if (before < 1 && p.growth >= 1) this.bloom(p)

    // A plant in bloom lets seed go into the breeze.
    if (p.growth >= 1 && breeze > 0.3) {
      p.seedTimer -= dt
      if (p.seedTimer <= 0) {
        p.seedTimer = T.wind.seedEvery * (0.6 + this.random() * 0.8)
        this.release(p.x, p.z)
      }
    }
  }

  private bloom(p: Plant) {
    this.cloud.capacity = Math.min(T.cloud.maxCapacity, this.cloud.capacity + T.cloud.capacityPerBloom)
    const b = T.ground.bloomGreen
    this.ground.greenDisc(p.x, p.z, b.radius, b.amount)
    this.charge(T.storm.perBloom)
    this.wish('first-bloom')
    if (p.kind === 'apple') this.wish('apples')
    if (p.kind === 'sunflower') this.wish('sunflower')
    if (p.kind === 'moonflower') this.wish('moonflower')
    this.hooks.onBloom?.(p)
  }

  private release(x: number, z: number) {
    if (this.seeds.length >= T.wind.maxSeedsInAir) return
    const c = this.cloud
    const w = T.wind
    const side = (this.random() - 0.5) * 2 * w.seedScatter
    this.seeds.push({
      x,
      z,
      vx: (c.windX - c.windZ * side) * w.seedSpeed,
      vz: (c.windZ + c.windX * side) * w.seedSpeed,
      flight: lerp(w.seedFlight[0], w.seedFlight[1], this.random()),
      kind: WILD_KINDS[Math.floor(this.random() * WILD_KINDS.length)],
    })
  }

  private drift(dt: number) {
    for (let i = this.seeds.length - 1; i >= 0; i--) {
      const s = this.seeds[i]
      s.x += s.vx * dt
      s.z += s.vz * dt
      s.flight -= dt
      if (s.flight > 0) continue
      this.seeds.splice(i, 1)
      if (this.wildflowers.length >= T.wild.max || this.unplantable(s.x, s.z)) continue
      const crowded = this.wildflowers.some((f) => Math.hypot(f.x - s.x, f.z - s.z) < T.wild.spacing)
      if (crowded) continue
      const flower = { x: s.x, z: s.z, kind: s.kind, growth: 0 }
      this.wildflowers.push(flower)
      this.wish('wildflower')
      this.hooks.onSprout?.(flower)
    }
    // Wildflowers look after themselves; rain just hurries them along.
    for (const f of this.wildflowers) {
      if (f.growth >= 1) continue
      let wet = this.cloud.raining ? this.coverage(f.x, f.z) : 0
      if (this.storming) wet = 1
      f.growth = Math.min(1, f.growth + ((1 + T.wild.rainBoost * wet) / T.wild.secondsToGrow) * dt)
    }
  }

  private age(dt: number) {
    if (this.rainbow && (this.rainbow.age += dt) > T.rainbow.lasts) this.rainbow = null
    if (this.strike && (this.strike.age += dt) > 1) this.strike = null
    for (const m of this.marks) m.age += dt
  }

  private assess(p: Plant, day: number) {
    const kind = T.kinds[p.kind]
    const lc = comfortIn(p.light, kind.light)
    const mc = comfortIn(p.moisture, kind.moisture)
    p.comfort = Math.min(lc, mc)
    // Asleep plants ask for nothing; night-bloomers ask only at night.
    const awake = kind.night ? day < 0.5 : day > 0.5
    if (!awake || p.comfort >= T.showNeedBelow || p.growth >= 1) p.need = null
    else if (mc <= lc) p.need = p.moisture < kind.moisture[0] ? 'thirsty' : 'soggy'
    else p.need = p.light < kind.light[0] ? 'wants-sun' : 'wants-shade'
  }

  /** Deterministic, so a test sees the same seeds every run. */
  private random() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }
}

export { WISHES }
