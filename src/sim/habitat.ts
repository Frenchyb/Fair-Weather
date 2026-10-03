/**
 * The animals that live in the garden. Each kind has a home and a routine,
 * and the weather changes what they do: rabbits duck into the burrow in the
 * rain, birds huddle in the nest in the oak, deer shelter under the trees,
 * frogs come out to croak. Each spring the garden can raise young if the
 * player has looked after it: kits on a lush lawn, chicks in the nest, a
 * fawn, tadpoles after a wet spring, a second hive once there are flowers
 * enough. Squirrels bury acorns in autumn and dig them up in winter; one they
 * forget becomes a sapling.
 *
 * Nothing ever leaves for good. Animals only hide and come back.
 *
 * The state here says how many of each live here and what they are up to;
 * the renderer decides exactly where each one is. Pure maths, no three.js.
 */
import { T } from '../tuning'
import type { Climate, Season } from './climate'
import { dayProgress } from './sky'

export type RabbitMode = 'graze' | 'burrow' | 'peek' | 'near'
export type BirdMode = 'forage' | 'bathe' | 'nest' | 'feeder' | 'quiet'
export type NestStage = 'empty' | 'eggs' | 'chicks' | 'fledglings'
export type DeerMode = 'rest' | 'shelter' | 'graze' | 'browse'
export type FrogMode = 'bask' | 'croak' | 'chorus' | 'hidden' | 'asleep'
export type Spawn = 'none' | 'spawn' | 'tadpoles' | 'froglets'
export type BeeMode = 'busy' | 'hive' | 'asleep'
export type HedgehogMode = 'asleep' | 'out' | 'hunting' | 'hibernating'
export type SquirrelMode = 'chase' | 'shelter' | 'bury' | 'dig'

export interface Spot {
  x: number
  z: number
}

export interface Sapling extends Spot {
  growth: number
}

/** What the habitat sees of the garden each tick. */
export interface Surroundings {
  time: number
  daylight: number
  climate: Climate
  greenShare: number
  /** Average surface water over the lawn, 0 to 1. */
  wetness: number
  snowCover: number
  storming: boolean
  rainOnPond: boolean
  /** Plants and wildflowers in bloom. */
  blooms: number
  /** Seconds since Rose last filled the bird feeder. */
  sinceFed: number
  /** True if this spot is open lawn, for a buried acorn. */
  lawnAt: (x: number, z: number) => boolean
}

export class Habitat {
  readonly rabbits = { adults: 2, kits: 0, kitAge: 0, mode: 'peek' as RabbitMode }
  readonly birds = { adults: 3, mode: 'forage' as BirdMode, nest: 'empty' as NestStage, nestAge: 0 }
  readonly deer = { adults: 2, fawns: 0, fawnAge: 0, mode: 'rest' as DeerMode }
  readonly frogs = { adults: 2, mode: 'hidden' as FrogMode, spawn: 'none' as Spawn, spawnAge: 0, springRain: 0 }
  readonly bees = { hives: 1, mode: 'busy' as BeeMode }
  readonly hedgehog = { mode: 'asleep' as HedgehogMode }
  readonly squirrels = { count: 2, mode: 'chase' as SquirrelMode, caches: [] as Spot[], saplings: [] as Sapling[] }
  /** Springs seen since the start; young are raised once a year. */
  year = 0
  private bred = { rabbits: -1, birds: -1, deer: -1, frogs: -1 }
  private season: Season | null = null
  private clock = 0
  private buryClock = 0
  private digClock = 0
  /** Seconds since rain last fell, for the hedgehog's slug hunt. */
  private sinceRain = Infinity

  constructor(private random: () => number) {}

  update(dt: number, s: Surroundings) {
    this.clock += dt
    if (this.clock < T.habitat.tick) return
    const step = this.clock
    this.clock = 0
    const cl = s.climate
    if (this.season !== cl.season) {
      if (this.season === 'winter' && cl.season === 'spring') this.newYear()
      this.season = cl.season
    }
    this.sinceRain = cl.rainfall > 0.2 || s.storming ? 0 : this.sinceRain + step
    this.updateRabbits(step, s)
    this.updateBirds(step, s)
    this.updateDeer(step, s)
    this.updateFrogs(step, s)
    this.updateBees(s)
    this.updateHedgehog(s)
    this.updateSquirrels(step, s)
  }

  /** Spring is here: one forgotten acorn takes root. */
  private newYear() {
    this.year++
    const sq = this.squirrels
    if (sq.caches.length && sq.saplings.length < T.habitat.caps.saplings) {
      const c = sq.caches[Math.floor(this.random() * sq.caches.length)]
      sq.saplings.push({ x: c.x, z: c.z, growth: 0 })
    }
    sq.caches.length = 0
  }

  private weather(s: Surroundings) {
    const cl = s.climate
    const p = dayProgress(s.time)
    return {
      wet: cl.rainfall > 0.3 || s.storming,
      night: s.daylight < 0.05,
      twilight: s.daylight > 0.02 && (p < 0.16 || p > 0.84),
      fog: cl.fogginess > 0.5,
      cold: cl.dormant || s.snowCover > 0.3,
      spring: cl.look.spring > 0.5,
    }
  }

  private updateRabbits(dt: number, s: Surroundings) {
    const r = this.rabbits
    const w = this.weather(s)
    if (w.wet) r.mode = s.climate.rainfall < 0.6 && !s.storming && s.daylight > 0.3 ? 'peek' : 'burrow'
    else if (w.night) r.mode = 'burrow'
    else if (w.cold) r.mode = 'near'
    else if (w.twilight || s.greenShare > 0.08) r.mode = 'graze'
    else r.mode = 'peek'
    // Kits in spring, if the lawn is lush enough to feed them.
    if (w.spring && s.greenShare > 0.35 && r.kits === 0 && this.bred.rabbits !== this.year && r.adults < T.habitat.caps.rabbits) {
      this.bred.rabbits = this.year
      r.kits = 2
      r.kitAge = 0
    }
    if (r.kits > 0 && (r.kitAge += dt) >= T.habitat.growUp) {
      r.adults = Math.min(T.habitat.caps.rabbits, r.adults + r.kits)
      r.kits = 0
    }
  }

  private updateBirds(dt: number, s: Surroundings) {
    const b = this.birds
    const w = this.weather(s)
    if (w.wet || w.night) b.mode = 'nest'
    else if (w.cold) b.mode = s.sinceFed < 400 ? 'feeder' : 'quiet'
    else if (w.fog) b.mode = 'quiet'
    else b.mode = s.wetness > 0.08 && s.daylight > 0.6 ? 'bathe' : 'forage'
    // Eggs, then chicks, then fledglings learning to fly, then two more birds.
    const H = T.habitat
    if (b.nest === 'empty') {
      if (w.spring && s.greenShare > 0.2 && this.bred.birds !== this.year) {
        this.bred.birds = this.year
        b.nest = 'eggs'
        b.nestAge = 0
      }
    } else if ((b.nestAge += dt) >= H.nestStage) {
      b.nestAge = 0
      if (b.nest === 'eggs') b.nest = 'chicks'
      else if (b.nest === 'chicks') b.nest = 'fledglings'
      else {
        b.nest = 'empty'
        b.adults = Math.min(H.caps.birds, b.adults + 2)
      }
    }
  }

  private updateDeer(dt: number, s: Surroundings) {
    const d = this.deer
    const w = this.weather(s)
    if (w.wet) d.mode = 'shelter'
    else if (w.twilight || w.fog) d.mode = 'graze'
    else if (w.cold && !w.night) d.mode = 'browse'
    else d.mode = 'rest'
    // A fawn the spring after they have seen a winter here.
    if (w.spring && this.year >= 1 && this.bred.deer !== this.year && d.adults + d.fawns < T.habitat.caps.deer) {
      this.bred.deer = this.year
      d.fawns = 1
      d.fawnAge = 0
    }
    if (d.fawns > 0 && (d.fawnAge += dt) >= T.seasons.length * 2) {
      d.adults += d.fawns
      d.fawns = 0
    }
  }

  private updateFrogs(dt: number, s: Surroundings) {
    const f = this.frogs
    const w = this.weather(s)
    const cl = s.climate
    if (cl.dormant) f.mode = 'asleep'
    else if (cl.rainfall > 0.2 || s.rainOnPond || s.storming) f.mode = 'croak'
    else if ((w.twilight || w.night) && cl.look.winter < 0.2) f.mode = 'chorus'
    else if (s.daylight > 0.6 && cl.skyLight > 0.85) f.mode = 'bask'
    else f.mode = 'hidden'
    // Spawn after a wet spring: tadpoles, then froglets, then more frogs.
    const H = T.habitat
    if (w.spring) f.springRain += (cl.rainfall + (s.rainOnPond ? 0.5 : 0)) * dt
    if (f.spawn === 'none') {
      if (w.spring && f.springRain >= H.spawnRain && this.bred.frogs !== this.year) {
        this.bred.frogs = this.year
        f.spawn = 'spawn'
        f.spawnAge = 0
        f.springRain = 0
      }
    } else if ((f.spawnAge += dt) >= H.spawnStage) {
      f.spawnAge = 0
      if (f.spawn === 'spawn') f.spawn = 'tadpoles'
      else if (f.spawn === 'tadpoles') f.spawn = 'froglets'
      else {
        f.spawn = 'none'
        f.adults = Math.min(H.caps.frogs, f.adults + 3)
      }
    }
    if (!w.spring) f.springRain = 0
  }

  private updateBees(s: Surroundings) {
    const b = this.bees
    if (s.blooms >= T.habitat.secondHive) b.hives = 2
    const cl = s.climate
    if (cl.dormant || s.daylight < 0.2) b.mode = 'asleep'
    else if (cl.rainfall > 0.2 || s.storming || s.daylight < 0.45 || s.blooms === 0) b.mode = 'hive'
    else b.mode = 'busy'
  }

  private updateHedgehog(s: Surroundings) {
    const h = this.hedgehog
    if (s.climate.dormant) h.mode = 'hibernating'
    else if (s.daylight > 0.3) h.mode = 'asleep'
    else h.mode = this.sinceRain < 120 || s.wetness > 0.1 ? 'hunting' : 'out'
  }

  private updateSquirrels(dt: number, s: Surroundings) {
    const q = this.squirrels
    const w = this.weather(s)
    const cl = s.climate
    const H = T.habitat
    if (w.wet || w.night) q.mode = 'shelter'
    else if (cl.look.autumn > 0.5) q.mode = 'bury'
    else if (cl.dormant) q.mode = q.caches.length ? 'dig' : 'shelter'
    else q.mode = 'chase'
    if (q.mode === 'bury' && (this.buryClock += dt) >= H.buryEvery && q.caches.length < H.caps.caches) {
      this.buryClock = 0
      // Somewhere on the lawn near the oak or the orchard.
      for (let i = 0; i < 10; i++) {
        const near = this.random() < 0.5 ? T.oak : T.habitat.drey
        const x = near.x + (this.random() - 0.5) * 9
        const z = near.z + (this.random() - 0.5) * 7
        if (s.lawnAt(x, z)) {
          q.caches.push({ x, z })
          break
        }
      }
    }
    if (q.mode === 'dig' && (this.digClock += dt) >= H.digEvery && q.caches.length > 1) {
      // They find most of them. Not all.
      this.digClock = 0
      q.caches.splice(Math.floor(this.random() * q.caches.length), 1)
    }
    for (const sp of q.saplings) if (cl.growth > 0) sp.growth = Math.min(1, sp.growth + (dt * cl.growth) / H.saplingGrow)
  }
}
