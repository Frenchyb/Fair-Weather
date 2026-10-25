/**
 * Rose and Walter, who live in the house. They don't need the player, but
 * they notice the weather: tea on the patio in the sun, an umbrella (Rose)
 * or a grin at the sky (Walter) in a drizzle, inside to watch from the
 * window in a downpour, out on the porch for a storm, a lantern walk in the
 * fog, a snowman and a shovelled path in snow. Walter picks what the player
 * grows; Rose cuts flowers for the vase in the front window and does the
 * washing, which she rushes to bring in when rain starts.
 *
 * Each person works through a short queue of tasks. When nothing is queued
 * they look at the weather and plan the next thing; when the weather turns
 * (rain on the washing, a storm, a downpour, nightfall) the queue is dropped
 * and they deal with that first.
 *
 * Pure maths, no three.js.
 */
import { T, type KindName } from '../tuning'
import type { Climate } from './climate'
import type { Cloud, Plant } from './garden'
import type { Ground } from './ground'
import { dayProgress } from './sky'

/** What the garden looks like to the people in it. `Garden` satisfies this. */
export interface World {
  time: number
  daylight: number
  storming: boolean
  radius: number
  softEdge: number
  cloud: Cloud
  climate: Climate
  ground: Ground
  plants: Plant[]
  breezeAt(x: number, z: number): number
}

export type PersonId = 'rose' | 'walter'

/** What someone is doing, for the renderer's pose. */
export type Doing =
  | 'stand'
  | 'tea'
  | 'rain-smile'
  | 'porch'
  | 'pick'
  | 'cut'
  | 'peg'
  | 'unpeg'
  | 'feeder'
  | 'carrots'
  | 'tend'
  | 'check-sky'
  | 'snowman'
  | 'shovel'

export type Carry = null | 'basket' | 'umbrella' | 'lantern' | 'shovel' | 'cup' | 'harvest' | 'flowers' | 'carrots' | 'seed'

/** A thought bubble. */
export type Emote = 'happy' | 'tea' | 'surprised' | 'cold' | 'note'

export type PeopleSound = 'door' | 'peg' | 'unpeg' | 'cup' | 'shovel' | 'footsteps' | 'pat'

interface Go {
  go: { x: number; z: number }
  run?: boolean
  /** Pose while moving, e.g. shovelling as she goes. */
  as?: Doing
}
interface Do {
  doing: Doing
  for: number
  carry?: Carry
  emote?: Emote
  /** Called once when the task finishes. */
  done?: () => void
}
interface Enter {
  enter: number
  /** Watching the weather from the window while in. */
  window?: boolean
}
type Task = Go | Do | Enter

export interface Person {
  id: PersonId
  x: number
  z: number
  heading: number
  inside: boolean
  /** True while indoors watching from the front window. */
  atWindow: boolean
  doing: Doing
  /** 'walk', 'run' or null when standing still. */
  moving: 'walk' | 'run' | null
  carry: Carry
  /** What is in the harvest basket. */
  produce: KindName | null
  umbrella: boolean
  emote: Emote | null
  emoteLeft: number
  /** Seconds the current task has been running. */
  t: number
  queue: Task[]
  /** True when the queue is something the weather may interrupt freely. */
  idle: boolean
}

export interface WashItem {
  /** 0 dry to 1 dripping. */
  wet: number
  out: boolean
}

export interface Wash {
  items: WashItem[]
  /** Day number she last hung it out. */
  washedDay: number
  /** Left by the door on a grey morning, waiting for better weather. */
  basketAtDoor: boolean
  /** Seconds of rescue left once rain starts on the line, or 0. */
  rescueLeft: number
  rescuing: boolean
  collecting: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const P = T.people
const CROPS: KindName[] = ['tomato', 'lettuce', 'apple']
const FLOWERS: KindName[] = ['lavender', 'sunflower', 'moonflower']

/** Day number, counting from the first morning. */
export function dayNumber(time: number) {
  return Math.floor((time + T.day.start * T.day.length) / (T.day.length + T.day.night))
}

/** The point on the washing line where item `i` hangs. */
export function washSpot(i: number) {
  const W = T.wash
  const f = (i + 1) / (W.items + 1)
  return { x: W.x0 + (W.x1 - W.x0) * f, z: W.z }
}

export class People {
  readonly rose: Person
  readonly walter: Person
  readonly all: Person[]
  readonly wash: Wash
  /** Kinds of flower in the vase in the front window, oldest first. Kept for good. */
  readonly vase: KindName[] = []
  /** Everything Walter has brought in. */
  readonly pantry: Record<string, number> = { tomato: 0, lettuce: 0, apple: 0 }
  snowman = { x: P.snowman.x, z: P.snowman.z, size: 0 }
  /** When Rose last filled the bird feeder, and carrots Walter left by the burrow. */
  fedAt = -Infinity
  carrots = 0
  /** Loads of washing brought in dry, and whether a shower ever beat Rose to it. */
  dried = 0
  caughtOut = false
  private teaAt = -Infinity
  private fedDay = -1
  private carrotDay = -1
  private wasDownpour = false
  private wasStorm = false
  private wasNight = false
  private grinned = false

  constructor(
    private world: World,
    private sound: (s: PeopleSound) => void = () => {},
  ) {
    const person = (id: PersonId): Person => ({
      id,
      x: P.door.x,
      z: P.door.z,
      heading: 0,
      inside: true,
      atWindow: false,
      doing: 'stand',
      moving: null,
      carry: null,
      produce: null,
      umbrella: false,
      emote: null,
      emoteLeft: 0,
      t: 0,
      queue: [],
      idle: true,
    })
    this.rose = person('rose')
    this.walter = person('walter')
    this.all = [this.rose, this.walter]
    this.wash = {
      items: Array.from({ length: T.wash.items }, () => ({ wet: 0, out: false })),
      washedDay: -1,
      basketAtDoor: false,
      rescueLeft: 0,
      rescuing: false,
      collecting: false,
    }
  }

  /** How hard it is raining on a point: the day's rain, plus the player's cloud as a drizzle. */
  rainAt(x: number, z: number) {
    const w = this.world
    const c = w.cloud
    let r = w.climate.rainfall
    if (w.storming && Math.hypot(x - c.x, z - c.z) < T.storm.radius) r = Math.max(r, 1)
    if (c.raining && !w.climate.dormant && Math.hypot(x - c.x, z - c.z) < w.radius + w.softEdge / 2) r = Math.max(r, 0.4)
    return r
  }

  update(dt: number) {
    const w = this.world
    this.weatherTurns()
    this.laundry(dt)
    for (const p of this.all) {
      this.react(p, dt)
      if (p.queue.length === 0) this.plan(p)
      this.step(p, dt)
      if (p.emoteLeft > 0 && (p.emoteLeft -= dt) <= 0) p.emote = null
    }
    // The snowman lasts as long as the snow round it.
    if (this.snowman.size > 0 && w.ground.snowAt(this.snowman.x, this.snowman.z) < 0.15) {
      this.snowman.size = Math.max(0, this.snowman.size - dt / 40)
    }
    // Rabbits slowly eat the carrots.
    if (this.carrots > 0 && w.daylight > 0.3) this.carrots = Math.max(0, this.carrots - dt / 90)
  }

  // ---- Big changes in the weather drop whatever they were doing.

  private weatherTurns() {
    const w = this.world
    const night = w.daylight < P.nightBelow
    const downpour = w.climate.rainfall > P.downpour
    const storm = w.storming
    if ((night && !this.wasNight) || (downpour && !this.wasDownpour) || (storm && !this.wasStorm)) {
      for (const p of this.all) if (!(p.id === 'rose' && this.wash.rescuing)) this.drop(p)
      this.wash.collecting = false
    }
    this.wasNight = night
    this.wasDownpour = downpour
    this.wasStorm = storm
  }

  private drop(p: Person) {
    p.queue = []
    p.doing = 'stand'
    p.t = 0
  }

  /** Rain on someone outside: Rose puts up her umbrella; Walter stops and grins at the sky. */
  private react(p: Person, dt: number) {
    void dt
    const wet = !p.inside && this.rainAt(p.x, p.z) > P.drizzle
    if (p.id === 'rose') {
      p.umbrella = wet && !this.wash.rescuing && p.carry !== 'basket'
      return
    }
    // Once per shower.
    if (wet && p.idle && !this.grinned) {
      this.grinned = true
      this.drop(p)
      p.queue.push({ doing: 'rain-smile', for: 4, emote: 'happy' })
    } else if (!wet && !p.inside) {
      this.grinned = false
    }
  }

  // ---- Deciding what to do next.

  private plan(p: Person) {
    const w = this.world
    const cl = w.climate
    p.idle = true
    if (w.daylight < P.nightBelow) return this.goIn(p, 20)
    if (w.storming) {
      const spot = P.porch[p.id === 'rose' ? 0 : 1]
      p.idle = false
      return this.queue(p, { go: spot, run: true }, { doing: 'porch', for: 15 })
    }
    if (cl.rainfall > P.downpour) return this.goIn(p, 15, true)

    if (p.id === 'rose' && this.planWash(p)) return
    const snowy = w.ground.snowCover > 0.3 && w.daylight > 0.4
    if (snowy) {
      if (p.id === 'walter' && this.snowman.size < 1) return this.buildSnowman(p)
      if (p.id === 'rose' && this.pathSnowy()) return this.shovel(p)
    }
    if (cl.fogginess > 0.5 && w.daylight > 0.3) return this.lanternWalk(p)
    if (cl.dormant && w.daylight > 0.4) {
      const today = dayNumber(w.time)
      if (p.id === 'rose' && this.fedDay !== today) return this.fillFeeder(p, today)
      if (p.id === 'walter' && this.carrotDay !== today) return this.leaveCarrots(p, today)
    }
    if (p.id === 'walter') {
      const crop = this.ripe(CROPS, p)
      if (crop) return this.pick(p, crop)
    } else {
      const flower = this.ripe(FLOWERS, p)
      if (flower) return this.cut(p, flower)
    }
    // Tea is for two: only when the other one is free too.
    const sunny = cl.skyLight > 0.85 && cl.rainfall < 0.05 && w.daylight > 0.6 && !cl.dormant
    const other = this.all.find((q) => q !== p)!
    const free = other.idle && !(other.id === 'rose' && (this.wash.rescuing || this.wash.collecting))
    if (sunny && free && dayProgress(w.time) < 0.75 && w.time - this.teaAt > P.teaEvery) {
      this.teaAt = w.time
      this.tea(p)
      this.tea(other)
      return
    }
    // Pottering: look over a plant, or a while indoors.
    if (this.random() < 0.6) {
      const mine = w.plants.filter((pl) => (p.id === 'walter' ? CROPS : FLOWERS).includes(pl.kind) || pl.kind === 'fern')
      const pl = mine[Math.floor(this.random() * mine.length)]
      if (pl) return this.queue(p, { go: this.beside(pl) }, { doing: 'tend', for: 4 + this.random() * 4 })
    }
    this.goIn(p, 12 + this.random() * 20)
  }

  private queue(p: Person, ...tasks: Task[]) {
    if (p.inside) {
      p.inside = false
      p.atWindow = false
      this.sound('door')
    }
    p.queue.push(...tasks)
  }

  private goIn(p: Person, seconds: number, window = false) {
    if (p.inside) {
      p.queue.push({ enter: seconds, window })
      return
    }
    p.queue.push({ go: P.door, run: window }, { enter: seconds, window })
  }

  /** Something in `kinds` ready to pick, not picked lately. Nearest first. */
  private ripe(kinds: KindName[], p: Person) {
    const w = this.world
    let best: Plant | null = null
    let bestD = Infinity
    for (const pl of w.plants) {
      if (!kinds.includes(pl.kind) || pl.growth < 1 || w.time - pl.picked < P.regrow) continue
      const d = Math.hypot(pl.x - p.x, pl.z - p.z)
      if (d < bestD) {
        best = pl
        bestD = d
      }
    }
    return best
  }

  /** Where to stand to reach a plant: outside the bed's edge, or beside a tree. */
  private beside(pl: Plant) {
    if (pl.inBed) return { x: pl.x, z: Math.sign(pl.z || 1) * (T.bed.depth / 2 + 0.35) }
    const r = pl.kind === 'apple' ? 1.1 : 0.55
    return { x: pl.x, z: pl.z + r }
  }

  private pick(p: Person, pl: Plant) {
    pl.picked = this.world.time
    this.queue(
      p,
      { go: this.beside(pl) },
      {
        doing: 'pick',
        for: 3,
        carry: 'basket',
        done: () => {
          p.carry = 'harvest'
          p.produce = pl.kind
        },
      },
      { go: P.door },
      {
        doing: 'stand',
        for: 0.1,
        done: () => {
          this.pantry[pl.kind] = (this.pantry[pl.kind] ?? 0) + 1
          p.carry = null
          p.produce = null
        },
      },
      { enter: 6 },
    )
  }

  private cut(p: Person, pl: Plant) {
    pl.picked = this.world.time
    this.queue(
      p,
      { go: this.beside(pl) },
      { doing: 'cut', for: 2.5, done: () => (p.carry = 'flowers') },
      { go: P.door },
      {
        doing: 'stand',
        for: 0.1,
        emote: 'happy',
        done: () => {
          this.vase.push(pl.kind)
          if (this.vase.length > P.vase) this.vase.shift()
          p.carry = null
        },
      },
      { enter: 8 },
    )
  }

  private tea(p: Person) {
    this.drop(p)
    const seat = P.seats[p.id === 'rose' ? 0 : 1]
    this.queue(p, { go: seat }, { doing: 'tea', for: P.teaFor, carry: 'cup', emote: 'tea', done: () => (p.carry = null) })
    this.sound('cup')
  }

  private buildSnowman(p: Person) {
    const s = this.snowman
    const roll = () => {
      s.size = Math.min(1, s.size + 0.25)
      this.sound('pat')
    }
    this.queue(p, { go: { x: s.x + 0.7, z: s.z } }, { doing: 'snowman', for: 4, done: roll }, { doing: 'snowman', for: 4, done: roll })
    if (s.size >= 0.5) p.queue.push({ doing: 'stand', for: 3, emote: 'happy' })
  }

  private pathSnowy() {
    const g = this.world.ground
    return P.shovelPath.some((pt) => g.snowAt(pt.x, pt.z) > 0.15)
  }

  private shovel(p: Person) {
    const tasks: Task[] = P.shovelPath.map((pt) => ({ go: pt, as: 'shovel' as Doing }))
    this.queue(p, { doing: 'stand', for: 0.5, carry: 'shovel' }, ...tasks, { go: P.door }, { enter: 10 })
  }

  private lanternWalk(p: Person) {
    const loop = p.id === 'rose' ? P.lanternLoop : P.lanternLoop.map((pt) => ({ x: pt.x + 0.7, z: pt.z + 0.4 }))
    this.queue(
      p,
      { doing: 'stand', for: p.id === 'rose' ? 0.5 : 1.5, carry: p.id === 'rose' ? 'lantern' : null },
      ...loop.map((pt) => ({ go: pt })),
      { go: P.door },
      { enter: 15 },
    )
  }

  private fillFeeder(p: Person, today: number) {
    this.fedDay = today
    this.queue(
      p,
      { go: { x: P.feeder.x + 0.5, z: P.feeder.z + 0.3 } },
      { doing: 'feeder', for: 3, carry: 'seed', done: () => ((this.fedAt = this.world.time), (p.carry = null)) },
      { go: P.door },
      { enter: 10 },
    )
  }

  private leaveCarrots(p: Person, today: number) {
    this.carrotDay = today
    const B = T.habitat.burrow
    this.queue(
      p,
      { go: { x: B.x - 2.2, z: B.z } },
      { doing: 'carrots', for: 2, carry: 'carrots', done: () => ((this.carrots = 3), (p.carry = null)) },
      { go: P.door },
      { enter: 10 },
    )
  }

  // ---- The washing.

  /** Rose's washing plans, when it's time for them. True if something was queued. */
  private planWash(p: Person) {
    const w = this.world
    const W = this.wash
    const cl = w.climate
    const out = W.items.filter((i) => i.out)
    // Dry and nothing falling on it: bring it in, folded, pleased.
    if (out.length && out.every((i) => i.wet < 0.03) && !this.rainOnLine()) {
      W.collecting = true
      p.idle = false
      this.queue(
        p,
        ...this.unpegAll(false),
        { doing: 'stand', for: 1, emote: 'happy', done: () => ((W.collecting = false), this.dried++) },
        { go: P.door },
        { enter: 8 },
      )
      return true
    }
    if (out.length) return false
    const morning = w.daylight > 0.6 && dayProgress(w.time) < 0.45
    if (!morning || W.washedDay === dayNumber(w.time) || cl.dormant) return false
    const fine = cl.skyLight > 0.85 && cl.rainfall < 0.03 && !this.rainOnLine()
    if (fine) {
      W.washedDay = dayNumber(w.time)
      W.basketAtDoor = false
      p.idle = false
      const pegs: Task[] = W.items.map((item, i) => [
        { go: { x: washSpot(i).x, z: T.wash.z + 0.35 } },
        {
          doing: 'peg' as Doing,
          for: T.wash.pegTime,
          carry: 'basket' as Carry,
          done: () => {
            item.out = true
            item.wet = 1
            this.sound('peg')
          },
        },
      ]).flat()
      this.queue(p, { doing: 'stand', for: 0.5, carry: 'basket' }, ...pegs, { go: P.door }, { enter: 10 })
      p.queue.push({ doing: 'stand', for: 0, done: () => (p.carry = null) })
      return true
    }
    // A grey morning: she looks at the sky and leaves the basket by the door.
    if (!W.basketAtDoor && (cl.mix.overcast + cl.mix.fog + cl.mix.rain > 0.5)) {
      W.basketAtDoor = true
      this.queue(p, { doing: 'check-sky', for: 3, carry: 'basket', done: () => (p.carry = null) }, { enter: 15 })
      return true
    }
    return false
  }

  private unpegAll(run: boolean): Task[] {
    const W = this.wash
    // Nearest the door first.
    return W.items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.out)
      .sort((a, b) => b.i - a.i)
      .flatMap(({ item, i }) => [
        { go: { x: washSpot(i).x, z: T.wash.z + 0.35 }, run },
        {
          doing: 'unpeg' as Doing,
          for: run ? T.wash.pegTime * 0.8 : T.wash.pegTime,
          carry: 'basket' as Carry,
          done: () => {
            item.out = false
            this.sound('unpeg')
          },
        },
      ])
  }

  private rainOnLine() {
    return this.wash.items.some((_, i) => {
      const s = washSpot(i)
      return this.rainAt(s.x, s.z) > P.drizzle
    })
  }

  /** The wash dries in sun and breeze, gets soaked in rain, and Rose dashes out to save it. */
  private laundry(dt: number) {
    const w = this.world
    const W = this.wash
    const rose = this.rose
    W.items.forEach((item, i) => {
      if (!item.out) return
      const s = washSpot(i)
      if (this.rainAt(s.x, s.z) > P.drizzle) item.wet = 1
      else {
        const sun = w.daylight * w.climate.skyLight
        const breeze = Math.max(w.breezeAt(s.x, s.z + 0.5), w.storming ? 1 : 0)
        item.wet = clamp(item.wet - (T.wash.sunDry * sun + T.wash.breezeDry * breeze) * dt, 0, 1)
      }
    })
    const out = W.items.some((i) => i.out)
    const raining = out && this.rainOnLine()
    if (raining && !W.rescuing && W.rescueLeft === 0 && w.daylight > P.nightBelow) {
      // Rain on the washing! She drops everything and runs.
      W.rescuing = true
      W.rescueLeft = T.wash.rescueFor
      this.drop(rose)
      rose.idle = false
      rose.emote = 'surprised'
      rose.emoteLeft = 2.5
      this.queue(rose, ...this.unpegAll(true), { go: P.door, run: true }, { enter: 12 })
      rose.queue.push({ doing: 'stand', for: 0, done: () => (W.rescuing = false) })
    }
    if (W.rescuing) {
      W.rescueLeft = Math.max(0.0001, W.rescueLeft - dt)
      if (W.rescueLeft <= 0.0001) {
        // Too wet to stay out: the rest can hang there dripping until the sun is back.
        W.rescuing = false
        if (W.items.some((i) => i.out)) this.caughtOut = true
        this.drop(rose)
        rose.queue.push({ go: P.door, run: true }, { enter: 12 })
      }
    }
    // A fresh shower may start another rescue once this one is over and the line has had a break.
    if (!raining && !W.rescuing) W.rescueLeft = 0
  }

  // ---- Carrying out tasks.

  private step(p: Person, dt: number) {
    const task = p.queue[0]
    p.moving = null
    if (!task) return
    p.t += dt
    if ('go' in task) {
      p.inside = false
      p.atWindow = false
      const dx = task.go.x - p.x
      const dz = task.go.z - p.z
      const d = Math.hypot(dx, dz)
      const speed = task.run ? P.run : task.as === 'shovel' ? P.walk * 0.45 : P.walk
      p.doing = task.as ?? 'stand'
      if (task.as === 'shovel') this.world.ground.clearSnow(p.x, p.z, 0.55)
      if (d < 0.05) return this.next(p)
      // Round the bed and the pond, not through them.
      const way = detour(p.x, p.z, task.go.x, task.go.z)
      const tx = way ? way.x - p.x : dx
      const tz = way ? way.z - p.z : dz
      const td = Math.hypot(tx, tz)
      const s = Math.min(td, speed * dt)
      p.x += (tx / td) * s
      p.z += (tz / td) * s
      p.heading = Math.atan2(tx, tz)
      p.moving = task.run ? 'run' : 'walk'
      if (task.run && Math.random() < dt * 3) this.sound('footsteps')
      if (task.as === 'shovel' && Math.random() < dt * 0.8) this.sound('shovel')
    } else if ('doing' in task) {
      if (p.t <= dt) {
        p.doing = task.doing
        if (task.carry !== undefined) p.carry = task.carry
        if (task.emote) {
          p.emote = task.emote
          p.emoteLeft = Math.min(task.for, 4)
        }
      }
      if (task.doing === 'tea' || task.doing === 'porch') {
        // Face the garden.
        p.heading = 0
      }
      if (p.t >= task.for) {
        task.done?.()
        this.next(p)
      }
    } else {
      if (!p.inside) {
        p.inside = true
        p.x = P.door.x
        p.z = P.door.z
        p.umbrella = false
        p.carry = null
        p.produce = null
        this.sound('door')
      }
      p.atWindow = !!task.window
      p.doing = 'stand'
      if (p.t >= task.enter) this.next(p)
    }
  }

  private next(p: Person) {
    p.queue.shift()
    p.t = 0
  }

  private seed = 777
  private random() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }
}

/** If the straight line to (tx, tz) crosses the bed or the pond, a corner to go round first. */
export function detour(x: number, z: number, tx: number, tz: number) {
  if (clear(x, z, tx, tz)) return null
  const bx = T.bed.width / 2 + 0.7
  const bz = T.bed.depth / 2 + 0.7
  const pr = T.pond.radius + 0.9
  const corners = [
    { x: bx, z: bz },
    { x: -bx, z: bz },
    { x: bx, z: -bz },
    { x: -bx, z: -bz },
    { x: T.pond.x + pr, z: T.pond.z },
    { x: T.pond.x - pr, z: T.pond.z },
    { x: T.pond.x, z: T.pond.z + pr },
    { x: T.pond.x, z: T.pond.z - pr },
  ]
  let best: { x: number; z: number } | null = null
  let bestD = Infinity
  for (const c of corners) {
    if (Math.hypot(c.x - x, c.z - z) < 0.1 || !clear(x, z, c.x, c.z)) continue
    const d = Math.hypot(c.x - x, c.z - z) + Math.hypot(tx - c.x, tz - c.z) * (clear(c.x, c.z, tx, tz) ? 1 : 1.5)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

function blocked(x: number, z: number) {
  return (
    (Math.abs(x) < T.bed.width / 2 + 0.25 && Math.abs(z) < T.bed.depth / 2 + 0.25) ||
    Math.hypot(x - T.pond.x, z - T.pond.z) < T.pond.radius + 0.3
  )
}

function clear(x0: number, z0: number, x1: number, z1: number) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2)
  for (let i = 1; i < n; i++) {
    const t = i / n
    if (blocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false
  }
  return true
}
