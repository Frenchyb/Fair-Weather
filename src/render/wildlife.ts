/**
 * The animals that live in the garden, and the ducks and geese that visit.
 * The simulation says how many of each there are and what they are up to
 * (`garden.habitat`); this decides where each one is and how it moves:
 * rabbits hop out of the burrow to graze and dash back in the rain, birds
 * forage, bathe, huddle in the nest in the oak or come to the feeder, deer
 * lie in their bed of flattened grass beyond the back hedge and graze at
 * dusk, frogs bask on the pond and croak in the rain, bees work the flowers
 * from their hive, the hedgehog snuffles out of the leaf pile at night, and
 * squirrels chase, bury acorns and dig them up again.
 *
 * Their homes are always there, so you can see who lives here even when
 * nobody is out. Shy animals keep out from under the player's rain.
 * Reads the garden only.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { T } from '../tuning'
import * as C from './critters'
import type { Made } from './critters'
import type { Tracks } from './tracks'

type Mode = 'away' | 'arriving' | 'here' | 'leaving'

interface Critter {
  root: THREE.Group
  parts: Record<string, THREE.Object3D>
  mode: Mode
  x: number
  y: number
  z: number
  heading: number
  /** A move from (fx, fy, fz) to (tx, ty, tz) over `span` seconds, with an arc. */
  fx: number
  fy: number
  fz: number
  tx: number
  ty: number
  tz: number
  t: number
  span: number
  arc: number
  hops: number
  wait: number
  phase: number
  /** What it is doing now, so a change in the habitat's mode can redirect it. */
  task: string
}

const lerp = THREE.MathUtils.lerp
const smooth = (t: number) => t * t * (3 - 2 * t)
const H = T.habitat

function critter(made: Made, size: number, scene: THREE.Scene): Critter {
  made.root.visible = false
  made.root.scale.setScalar(size)
  scene.add(made.root)
  return {
    root: made.root,
    parts: made.parts,
    mode: 'away',
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    t: 1,
    span: 1,
    arc: 0,
    hops: 0,
    wait: 0,
    phase: Math.random() * 6,
    task: '',
  }
}

/** Set off for a point. `arc` lifts the middle of the path (a flight); `hops` bounces it. */
function go(c: Critter, tx: number, ty: number, tz: number, speed: number, arc = 0, hops = 0) {
  c.fx = c.x
  c.fy = c.y
  c.fz = c.z
  c.tx = tx
  c.ty = ty
  c.tz = tz
  c.t = 0
  const d = Math.hypot(tx - c.x, tz - c.z, (ty - c.y) * 0.5)
  c.span = Math.max(0.2, d / speed)
  c.arc = arc
  c.hops = hops ? Math.max(1, Math.round(d / hops)) : 0
  if (Math.hypot(tx - c.x, tz - c.z) > 0.01) c.heading = Math.atan2(tx - c.x, tz - c.z)
}

/** Advance a move; true while still under way. */
function advance(c: Critter, dt: number, flying = false) {
  if (c.t >= 1) return false
  c.t = Math.min(1, c.t + dt / c.span)
  const s = flying ? smooth(c.t) : c.t
  c.x = lerp(c.fx, c.tx, s)
  c.z = lerp(c.fz, c.tz, s)
  c.y = lerp(c.fy, c.ty, s) + Math.sin(c.t * Math.PI) * c.arc
  if (c.hops) c.y += Math.abs(Math.sin(c.t * c.hops * Math.PI)) * 0.1
  return true
}

function place(c: Critter) {
  c.root.position.set(c.x, c.y, c.z)
  c.root.rotation.y = c.heading
}

const NEST = { x: T.oak.x - 1.4, y: 3.0, z: T.oak.z + 1.5 }
const BATH = { x: 4.2, y: 0.93, z: 5.2 }
const MOUTH = { x: H.burrow.x - 0.55, z: H.burrow.z }
const BACK_RAIL = T.yard.z0 - 0.5
const SPAWN_AT = { x: T.pond.x + 0.9, z: T.pond.z + 0.7 }

export class WildlifeView {
  /** Sounds the audio might want: 'thump', 'snort', 'chatter', 'snuffle', 'cheep', 'flutter', 'honk', 'quack'. */
  readonly events: string[] = []
  private rabbits: Critter[] = []
  private birds: Critter[] = []
  private fledglings: Critter[] = []
  private deer: Critter[] = []
  private frogs: Critter[] = []
  private froglets: Critter[] = []
  private hedgehog: Critter
  private squirrels: Critter[] = []
  private ducks: Critter[] = []
  private geese: Critter[] = []
  private bees: THREE.Object3D[] = []
  private beeTrips: { plant: number; t: number; speed: number }[] = []
  private nest: ReturnType<typeof C.nest>
  private hives: THREE.Group[] = []
  private feeder: ReturnType<typeof C.feeder>
  private carrots: THREE.Mesh[] = []
  private caches: THREE.Mesh[] = []
  private saplings: THREE.Group[] = []
  private spawn: THREE.Group
  private tadpoles: THREE.Mesh[] = []
  private flock = { on: false, t: 0, x: 0, z: 0, dx: 1, dz: 0, wait: 8 }
  private clock = 0
  private modes: Record<string, string> = {}

  constructor(
    scene: THREE.Scene,
    private tracks: Tracks,
  ) {
    const S = T.render.critterSize
    for (let i = 0; i < H.caps.rabbits + 2; i++) this.rabbits.push(critter(C.rabbit(), S.rabbit, scene))
    for (let i = 0; i < H.caps.birds; i++) this.birds.push(critter(C.songbird(i), S.bird, scene))
    for (let i = 0; i < 3; i++) this.fledglings.push(critter(C.songbird(i), S.bird * 0.7, scene))
    for (let i = 0; i < H.caps.deer; i++) this.deer.push(critter(C.deer(), 1, scene))
    for (let i = 0; i < H.caps.frogs; i++) this.frogs.push(critter(C.frog(), S.frog, scene))
    for (let i = 0; i < 6; i++) this.froglets.push(critter(C.frog(), S.frog * 0.5, scene))
    this.hedgehog = critter(C.hedgehog(), 1.6, scene)
    for (let i = 0; i < 2; i++) this.squirrels.push(critter(C.squirrel(), 1.8, scene))
    for (let i = 0; i < 2; i++) this.ducks.push(critter(C.duck(i === 0), S.duck, scene))
    for (let i = 0; i < 9; i++) this.geese.push(critter(C.goose(), 1, scene))

    // Homes.
    const burrow = C.burrow()
    burrow.position.set(H.burrow.x, 0, H.burrow.z)
    scene.add(burrow)
    this.nest = C.nest()
    this.nest.root.position.set(NEST.x, NEST.y, NEST.z)
    this.nest.root.scale.setScalar(1.6)
    scene.add(this.nest.root)
    // A branch out from the oak's trunk to hold the nest.
    const from = new THREE.Vector3(T.oak.x, 2.4, T.oak.z)
    const to = new THREE.Vector3(NEST.x, NEST.y - 0.08, NEST.z)
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, from.distanceTo(to), 6), C.std(0x5c4330))
    branch.position.copy(from).add(to).multiplyScalar(0.5)
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    branch.castShadow = true
    scene.add(branch)
    for (let i = 0; i < 2; i++) {
      const h = C.hive()
      h.position.set(H.hive.x + i * 1.2, 0, H.hive.z)
      h.visible = i === 0
      scene.add(h)
      this.hives.push(h)
    }
    const pile = C.leafPile()
    pile.position.set(H.leafPile.x, 0, H.leafPile.z)
    scene.add(pile)
    this.feeder = C.feeder()
    this.feeder.root.position.set(T.people.feeder.x, 0, T.people.feeder.z)
    scene.add(this.feeder.root)
    const bed = C.deerBed()
    bed.position.set(H.deerBed.x, 0.03, H.deerBed.z)
    scene.add(bed)
    const drey = C.drey()
    drey.position.set(H.drey.x + 0.5, 3.0, H.drey.z - 0.4)
    scene.add(drey)
    const carrot = new THREE.ConeGeometry(0.03, 0.18, 6)
    carrot.rotateZ(Math.PI / 2)
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(carrot, C.std(0xe07020))
      m.position.set(H.burrow.x - 2.2 + i * 0.08, 0.04, H.burrow.z - 0.1 + i * 0.12)
      m.rotation.y = i * 0.7
      m.visible = false
      scene.add(m)
      this.carrots.push(m)
    }
    const dirt = new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    for (let i = 0; i < H.caps.caches; i++) {
      const m = new THREE.Mesh(dirt, C.std(0x5a4030, 1))
      m.scale.y = 0.5
      m.visible = false
      scene.add(m)
      this.caches.push(m)
    }
    for (let i = 0; i < H.caps.saplings; i++) {
      const s = C.sapling()
      s.visible = false
      scene.add(s)
      this.saplings.push(s)
    }
    // Frogspawn, and tadpoles.
    this.spawn = new THREE.Group()
    const jelly = new THREE.MeshStandardMaterial({ color: 0xcfd8c8, transparent: true, opacity: 0.6, roughness: 0.2 })
    for (let i = 0; i < 24; i++) {
      const m = C.part(C.ball, jelly, (Math.random() - 0.5) * 0.4, 0.02, (Math.random() - 0.5) * 0.3, 0.04, 0.03, 0.04)
      m.add(C.part(C.ball, C.std(0x101008), 0, 0, 0, 0.3, 0.3, 0.3))
      this.spawn.add(m)
    }
    this.spawn.position.set(SPAWN_AT.x, 0.03, SPAWN_AT.z)
    this.spawn.visible = false
    scene.add(this.spawn)
    for (let i = 0; i < 12; i++) {
      const m = C.part(C.ball, C.std(0x2a2418), 0, 0.035, 0, 0.03, 0.015, 0.05)
      m.visible = false
      scene.add(m)
      this.tadpoles.push(m)
    }
    for (let i = 0; i < 24; i++) {
      const b = C.bee()
      b.scale.setScalar(1.5)
      b.visible = false
      scene.add(b)
      this.bees.push(b)
      this.beeTrips.push({ plant: -1, t: Math.random(), speed: 0.08 + Math.random() * 0.06 })
    }
  }

  update(garden: Garden, dt: number) {
    this.clock += dt
    const t = garden.time
    const h = garden.habitat
    this.rabbitsUpdate(garden, dt, t)
    this.birdsUpdate(garden, dt, t)
    this.deerUpdate(garden, dt, t)
    this.frogsUpdate(garden, dt, t)
    this.beesUpdate(garden, dt, t)
    this.hedgehogUpdate(garden, dt, t)
    this.squirrelsUpdate(garden, dt, t)
    this.ducksUpdate(garden, dt, t)
    this.updateGeese(garden.visitors.geese, dt, t)
    // Lasting signs.
    this.hives[1].visible = h.bees.hives > 1
    this.feeder.seed.visible = t - garden.people.fedAt < 400
    const left = Math.ceil(garden.people.carrots)
    this.carrots.forEach((m, i) => (m.visible = i < left))
    this.caches.forEach((m, i) => {
      const c = h.squirrels.caches[i]
      m.visible = !!c
      if (c) m.position.set(c.x, 0.01, c.z)
    })
    this.saplings.forEach((m, i) => {
      const s = h.squirrels.saplings[i]
      m.visible = !!s
      if (s) {
        m.position.set(s.x, 0, s.z)
        m.scale.setScalar(0.25 + 0.75 * s.growth)
      }
    })
  }

  /** True under or close to the player's shower, or anywhere in a storm. */
  private rained(garden: Garden, x: number, z: number) {
    const c = garden.cloud
    if (garden.storming) return true
    return (c.raining || c.breezing) && Math.hypot(x - c.x, z - c.z) < garden.radius + 1.5
  }

  private lawnSpot(garden: Garden, near: { x: number; z: number }, reach: number) {
    const g = garden.ground
    for (let i = 0; i < 30; i++) {
      const x = near.x + (Math.random() - 0.5) * reach * 2
      const z = near.z + (Math.random() - 0.5) * reach * 2
      const k = g.index(x, z)
      if (k >= 0 && g.lawn[k] && !this.rained(garden, x, z)) return { x, z }
    }
    return { x: near.x, z: near.z }
  }

  /** Mode changed since last frame? */
  private changed(key: string, mode: string) {
    const was = this.modes[key]
    this.modes[key] = mode
    return was !== undefined && was !== mode
  }

  // ---- Rabbits: out of the burrow to graze, back in when the rain comes.

  private rabbitsUpdate(garden: Garden, dt: number, t: number) {
    const r = garden.habitat.rabbits
    const n = r.adults + r.kits
    const out = r.mode === 'graze' || r.mode === 'near'
    const reach = r.mode === 'near' ? 2.5 : 9
    const near = r.mode === 'near' && garden.people.carrots > 0 ? { x: H.burrow.x - 2.2, z: H.burrow.z } : H.burrow
    const kit = 0.6 * T.render.critterSize.rabbit
    this.rabbits.forEach((c, i) => {
      const member = i < n
      c.root.scale.setScalar(i >= r.adults ? kit : T.render.critterSize.rabbit)
      const wantOut = member && out
      const peek = member && r.mode === 'peek' && i < 2
      const { head, earL } = c.parts
      if (c.mode === 'away') {
        c.root.visible = peek
        if (peek) {
          // Just a nose and ears at the burrow's mouth.
          c.x = MOUTH.x - i * 0.12
          c.z = MOUTH.z + (i - 0.5) * 0.3
          c.y = -0.16
          c.heading = -Math.PI / 2 + (i - 0.5) * 0.5
          head.rotation.x = -0.3
          place(c)
        }
        if (wantOut && Math.random() < dt * 0.8) {
          c.mode = 'arriving'
          c.root.visible = true
          c.x = MOUTH.x
          c.z = MOUTH.z
          c.y = 0
          const s = this.lawnSpot(garden, near, reach)
          go(c, s.x, 0, s.z, 1.6, 0, 0.35)
        }
        return
      }
      if (!wantOut && c.mode !== 'leaving') {
        c.mode = 'leaving'
        go(c, MOUTH.x, 0, MOUTH.z, r.mode === 'burrow' ? 3 : 2, 0, 0.35)
      }
      if (advance(c, dt)) {
        head.rotation.x = -0.2
      } else if (c.mode === 'leaving') {
        c.mode = 'away'
        c.root.visible = false
        if (i === 0) this.events.push('thump')
        return
      } else {
        c.mode = 'here'
        c.y = 0
        if (this.rained(garden, c.x, c.z)) {
          const s = this.lawnSpot(garden, near, reach + 4)
          go(c, s.x, 0, s.z, 3, 0, 0.35)
        } else if ((c.wait -= dt) <= 0) {
          const s = this.lawnSpot(garden, near, reach)
          const hop = this.lawnSpot(garden, { x: c.x, z: c.z }, 1.2)
          const to = Math.hypot(c.x - near.x, c.z - near.z) > reach ? s : hop
          go(c, to.x, 0, to.z, 1.6, 0, 0.35)
          c.wait = 3 + Math.random() * 5
        }
        const look = Math.sin(t * 0.7 + c.phase) > 0.75
        head.rotation.x = look ? -0.3 : 0.45 + Math.sin(t * 6 + c.phase) * 0.06
      }
      earL.rotation.z = Math.sin(t * 9 + c.phase) > 0.9 ? -0.4 : -0.15
      place(c)
      this.tracks.walk(garden, c, c.x, c.z, 0.035)
    })
  }

  // ---- Birds: forage, bathe, the feeder, the fence, or tucked up in the nest.

  private birdSpot(garden: Garden, mode: string, i: number) {
    switch (mode) {
      case 'bathe':
        if (i % 2 === 0) {
          const a = i * 1.3
          return { x: BATH.x + Math.cos(a) * 0.42, y: BATH.y, z: BATH.z + Math.sin(a) * 0.42 }
        }
        return { ...this.lawnSpot(garden, BATH, 3), y: 0 }
      case 'feeder': {
        const F = T.people.feeder
        if (i < 4) {
          const a = i * 1.6
          return { x: F.x + Math.cos(a) * 0.2, y: 1.53, z: F.z + Math.sin(a) * 0.2 }
        }
        return { ...this.lawnSpot(garden, F, 1.5), y: 0 }
      }
      case 'quiet':
        return { x: -2 + i * 1.7 + Math.random() * 0.6, y: 1.1, z: BACK_RAIL }
      case 'nest':
        return { x: NEST.x, y: NEST.y + 0.6, z: NEST.z }
      default:
        return { ...this.lawnSpot(garden, { x: 0, z: 2 }, 12), y: 0 }
    }
  }

  private birdsUpdate(garden: Garden, dt: number, t: number) {
    const b = garden.habitat.birds
    const n = b.adults
    const redirect = this.changed('birds', b.mode)
    this.birds.forEach((c, i) => {
      const { head, wingL, wingR } = c.parts
      if (i >= n) {
        c.root.visible = false
        return
      }
      // New mode, or first time: fly to where this mode belongs, a few at a time.
      if (redirect || c.task === '') {
        c.task = b.mode
        c.wait = Math.random() * 2.5
        c.mode = 'leaving'
        if (c.task === '' || !c.root.visible) {
          c.x = NEST.x
          c.y = NEST.y + 0.3
          c.z = NEST.z
        }
      }
      if (c.mode === 'leaving') {
        if ((c.wait -= dt) > 0) return
        const s = this.birdSpot(garden, c.task, i)
        c.root.visible = true
        go(c, s.x, s.y, s.z, 4, 1.2 + Math.random())
        c.mode = 'arriving'
        if (i === 0) this.events.push('flutter')
      }
      const flying = c.mode === 'arriving'
      if (flying) {
        if (!advance(c, dt, true)) {
          c.mode = 'here'
          c.wait = 0.5
          // Tucked up out of sight in the oak.
          if (c.task === 'nest') c.root.visible = false
        }
        const flap = Math.sin(t * 40 + c.phase) * 0.9
        wingL.rotation.z = flap
        wingR.rotation.z = -flap
      } else {
        wingL.rotation.z = wingR.rotation.z = 0
        if (c.task === 'nest') return
        const onGround = c.ty === 0
        if (onGround && this.rained(garden, c.x, c.z)) {
          // Startled: off to somewhere drier.
          const s = this.birdSpot(garden, c.task, i)
          go(c, s.x, s.y, s.z, 4, 1)
          c.mode = 'arriving'
          this.events.push('flutter')
        } else if (c.t < 1) {
          advance(c, dt)
        } else if ((c.wait -= dt) <= 0) {
          if (onGround && Math.random() < 0.6) {
            const a = c.heading + (Math.random() - 0.5) * 2
            const d = 0.12 + Math.random() * 0.25
            const nx = c.x + Math.sin(a) * d
            const nz = c.z + Math.cos(a) * d
            const k = garden.ground.index(nx, nz)
            if (k >= 0 && garden.ground.lawn[k]) {
              go(c, nx, 0, nz, 1.2, 0.06)
            } else c.heading += Math.PI
          } else if (!onGround) c.heading += (Math.random() - 0.5) * 1.5
          c.wait = 0.4 + Math.random() * 1.6
        }
        // Pecking, or splashing in the bath.
        const peck = c.t >= 1 && c.task !== 'quiet' && Math.sin(t * 5 + c.phase) > 0.6
        head.rotation.x = peck ? 0.9 : Math.sin(t * 2 + c.phase) * 0.15
        if (c.task === 'bathe' && !onGround && Math.sin(t * 3 + c.phase) > 0.7) {
          const flap = Math.sin(t * 30) * 0.6
          wingL.rotation.z = flap
          wingR.rotation.z = -flap
        }
      }
      place(c)
    })

    // The nest: eggs, chicks with their beaks open, fledglings learning to fly.
    const nest = this.nest
    nest.eggs.visible = b.nest === 'eggs'
    nest.chicks.forEach((ch, i) => {
      ch.visible = b.nest === 'chicks'
      ch.position.y = 0.03 + Math.max(0, Math.sin(t * 4 + i * 2)) * 0.03
    })
    if (b.nest === 'chicks' && Math.random() < dt * 0.6) this.events.push('cheep')
    this.fledglings.forEach((c, i) => {
      const on = b.nest === 'fledglings'
      c.root.visible = on
      if (!on) {
        c.t = 1
        c.x = T.oak.x - 1 + i * 0.5
        c.z = T.oak.z + 2
        c.y = 0
        return
      }
      if (!advance(c, dt, true) && (c.wait -= dt) <= 0) {
        // A short, unsteady flutter, then a rest.
        const s = this.lawnSpot(garden, { x: T.oak.x - 1, z: T.oak.z + 2.2 }, 2)
        go(c, s.x, 0, s.z, 1.5, Math.random() < 0.5 ? 0.6 : 0.08)
        c.wait = 1 + Math.random() * 3
      }
      const flap = c.t < 1 && c.arc > 0.2 ? Math.sin(t * 35 + i) * 0.9 : 0
      c.parts.wingL.rotation.z = flap
      c.parts.wingR.rotation.z = -flap
      place(c)
    })
  }

  // ---- Deer: lie in their bed, shelter under the trees, graze the orchard edge at dusk.

  private deerSpot(mode: string, i: number) {
    const B = H.deerBed
    switch (mode) {
      case 'rest':
        return { x: B.x + (i - 1) * 0.9, z: B.z + (i % 2) * 0.5 }
      case 'shelter':
        return { x: B.x - 2 + i * 1.3, z: T.yard.z0 - 7 - (i % 2) }
      case 'browse':
        return { x: B.x - 3 + i * 2 + Math.random() * 2, z: T.yard.z0 - 2.6 }
      default:
        return { x: 9 + Math.random() * 7, z: T.yard.z0 - 2.9 - Math.random() * 0.8 }
    }
  }

  private deerUpdate(garden: Garden, dt: number, t: number) {
    const d = garden.habitat.deer
    const n = d.adults + d.fawns
    const redirect = this.changed('deer', d.mode)
    const look = garden.climate.look
    this.deer.forEach((c, i) => {
      const { neck, antlers, l0, l1, l2, l3 } = c.parts
      if (i >= n) {
        c.root.visible = false
        c.task = ''
        return
      }
      const fawn = i >= d.adults
      c.root.scale.setScalar(fawn ? 0.6 : 1)
      antlers.visible = i === 0 && look.autumn + look.winter > 0.5
      if (!c.root.visible) {
        const s = this.deerSpot(d.mode, i)
        c.x = s.x
        c.z = s.z
        c.root.visible = true
      }
      if (redirect || c.task === '') {
        c.task = d.mode
        const s = this.deerSpot(d.mode, i)
        go(c, s.x, 0, s.z, d.mode === 'shelter' ? 1.6 : 0.8)
      }
      const walking = advance(c, dt)
      if (!walking && c.task !== 'rest' && c.task !== 'shelter' && (c.wait -= dt) <= 0) {
        const s = this.deerSpot(c.task, i)
        go(c, s.x, 0, s.z, 0.6)
        c.wait = 6 + Math.random() * 8
      }
      // Lying down in the bed: tuck the legs, lower the body.
      const lying = c.task === 'rest' && !walking
      c.y = lying ? -0.55 : 0
      for (const l of [l0, l1, l2, l3]) l.visible = !lying
      const stride = walking ? Math.sin(t * 6 + c.phase) * 0.35 : 0
      l0.rotation.x = l3.rotation.x = stride
      l1.rotation.x = l2.rotation.x = -stride
      const alert = Math.sin(t * 0.5 + c.phase) > 0.6
      const want = walking || alert || lying || c.task === 'shelter' ? -0.15 : c.task === 'browse' ? -0.7 : 1.9
      neck.rotation.x += (want - neck.rotation.x) * Math.min(1, dt * 2)
      if (!walking && Math.random() < dt * 0.01) this.events.push('snort')
      place(c)
      if (walking) this.tracks.walk(garden, c, c.x, c.z, 0.05, 0.6)
    })
  }

  // ---- Frogs: on the lily pads in the sun, on the bank croaking in the rain, under in winter.

  private frogsUpdate(garden: Garden, dt: number, t: number) {
    const f = garden.habitat.frogs
    const show = f.mode !== 'hidden' && f.mode !== 'asleep'
    const redirect = this.changed('frogs', f.mode)
    const P = T.pond
    this.frogs.forEach((c, i) => {
      if (i >= f.adults || (!show && c.mode === 'away')) {
        if (i >= f.adults) c.root.visible = false
        return
      }
      const a = (i / f.adults) * Math.PI * 2 + 0.4
      if (redirect || c.mode === 'away') {
        if (!show) {
          // Into the water and under.
          go(c, P.x + Math.cos(a) * 0.5, -0.12, P.z + Math.sin(a) * 0.5, 1, 0.15)
          c.mode = 'leaving'
        } else {
          if (c.mode === 'away') {
            c.x = P.x + Math.cos(a) * 0.5
            c.z = P.z + Math.sin(a) * 0.5
            c.y = -0.12
          }
          const r = f.mode === 'bask' ? P.radius * 0.55 : P.radius + 0.35
          go(c, P.x + Math.cos(a) * r, f.mode === 'bask' ? 0.05 : 0, P.z + Math.sin(a) * r, 1, 0.15)
          c.mode = 'arriving'
        }
        c.root.visible = true
      }
      if (!advance(c, dt)) {
        if (c.mode === 'leaving') {
          c.mode = 'away'
          c.root.visible = false
          return
        }
        c.mode = 'here'
        c.heading = Math.atan2(c.x - P.x, c.z - P.z)
      }
      const loud = f.mode === 'chorus' ? 1.3 : f.mode === 'croak' ? 1 : 0
      const croak = loud * Math.max(0, Math.sin(t * 7 + c.phase)) * (Math.sin(t * 0.6 + c.phase) > 0.2 ? 1 : 0)
      c.parts.throat.scale.set(0.035 * (1 + croak * 0.8), 0.025 * (1 + croak), 0.03 * (1 + croak * 0.6))
      place(c)
    })
    // Frogspawn, tadpoles, froglets.
    this.spawn.visible = f.spawn === 'spawn'
    this.tadpoles.forEach((m, i) => {
      m.visible = f.spawn === 'tadpoles'
      if (!m.visible) return
      const a = t * (0.3 + (i % 4) * 0.08) + i * 0.52
      const r = P.radius * (0.3 + (i % 3) * 0.18)
      m.position.set(P.x + Math.cos(a) * r, 0.035, P.z + Math.sin(a) * r)
      m.rotation.y = -a + Math.sin(t * 12 + i) * 0.4
    })
    this.froglets.forEach((c, i) => {
      c.root.visible = f.spawn === 'froglets'
      if (!c.root.visible) return
      if (!advance(c, dt) && (c.wait -= dt) <= 0) {
        const a = Math.random() * Math.PI * 2
        go(c, P.x + Math.cos(a) * (P.radius + 0.3), 0, P.z + Math.sin(a) * (P.radius + 0.3), 0.8, 0.08)
        c.wait = 1 + Math.random() * 4
      }
      if (c.x === 0) {
        c.x = SPAWN_AT.x + i * 0.1
        c.z = SPAWN_AT.z
      }
      place(c)
    })
  }

  // ---- Bees: from the hive to the flowers and back.

  private beesUpdate(garden: Garden, dt: number, t: number) {
    const b = garden.habitat.bees
    const flowers = garden.plants.map((p, i) => ({ p, i })).filter(({ p }) => p.growth >= 0.9)
    const busy = b.mode === 'busy' && flowers.length > 0
    const hiveAt = (k: number) => ({ x: H.hive.x + (k % b.hives) * 1.2, y: 0.4, z: H.hive.z + 0.3 })
    this.bees.forEach((bee, i) => {
      const trip = this.beeTrips[i]
      if (b.mode === 'asleep') {
        bee.visible = false
        return
      }
      const home = hiveAt(i)
      if (!busy || i >= 8 * b.hives + 4) {
        // A few round the entrance.
        bee.visible = i < 3 * b.hives
        bee.position.set(home.x + Math.sin(t * 2 + i) * 0.25, home.y + 0.1 + Math.sin(t * 3 + i * 2) * 0.1, home.z + Math.cos(t * 2.3 + i) * 0.2)
        return
      }
      bee.visible = true
      trip.t += dt * trip.speed
      if (trip.t >= 1 || trip.plant < 0 || trip.plant >= garden.plants.length) {
        trip.t = 0
        trip.plant = flowers[Math.floor(Math.random() * flowers.length)].i
      }
      const p = garden.plants[trip.plant]
      // Out and back: 0 to 0.5 out, a pause among the flowers, then home.
      const out = trip.t < 0.45 ? trip.t / 0.45 : trip.t < 0.55 ? 1 : 1 - (trip.t - 0.55) / 0.45
      const s = smooth(out)
      const top = p.inBed ? T.bed.height + 0.9 : 1.1
      bee.position.set(
        lerp(home.x, p.x, s) + Math.sin(t * 9 + i) * 0.08,
        lerp(home.y, top, s) + Math.sin(s * Math.PI) * 1.5 + Math.sin(t * 13 + i) * 0.05,
        lerp(home.z, p.z, s) + Math.cos(t * 8 + i) * 0.08,
      )
      bee.rotation.y = trip.t < 0.5 ? Math.atan2(p.x - home.x, p.z - home.z) : Math.atan2(home.x - p.x, home.z - p.z)
    })
  }

  // ---- The hedgehog: out of the leaf pile after dark, hunting slugs after rain.

  private hedgehogUpdate(garden: Garden, dt: number, t: number) {
    const hh = garden.habitat.hedgehog
    const c = this.hedgehog
    const out = hh.mode === 'out' || hh.mode === 'hunting'
    const pile = { x: H.leafPile.x - 0.6, z: H.leafPile.z + 0.5 }
    if (c.mode === 'away') {
      if (!out) return
      c.mode = 'arriving'
      c.root.visible = true
      c.x = pile.x
      c.z = pile.z
      c.y = 0
      c.t = 1
    }
    if (!out && c.mode !== 'leaving') {
      c.mode = 'leaving'
      go(c, pile.x, 0, pile.z, 0.5)
    }
    const moving = advance(c, dt)
    if (!moving) {
      if (c.mode === 'leaving') {
        c.mode = 'away'
        c.root.visible = false
        return
      }
      c.mode = 'here'
      if ((c.wait -= dt) <= 0) {
        const s = this.lawnSpot(garden, { x: 10, z: -2 }, hh.mode === 'hunting' ? 9 : 6)
        go(c, s.x, 0, s.z, hh.mode === 'hunting' ? 0.6 : 0.35)
        c.wait = 2 + Math.random() * 4
        if (Math.random() < 0.5) this.events.push('snuffle')
      }
    }
    // Nose to the ground, snuffling.
    c.parts.snout.rotation.x = 0.3 + Math.sin(t * 10) * (moving ? 0.05 : 0.15)
    place(c)
    this.tracks.walk(garden, c, c.x, c.z, 0.03, 0.2)
  }

  // ---- Squirrels: chase round the orchard, bury acorns in autumn, dig them up in winter.

  private squirrelsUpdate(garden: Garden, dt: number, t: number) {
    const q = garden.habitat.squirrels
    const base = { x: H.drey.x, z: H.drey.z }
    const dreyY = 3.0
    this.changed('squirrels', q.mode)
    this.squirrels.forEach((c, i) => {
      const hide = q.mode === 'shelter'
      if (c.mode === 'away') {
        if (hide) return
        c.mode = 'arriving'
        c.root.visible = true
        c.x = base.x
        c.z = base.z
        c.y = dreyY
        go(c, base.x, 0, base.z + 0.3, 2)
      }
      if (hide && c.mode !== 'leaving') {
        c.mode = 'leaving'
        go(c, base.x, 0, base.z, 3)
        c.task = 'climb'
      }
      const moving = advance(c, dt)
      if (!moving) {
        if (c.mode === 'leaving') {
          if (c.task === 'climb') {
            // Up the trunk and into the drey.
            go(c, base.x, dreyY, base.z, 2)
            c.task = 'gone'
            return
          }
          c.mode = 'away'
          c.root.visible = false
          return
        }
        c.mode = 'here'
        if ((c.wait -= dt) <= 0) {
          if (q.mode === 'bury' || q.mode === 'dig') {
            const spot = q.caches.length ? q.caches[(i + Math.floor(t / 10)) % q.caches.length] : null
            const to = spot && (c.task !== 'dig-there' || i === 1) ? spot : base
            go(c, to.x, 0, to.z, 2.5, 0, 0.3)
            c.task = to === base ? 'home' : 'dig-there'
            c.wait = to === base ? 0.5 : 2.5
            if (Math.random() < 0.3) this.events.push('chatter')
          } else {
            // Chase: the second follows the first round the trees.
            const lead = this.squirrels[0]
            const s = i === 0 ? this.lawnSpot(garden, base, 5) : { x: lead.tx + 0.4, z: lead.tz + 0.3 }
            go(c, s.x, 0, s.z, 3.2, 0, 0.3)
            c.wait = 0.3 + Math.random() * 1.5
            if (i === 0 && Math.random() < 0.15) this.events.push('chatter')
          }
        }
      }
      // Digging: head down and bobbing.
      const digging = !moving && c.task === 'dig-there'
      c.parts.head.rotation.x = digging ? 0.8 + Math.sin(t * 14) * 0.2 : 0
      c.parts.tail.rotation.x = -0.35 + Math.sin(t * 5 + c.phase) * 0.15
      place(c)
      this.tracks.walk(garden, c, c.x, c.z, 0.025, 0.25)
    })
  }

  // ---- Ducks: glide down onto the pond, paddle round, fly off. Visitors, not residents.

  private ducksUpdate(garden: Garden, dt: number, t: number) {
    const want = garden.visitors.ducks
    const P = T.pond
    this.ducks.forEach((c, i) => {
      const present = c.mode === 'arriving' || c.mode === 'here'
      if (!present && i < want && c.mode === 'away' && Math.random() < dt * 0.3) {
        const a = Math.random() * Math.PI * 2
        c.x = P.x + Math.cos(a) * 18
        c.y = 8
        c.z = P.z + Math.sin(a) * 18
        go(c, P.x + Math.cos(a) * 0.6, 0.02, P.z + Math.sin(a) * 0.6, 4.5)
        c.mode = 'arriving'
        c.root.visible = true
      } else if (present && i >= want) {
        const a = Math.random() * Math.PI * 2
        go(c, c.x + Math.cos(a) * 16, 9, c.z + Math.sin(a) * 16, 4, 0)
        c.mode = 'leaving'
        this.events.push('flutter')
      }
      if (c.mode === 'away') return
      if (c.mode !== 'here') {
        if (!advance(c, dt, true)) {
          if (c.mode === 'leaving') {
            c.mode = 'away'
            c.root.visible = false
            return
          }
          c.mode = 'here'
        }
      } else {
        const a = t * (0.12 + i * 0.05) + c.phase
        const r = P.radius * (0.45 + 0.15 * Math.sin(t * 0.21 + c.phase))
        const nx = P.x + Math.cos(a) * r
        const nz = P.z + Math.sin(a) * r
        c.heading = Math.atan2(nx - c.x, nz - c.z)
        c.x = nx
        c.z = nz
        c.y = 0.02 + Math.sin(t * 2 + c.phase) * 0.006
        c.parts.head.rotation.x = Math.sin(t * 0.9 + c.phase) > 0.85 ? 1.2 : 0
        if (Math.random() < dt * 0.05) this.events.push('quack')
      }
      place(c)
    })
  }

  // ---- Geese: a V going over now and then in autumn.

  private updateGeese(on: boolean, dt: number, t: number) {
    const f = this.flock
    if (!f.on) {
      f.wait -= dt
      if (on && f.wait <= 0) {
        f.on = true
        f.t = 0
        const a = Math.PI * 0.75 + (Math.random() - 0.5) * 0.6
        f.dx = Math.sin(a)
        f.dz = Math.cos(a)
        f.x = 4 - f.dx * 70
        f.z = -f.dz * 70
        this.events.push('honk')
      }
      for (const g of this.geese) g.root.visible = false
      return
    }
    f.t += dt
    const speed = 7
    const cx = f.x + f.dx * speed * f.t
    const cz = f.z + f.dz * speed * f.t
    if (f.t * speed > 140) {
      f.on = false
      f.wait = 30 + Math.random() * 40
      return
    }
    if (Math.random() < dt * 0.4) this.events.push('honk')
    const heading = Math.atan2(f.dx, f.dz)
    this.geese.forEach((g, i) => {
      const side = i === 0 ? 0 : i % 2 ? 1 : -1
      const rank = Math.ceil(i / 2)
      const back = rank * 1.6
      const out = side * rank * 1.3
      g.root.visible = true
      g.root.position.set(cx - f.dx * back + f.dz * out, 16 + Math.sin(t * 0.8 + i) * 0.2, cz - f.dz * back - f.dx * out)
      g.root.rotation.y = heading
      const flap = Math.sin(t * 6 + i * 0.7) * 0.5
      g.parts.wingL.rotation.z = flap
      g.parts.wingR.rotation.z = -flap
    })
  }
}
