/**
 * The garden: one bed, one cloud, the sun everywhere the cloud is not.
 *
 * Pure maths, no three.js. Coordinates are metres on the ground plane, x to
 * the right and z towards the viewer.
 */
import { T, type KindName } from '../tuning'

export type Need = 'thirsty' | 'soggy' | 'wants-sun' | 'wants-shade'
export type Stage = 'seed' | 'sprout' | 'leafy' | 'flowering' | 'bloom'

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
}

export interface Cloud {
  x: number
  z: number
  water: number
  raining: boolean
  /** True while it is resting over the pond and drinking. */
  refilling: boolean
}

export interface Controls {
  /** Where the player is pointing on the ground, or null to stay put. */
  target: { x: number; z: number } | null
  rain: boolean
}

export interface Hooks {
  onBloom?: (plant: Plant) => void
  onFullBloom?: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

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

export class Garden {
  readonly plants: Plant[] = []
  readonly cloud: Cloud
  time = 0
  fullBloom = false

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
        })
      })
    })
    this.cloud = {
      x: T.pond.x,
      z: T.pond.z,
      water: T.cloud.startWater,
      raining: false,
      refilling: false,
    }
    for (const p of this.plants) this.assess(p)
  }

  /** How much of the cloud is over a point: 1 under its middle, 0 clear of it. */
  coverage(x: number, z: number) {
    const d = Math.hypot(x - this.cloud.x, z - this.cloud.z)
    const { radius, softEdge } = T.cloud
    return 1 - smoothstep(radius - softEdge / 2, radius + softEdge / 2, d)
  }

  /** Sunlight reaching a point on the ground. */
  lightAt(x: number, z: number) {
    return 1 - this.coverage(x, z) * (1 - T.cloud.shadeLight)
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
    if (!this.fullBloom && this.plants.every((p) => p.growth >= 1)) {
      this.fullBloom = true
      this.hooks.onFullBloom?.()
    }
  }

  private moveCloud(dt: number, { target, rain }: Controls) {
    const c = this.cloud
    if (target) {
      const tx = clamp(target.x, -T.yard.halfWidth, T.yard.halfWidth)
      const tz = clamp(target.z, -T.yard.halfDepth, T.yard.halfDepth)
      const k = 1 - Math.exp(-T.cloud.followRate * dt)
      c.x += (tx - c.x) * k
      c.z += (tz - c.z) * k
    }
    // Once it has run dry it needs a little in hand before it rains again,
    // or holding the button over an empty cloud would flicker rain on and off.
    c.raining = rain && c.water > (c.raining ? 0 : T.cloud.minToRain)
    if (c.raining) {
      c.water = Math.max(0, c.water - T.cloud.rainUse * dt)
      if (c.water === 0) c.raining = false
    }
    c.refilling = !c.raining && this.overPond() && c.water < 1
    const refill = c.refilling ? T.cloud.pondRefill : c.raining ? 0 : T.cloud.passiveRefill
    c.water = Math.min(1, c.water + refill * dt)
  }

  private tend(p: Plant, dt: number) {
    const cover = this.coverage(p.x, p.z)
    const light = 1 - cover * (1 - T.cloud.shadeLight)
    const s = T.soil
    let dm = -(s.baseDry + s.sunDry * light) * dt
    if (this.cloud.raining) dm += s.rainRate * cover * dt
    p.moisture = clamp(p.moisture + dm, 0, 1)
    p.light += (light - p.light) * (1 - Math.exp(-dt / T.lightMemory))

    this.assess(p)
    const before = p.growth
    p.growth = Math.min(1, p.growth + (p.comfort / T.secondsToBloom) * dt)
    p.mood += (p.comfort - p.mood) * (1 - Math.exp(-dt / T.moodLag))
    if (before < 1 && p.growth >= 1) this.hooks.onBloom?.(p)
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
}
