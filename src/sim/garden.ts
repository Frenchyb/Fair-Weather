/**
 * The garden: one bed, one cloud, the sun everywhere the cloud is not, and a
 * breeze you can call up to carry seed out into the grass.
 *
 * Pure maths, no three.js. Coordinates are metres on the ground plane, x to
 * the right and z towards the viewer.
 */
import { T, type KindName } from '../tuning'

export type Need = 'thirsty' | 'soggy' | 'wants-sun' | 'wants-shade'
export type Stage = 'seed' | 'sprout' | 'leafy' | 'flowering' | 'bloom'
export type WildKind = 'poppy' | 'cornflower' | 'daisy' | 'buttercup'
export const WILD_KINDS: WildKind[] = ['poppy', 'cornflower', 'daisy', 'buttercup']

export interface Plant {
  kind: KindName
  x: number
  z: number
  moisture: number
  /** Light averaged over the last `T.lightMemory` seconds. */
  light: number
  /** 0 seed to 1 full bloom. Never goes down. */
  growth: number
  /** 0 to 1, how content it is right now. */
  comfort: number
  /** Comfort smoothed, for posture. */
  mood: number
  /** What it would most like changed, or null when content. */
  need: Need | null
  /** True while the breeze is on its flowers. */
  pollinating: boolean
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
  /** True while it is resting over the pond and drinking. */
  refilling: boolean
  breezing: boolean
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

export interface Controls {
  /** Where the player is pointing on the ground, or null to stay put. */
  target: { x: number; z: number } | null
  rain: boolean
  breeze?: boolean
  /** Desired spread, 0 to 1. Omit to leave it as it is. */
  spread?: number
}

export interface Hooks {
  onBloom?: (plant: Plant) => void
  onFullBloom?: () => void
  onSprout?: (flower: Wildflower) => void
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

/** True where nothing wild should take root: the bed, the pond, or off the lawn. */
export function unplantable(x: number, z: number) {
  const m = T.wild.margin
  const inBed = Math.abs(x) < T.bed.width / 2 + m && Math.abs(z) < T.bed.depth / 2 + m
  const inPond = Math.hypot(x - T.pond.x, z - T.pond.z) < T.pond.radius + m
  const offLawn = Math.abs(x) > T.wild.halfWidth || Math.abs(z) > T.wild.halfDepth
  return inBed || inPond || offLawn
}

export class Garden {
  readonly plants: Plant[] = []
  readonly cloud: Cloud
  readonly seeds: Seed[] = []
  readonly wildflowers: Wildflower[] = []
  time = 0
  fullBloom = false
  private seed = 12345

  constructor(private hooks: Hooks = {}) {
    const rows = T.layout.length
    T.layout.forEach((row, r) => {
      row.forEach((kind, c) => {
        this.plants.push({
          kind,
          x: (c - (row.length - 1) / 2) * T.spacing.x,
          z: (r - (rows - 1) / 2) * T.spacing.z,
          moisture: T.soil.start,
          light: 1,
          growth: 0,
          comfort: 1,
          mood: 1,
          need: null,
          pollinating: false,
          seedTimer: 0,
        })
      })
    })
    this.cloud = {
      x: T.pond.x,
      z: T.pond.z,
      vx: 0,
      vz: 0,
      water: T.cloud.startWater,
      capacity: 1,
      spread: T.cloud.startSpread,
      raining: false,
      refilling: false,
      breezing: false,
      windX: 1,
      windZ: 0,
    }
    for (const p of this.plants) this.assess(p)
  }

  /** Radius of the cloud's shade and rain on the ground right now. */
  get radius() {
    const c = this.cloud
    const { gathered, spreadBase, spreadPerCapacity, emptyShrink } = T.cloud.size
    const wide = spreadBase + spreadPerCapacity * (c.capacity - 1)
    const fill = c.water / c.capacity
    return lerp(gathered, wide, c.spread) * (1 - emptyShrink * (1 - fill))
  }

  /** Rain per unit area relative to a cloud of the reference size: wide is gentle. */
  get rainIntensity() {
    return (T.cloud.size.reference / this.radius) ** 2
  }

  /** Width of the shade's soft edge, which grows with the cloud. */
  get softEdge() {
    return T.cloud.softEdge * (this.radius / T.cloud.size.reference)
  }

  /** How much of the cloud is over a point: 1 under its middle, 0 clear of it. */
  coverage(x: number, z: number) {
    const d = Math.hypot(x - this.cloud.x, z - this.cloud.z)
    const r = this.radius
    const soft = this.softEdge
    return 1 - smoothstep(r - soft / 2, r + soft / 2, d)
  }

  /** Sunlight reaching a point on the ground. */
  lightAt(x: number, z: number) {
    return 1 - this.coverage(x, z) * (1 - T.cloud.shadeLight)
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

  get bloomed() {
    return this.plants.filter((p) => p.growth >= 1).length
  }

  update(dt: number, controls: Controls) {
    this.time += dt
    this.moveCloud(dt, controls)
    for (const p of this.plants) this.tend(p, dt)
    this.drift(dt)
    if (!this.fullBloom && this.plants.every((p) => p.growth >= 1)) {
      this.fullBloom = true
      this.hooks.onFullBloom?.()
    }
  }

  private moveCloud(dt: number, { target, rain, breeze = false, spread }: Controls) {
    const c = this.cloud
    const x0 = c.x
    const z0 = c.z
    if (target) {
      const tx = clamp(target.x, -T.yard.halfWidth, T.yard.halfWidth)
      const tz = clamp(target.z, -T.yard.halfDepth, T.yard.halfDepth)
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

    // Once it has run dry it needs a little in hand before it rains again,
    // or holding the button over an empty cloud would flicker rain on and off.
    c.raining = rain && c.water > (c.raining ? 0 : T.cloud.minToRain)
    if (c.raining) {
      c.water = Math.max(0, c.water - T.cloud.rainUse * dt)
      if (c.water === 0) c.raining = false
    }
    c.refilling = !c.raining && this.overPond() && c.water < c.capacity
    const refill = c.refilling ? T.cloud.pondRefill : c.raining ? 0 : T.cloud.passiveRefill
    c.water = Math.min(c.capacity, c.water + refill * dt)
  }

  private tend(p: Plant, dt: number) {
    const cover = this.coverage(p.x, p.z)
    const light = 1 - cover * (1 - T.cloud.shadeLight)
    const s = T.soil
    let dm = -(s.baseDry + s.sunDry * light) * dt
    if (this.cloud.raining) dm += s.rainRate * this.rainIntensity * cover * dt
    p.moisture = clamp(p.moisture + dm, 0, 1)
    p.light += (light - p.light) * (1 - Math.exp(-dt / T.lightMemory))

    this.assess(p)
    const before = p.growth
    const breeze = this.breezeAt(p.x, p.z)
    p.pollinating = breeze > 0.3 && p.growth >= T.stages.flowering && p.growth < 1
    // Moving air on open flowers sets fruit: a bonus, never a requirement.
    const boost = p.pollinating ? T.wind.pollinateBoost * breeze : 0
    p.growth = Math.min(1, p.growth + ((p.comfort * (1 + boost)) / T.secondsToBloom) * dt)
    p.mood += (p.comfort - p.mood) * (1 - Math.exp(-dt / T.moodLag))
    if (before < 1 && p.growth >= 1) {
      this.cloud.capacity = Math.min(T.cloud.maxCapacity, this.cloud.capacity + T.cloud.capacityPerBloom)
      this.hooks.onBloom?.(p)
    }

    // A plant in bloom lets seed go into the breeze.
    if (p.growth >= 1 && breeze > 0.3) {
      p.seedTimer -= dt
      if (p.seedTimer <= 0) {
        p.seedTimer = T.wind.seedEvery * (0.6 + this.random() * 0.8)
        this.release(p.x, p.z)
      }
    }
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
      if (unplantable(s.x, s.z) || this.wildflowers.length >= T.wild.max) continue
      const crowded = this.wildflowers.some((f) => Math.hypot(f.x - s.x, f.z - s.z) < T.wild.spacing)
      if (crowded) continue
      const flower = { x: s.x, z: s.z, kind: s.kind, growth: 0 }
      this.wildflowers.push(flower)
      this.hooks.onSprout?.(flower)
    }
    // Wildflowers look after themselves; rain just hurries them along.
    for (const f of this.wildflowers) {
      if (f.growth >= 1) continue
      const wet = this.cloud.raining ? this.coverage(f.x, f.z) : 0
      f.growth = Math.min(1, f.growth + ((1 + T.wild.rainBoost * wet) / T.wild.secondsToGrow) * dt)
    }
  }

  private assess(p: Plant) {
    const kind = T.kinds[p.kind]
    const lc = comfortIn(p.light, kind.light)
    const mc = comfortIn(p.moisture, kind.moisture)
    p.comfort = Math.min(lc, mc)
    if (p.comfort >= T.showNeedBelow) p.need = null
    else if (mc <= lc) p.need = p.moisture < kind.moisture[0] ? 'thirsty' : 'soggy'
    else p.need = p.light < kind.light[0] ? 'wants-sun' : 'wants-shade'
  }

  /** Deterministic, so a test sees the same seeds every run. */
  private random() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }
}
