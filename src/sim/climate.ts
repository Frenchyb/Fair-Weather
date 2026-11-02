/**
 * The weather over the whole garden, and the turning of the seasons.
 *
 * Left to itself the climate changes on its own: a clear morning clouds over,
 * a rainy spell passes, spring gives way to summer. The player can pin either
 * one (a foggy day, say, or winter) and let go again with "auto".
 *
 * Changes never snap: `mix` and `look` ease from one state into the next, and
 * everything downstream (light, rain, how fast things grow) reads the blend.
 *
 * Pure maths, no three.js.
 */
import { T } from '../tuning'

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'fog' | 'snow'
export const WEATHERS: WeatherKind[] = ['clear', 'overcast', 'rain', 'fog', 'snow']
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

/** A cloud drifting high over the garden on the prevailing wind. */
export interface SkyCloud {
  x: number
  z: number
  /** Radius of its shade on the ground. */
  r: number
  /** Height it floats at, for drawing. */
  y: number
  /** 0 white to 1 rain-dark. */
  dark: number
  /** 0 to 1 as it forms or clears, so clouds never pop in or out. */
  fade: number
  leaving: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

function blank<K extends string>(keys: readonly K[], on: K): Record<K, number> {
  const r = {} as Record<K, number>
  for (const k of keys) r[k] = k === on ? 1 : 0
  return r
}

export class Climate {
  weather: WeatherKind = 'clear'
  weatherPinned = false
  /** Seconds until the weather changes on its own. */
  weatherLeft: number
  /** How much of each kind of weather is in the air right now; sums to 1. */
  readonly mix: Record<WeatherKind, number> = blank(WEATHERS, 'clear')
  season: Season = 'spring'
  seasonPinned = false
  /** Seconds into the current season. */
  seasonAge = 0
  /** How far the garden looks like each season right now; sums to 1. */
  readonly look: Record<Season, number> = blank(SEASONS, 'spring')
  /** The prevailing wind the drifting clouds ride on (unit vector). */
  windX = 0.94
  windZ = 0.34
  readonly clouds: SkyCloud[] = []
  /** Every season seen so far. */
  readonly seen = new Set<Season>(['spring'])

  /** `still`: clear summer for good, with no drifting clouds. For tests. */
  constructor(
    private random: () => number,
    private still = false,
  ) {
    this.weatherLeft = this.span()
    if (still) {
      this.weatherPinned = this.seasonPinned = true
      this.season = 'summer'
      this.look.spring = 0
      this.look.summer = 1
      return
    }
    // Start with the sky already dotted with a few fair-weather clouds.
    for (let i = 0; i < T.climate.clouds.clear; i++) this.clouds.push(this.newCloud(this.randomX(), 1))
  }

  /** Sunlight let through by the day's weather, 0 to 1. */
  get skyLight() {
    let l = 0
    for (const k of WEATHERS) l += this.mix[k] * T.climate.light[k]
    return l
  }

  /** 0 to 1: how hard it is raining over the whole garden. */
  get rainfall() {
    return this.mix.rain
  }

  get snowfall() {
    return this.mix.snow
  }

  get fogginess() {
    return this.mix.fog
  }

  /** Growth speed for the season, blended as one turns into the next. */
  get growth() {
    if (this.dormant) return 0
    let g = 0
    for (const s of SEASONS) g += this.look[s] * T.seasons.growth[s]
    return g
  }

  get drying() {
    let d = 0
    for (const s of SEASONS) d += this.look[s] * T.seasons.drying[s]
    return d
  }

  /** True once winter has properly set in: plants rest, the pond freezes. */
  get dormant() {
    return this.look.winter > 0.5
  }

  /** Light let through by the drifting clouds at a point: they only cast clear shade on a clear day. */
  shadeAt(x: number, z: number) {
    const strength = T.climate.cloudShade * this.mix.clear
    if (strength <= 0) return 1
    let lit = 1
    for (const c of this.clouds) {
      const d = Math.hypot(x - c.x, z - c.z)
      const cover = (1 - smoothstep(c.r * 0.6, c.r, d)) * c.fade
      lit = Math.min(lit, 1 - cover * strength)
    }
    return lit
  }

  /** Pin the weather, or hand it back to the climate with 'auto'. */
  setWeather(w: WeatherKind | 'auto') {
    if (w === 'auto') {
      this.weatherPinned = false
      this.weatherLeft = Math.min(this.weatherLeft, 30)
      return
    }
    this.weatherPinned = true
    this.weather = w
  }

  setSeason(s: Season | 'auto') {
    if (s === 'auto') {
      this.seasonPinned = false
      return
    }
    this.seasonPinned = true
    if (s !== this.season) this.enterSeason(s)
  }

  update(dt: number) {
    const C = T.climate
    if (!this.weatherPinned) {
      this.weatherLeft -= dt
      if (this.weatherLeft <= 0) {
        this.weather = this.pick(C.tends[this.season])
        this.weatherLeft = this.span()
      }
    }
    if (!this.seasonPinned) {
      this.seasonAge += dt
      if (this.seasonAge >= T.seasons.length) {
        this.enterSeason(SEASONS[(SEASONS.indexOf(this.season) + 1) % SEASONS.length])
      }
    }
    if (!this.weatherPinned) this.suitSeason()
    ease(this.mix, WEATHERS, this.weather, dt / C.blend)
    ease(this.look, SEASONS, this.season, dt / T.seasons.blend)
    this.driftClouds(dt)
  }

  private enterSeason(s: Season) {
    this.season = s
    this.seasonAge = 0
    this.seen.add(s)
  }

  /** Snow belongs to winter and rain to the rest of the year, when left to itself. */
  private suitSeason() {
    if (this.season === 'winter' && this.weather === 'rain') this.weather = 'snow'
    if (this.season !== 'winter' && this.weather === 'snow') this.weather = 'rain'
  }

  private pick(weights: Record<WeatherKind, number>): WeatherKind {
    let total = 0
    for (const k of WEATHERS) total += weights[k]
    let r = this.random() * total
    for (const k of WEATHERS) {
      r -= weights[k]
      if (r <= 0 && weights[k] > 0) return k
    }
    return 'clear'
  }

  private span() {
    const [a, b] = T.climate.changeEvery
    return a + (b - a) * this.random()
  }

  /** Clouds ride in on the wind from beyond the garden, and more of them on a grey day. */
  private driftClouds(dt: number) {
    if (this.still) return
    const C = T.climate.clouds
    let want = 0
    for (const k of WEATHERS) want += this.mix[k] * C[k]
    const target = Math.round(want)
    const dark = this.mix.overcast * 0.45 + this.mix.rain * 0.85 + this.mix.snow * 0.5
    const live = this.clouds.filter((c) => !c.leaving)
    if (live.length < target) this.clouds.push(this.newCloud(this.randomX(), 0))
    else if (live.length > target) live[0].leaving = true
    const v = C.speed * dt
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]
      c.x += this.windX * v
      c.z += this.windZ * v
      c.dark += (dark - c.dark) * Math.min(1, dt / 4)
      c.fade = clamp(c.fade + (c.leaving ? -dt / 8 : dt / 8), 0, 1)
      const gone = c.x > T.yard.x1 + 60 || c.z > T.yard.z1 + 50
      if (gone || (c.leaving && c.fade === 0)) {
        this.clouds.splice(i, 1)
        // A cloud that blew away is replaced by one coming in from upwind.
        if (gone && !c.leaving) this.clouds.push(this.newCloud(T.yard.x0 - 40 - this.random() * 20, 1))
      }
    }
  }

  private randomX() {
    return T.yard.x0 - 40 + this.random() * (T.yard.x1 - T.yard.x0 + 80)
  }

  private newCloud(x: number, fade: number): SkyCloud {
    const [h0, h1] = T.climate.clouds.height
    return {
      x,
      z: T.yard.z0 - 30 + this.random() * (T.yard.z1 - T.yard.z0 + 40),
      r: 5 + this.random() * 6,
      y: h0 + this.random() * (h1 - h0),
      dark: 0,
      fade,
      leaving: false,
    }
  }
}

/** Ease a blend towards one key, keeping it summing to 1. */
function ease<K extends string>(blend: Record<K, number>, keys: readonly K[], on: K, k: number) {
  const f = Math.min(1, k)
  for (const key of keys) blend[key] += ((key === on ? 1 : 0) - blend[key]) * f
}
