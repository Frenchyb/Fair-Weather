/**
 * The garden's visitors: songbirds hopping and pecking on the lawn, rabbits
 * grazing, frogs on the pond's bank in the rain, a pair of ducks on the pond,
 * deer beyond the back hedge at dawn and dusk, and geese going over in
 * autumn. The simulation says how many of each are about (`garden.visitors`);
 * this decides where they wander. They come and go rather than popping in:
 * birds fly in and away, rabbits hop in under the side hedges, frogs climb
 * out of the pond, deer walk along the hedge.
 *
 * Everything shy keeps out from under the player's rain. Reads the garden only.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { T } from '../tuning'

type Mode = 'away' | 'arriving' | 'here' | 'leaving'

interface Critter {
  root: THREE.Group
  mode: Mode
  x: number
  z: number
  y: number
  heading: number
  /** Where it is going, and where it set off from. */
  tx: number
  tz: number
  fx: number
  fz: number
  fy: number
  /** 0 to 1 along the current move. */
  t: number
  span: number
  wait: number
  phase: number
  parts: Record<string, THREE.Object3D>
}

const std = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough })

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  return m
}

const ball = new THREE.SphereGeometry(1, 12, 9)
const cone = new THREE.ConeGeometry(1, 1, 8)
cone.rotateX(Math.PI / 2)
const block = new THREE.BoxGeometry(1, 1, 1)
const leg = new THREE.CylinderGeometry(1, 0.8, 1, 6)
leg.translate(0, -0.5, 0)

/** A songbird facing +z: a robin, a blackbird or a sparrow. */
function songbird(i: number) {
  const g = new THREE.Group()
  const kinds = [
    { body: 0x6b4a32, breast: 0xc8582a }, // robin
    { body: 0x1c1a18, breast: 0x1c1a18 }, // blackbird
    { body: 0x7d6347, breast: 0xbfae94 }, // sparrow
  ]
  const k = kinds[i % 3]
  const body = std(k.body)
  const s = 0.06
  g.add(part(ball, body, 0, s * 1.2, 0, s * 0.9, s * 0.85, s * 1.3))
  g.add(part(ball, std(k.breast), 0, s * 1.05, s * 0.55, s * 0.7, s * 0.7, s * 0.6))
  const head = new THREE.Group()
  head.position.set(0, s * 2, s * 0.9)
  head.add(part(ball, body, 0, 0, 0, s * 0.6, s * 0.6, s * 0.6))
  head.add(part(cone, std(i % 3 === 1 ? 0xe0a020 : 0x3a2c20), 0, 0, s * 0.75, s * 0.18, s * 0.18, s * 0.5))
  g.add(head)
  g.add(part(block, body, 0, s * 1.3, -s * 1.5, s * 0.6, s * 0.12, s * 1.1))
  const wingL = part(block, body, s * 0.85, s * 1.4, 0, s * 1.6, s * 0.08, s * 1.0)
  const wingR = part(block, body, -s * 0.85, s * 1.4, 0, s * 1.6, s * 0.08, s * 1.0)
  g.add(wingL, wingR)
  return { root: g, parts: { head, wingL, wingR } }
}

function rabbit() {
  const g = new THREE.Group()
  const fur = std(0x8b7660)
  g.add(part(ball, fur, 0, 0.13, 0, 0.11, 0.1, 0.16))
  const head = new THREE.Group()
  head.position.set(0, 0.21, 0.13)
  head.add(part(ball, fur, 0, 0, 0, 0.07, 0.065, 0.08))
  const earL = part(ball, fur, 0.03, 0.09, -0.02, 0.018, 0.075, 0.03)
  const earR = part(ball, fur, -0.03, 0.09, -0.02, 0.018, 0.075, 0.03)
  head.add(earL, earR)
  head.add(part(ball, std(0x1a1410), 0.045, 0.015, 0.045, 0.012, 0.012, 0.012))
  head.add(part(ball, std(0x1a1410), -0.045, 0.015, 0.045, 0.012, 0.012, 0.012))
  g.add(head)
  g.add(part(ball, std(0xf2eee6), 0, 0.15, -0.16, 0.04, 0.04, 0.04))
  return { root: g, parts: { head, earL, earR } }
}

function frog() {
  const g = new THREE.Group()
  const skin = std(0x4f7a2c, 0.5)
  g.add(part(ball, skin, 0, 0.04, 0, 0.06, 0.04, 0.075))
  g.add(part(ball, skin, 0.03, 0.075, 0.04, 0.018, 0.018, 0.018))
  g.add(part(ball, skin, -0.03, 0.075, 0.04, 0.018, 0.018, 0.018))
  g.add(part(ball, std(0x101008), 0.034, 0.082, 0.05, 0.008, 0.008, 0.008))
  g.add(part(ball, std(0x101008), -0.034, 0.082, 0.05, 0.008, 0.008, 0.008))
  const throat = part(ball, std(0xd8d0a0, 0.5), 0, 0.03, 0.05, 0.035, 0.025, 0.03)
  g.add(throat)
  g.add(part(ball, skin, 0.06, 0.02, -0.04, 0.03, 0.015, 0.05))
  g.add(part(ball, skin, -0.06, 0.02, -0.04, 0.03, 0.015, 0.05))
  return { root: g, parts: { throat } }
}

function duck(drake: boolean) {
  const g = new THREE.Group()
  const body = std(drake ? 0xb8b0a4 : 0x7a5a3c)
  g.add(part(ball, body, 0, 0.07, 0, 0.11, 0.08, 0.18))
  g.add(part(block, std(drake ? 0x2a2018 : 0x5e4430), 0, 0.12, -0.14, 0.08, 0.03, 0.08))
  const head = new THREE.Group()
  head.position.set(0, 0.2, 0.13)
  head.add(part(ball, std(drake ? 0x1e5a32 : 0x6b4c32, 0.4), 0, 0, 0, 0.055, 0.055, 0.065))
  head.add(part(block, std(drake ? 0xe0b030 : 0xc07a30), 0, -0.01, 0.075, 0.035, 0.015, 0.06))
  g.add(head)
  if (drake) g.add(part(ball, std(0xffffff), 0, 0.15, 0.12, 0.05, 0.012, 0.05))
  return { root: g, parts: { head } }
}

function deer() {
  const g = new THREE.Group()
  const coat = std(0x8a5e3a)
  g.add(part(ball, coat, 0, 0.95, 0, 0.22, 0.24, 0.5))
  const neck = new THREE.Group()
  neck.position.set(0, 1.1, 0.4)
  neck.add(part(block, coat, 0, 0.18, 0.06, 0.12, 0.42, 0.14))
  const head = new THREE.Group()
  head.position.set(0, 0.42, 0.12)
  head.add(part(ball, coat, 0, 0, 0.06, 0.08, 0.08, 0.15))
  head.add(part(ball, coat, 0.08, 0.08, -0.02, 0.025, 0.07, 0.04))
  head.add(part(ball, coat, -0.08, 0.08, -0.02, 0.025, 0.07, 0.04))
  head.add(part(ball, std(0x1a1410), 0, -0.01, 0.2, 0.025, 0.02, 0.02))
  neck.add(head)
  neck.rotation.x = -0.15
  g.add(neck)
  g.add(part(ball, std(0xf2eee6), 0, 1.0, -0.5, 0.06, 0.08, 0.04))
  const legs: THREE.Object3D[] = []
  for (const [x, z] of [
    [0.12, 0.35],
    [-0.12, 0.35],
    [0.12, -0.35],
    [-0.12, -0.35],
  ]) {
    const l = part(leg, std(0x6e4a2e), x, 0.82, z, 0.035, 0.82, 0.035)
    legs.push(l)
    g.add(l)
  }
  return { root: g, parts: { neck, l0: legs[0], l1: legs[1], l2: legs[2], l3: legs[3] } }
}

function goose() {
  const g = new THREE.Group()
  const grey = std(0x8a8478)
  g.add(part(ball, grey, 0, 0, 0, 0.18, 0.15, 0.4))
  g.add(part(block, std(0x1c1a18), 0, 0.06, 0.48, 0.07, 0.07, 0.36))
  g.add(part(ball, std(0x1c1a18), 0, 0.08, 0.7, 0.07, 0.07, 0.1))
  const wingL = new THREE.Group()
  wingL.add(part(block, grey, 0.45, 0, 0, 0.9, 0.03, 0.3))
  const wingR = new THREE.Group()
  wingR.add(part(block, grey, -0.45, 0, 0, 0.9, 0.03, 0.3))
  g.add(wingL, wingR)
  return { root: g, parts: { wingL, wingR } }
}

function critter(made: { root: THREE.Group; parts: Record<string, THREE.Object3D> }): Critter {
  made.root.visible = false
  return {
    root: made.root,
    parts: made.parts,
    mode: 'away',
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    tx: 0,
    tz: 0,
    fx: 0,
    fz: 0,
    fy: 0,
    t: 0,
    span: 1,
    wait: 0,
    phase: Math.random() * 6,
  }
}

const lerp = THREE.MathUtils.lerp
const smooth = (t: number) => t * t * (3 - 2 * t)

export class WildlifeView {
  private birds: Critter[] = []
  private rabbits: Critter[] = []
  private frogs: Critter[] = []
  private ducks: Critter[] = []
  private deer: Critter[] = []
  private geese: Critter[] = []
  private flock = { on: false, t: 0, x: 0, z: 0, dx: 1, dz: 0, wait: 8 }
  private clock = 0
  /** Something just happened the audio might want: a bird took off, a goose honked. */
  readonly events: string[] = []

  constructor(scene: THREE.Scene) {
    // A little larger than life: from up here a life-size robin is a speck,
    // and what matters is the silhouette and what it is doing.
    const add = (list: Critter[], made: { root: THREE.Group; parts: Record<string, THREE.Object3D> }, size = 1) => {
      made.root.scale.setScalar(size)
      const c = critter(made)
      scene.add(c.root)
      list.push(c)
    }
    const S = T.render.critterSize
    for (let i = 0; i < 12; i++) add(this.birds, songbird(i), S.bird)
    for (let i = 0; i < 4; i++) add(this.rabbits, rabbit(), S.rabbit)
    for (let i = 0; i < 4; i++) add(this.frogs, frog(), S.frog)
    for (let i = 0; i < 2; i++) add(this.ducks, duck(i === 0), S.duck)
    for (let i = 0; i < 2; i++) add(this.deer, deer())
    for (let i = 0; i < 9; i++) add(this.geese, goose())
  }

  update(garden: Garden, dt: number) {
    const v = garden.visitors
    this.clock += dt
    // At most one new arrival of each kind a second or so, so they trickle in.
    const admit = this.clock > 0.8
    if (admit) this.clock = 0
    this.manage(this.birds, v.birds, admit, (c) => this.birdIn(garden, c), (c) => this.flyOff(c))
    this.manage(this.rabbits, v.rabbits, admit, (c) => this.rabbitIn(garden, c), (c) => this.hopOff(c))
    this.manage(this.frogs, v.frogs, admit, (c) => this.frogIn(c), (c) => this.frogOff(c))
    this.manage(this.ducks, v.ducks, admit, (c) => this.duckIn(c), (c) => this.flyOff(c))
    this.manage(this.deer, v.deer, admit, (c) => this.deerIn(c), (c) => this.deerOff(c))
    const t = garden.time
    for (const c of this.birds) this.bird(garden, c, dt, t)
    for (const c of this.rabbits) this.rabbit(garden, c, dt, t)
    for (const c of this.frogs) this.frog(c, dt, t)
    for (const c of this.ducks) this.duck(c, dt, t)
    for (const c of this.deer) this.walker(c, dt, t)
    this.updateGeese(v.geese, dt, t)
  }

  /** Send in or call away visitors until the numbers match. */
  private manage(list: Critter[], want: number, admit: boolean, arrive: (c: Critter) => void, leave: (c: Critter) => void) {
    const present = list.filter((c) => c.mode === 'arriving' || c.mode === 'here')
    if (present.length > want) {
      const c = present[present.length - 1]
      c.mode = 'leaving'
      leave(c)
    } else if (present.length < want && admit) {
      const c = list.find((k) => k.mode === 'away')
      if (c) {
        c.mode = 'arriving'
        c.root.visible = true
        arrive(c)
      }
    }
  }

  private lawnSpot(garden: Garden, near?: { x: number; z: number }, reach = 2) {
    const g = garden.ground
    const y = T.yard
    for (let i = 0; i < 40; i++) {
      const x = near ? near.x + (Math.random() - 0.5) * reach * 2 : lerp(y.x0 + 1, y.x1 - 1, Math.random())
      const z = near ? near.z + (Math.random() - 0.5) * reach * 2 : lerp(y.z0 + 1, y.z1 - 1, Math.random())
      const k = g.index(x, z)
      if (k >= 0 && g.lawn[k] && g.snow[k] < 0.5 && !this.rained(garden, x, z)) return { x, z }
    }
    return { x: 2, z: 7 }
  }

  /** True under or close to the player's shower, or anywhere in a storm. */
  private rained(garden: Garden, x: number, z: number) {
    const c = garden.cloud
    if (garden.storming) return true
    return (c.raining || c.breezing) && Math.hypot(x - c.x, z - c.z) < garden.radius + 1.5
  }

  private go(c: Critter, tx: number, tz: number, span: number) {
    c.fx = c.x
    c.fz = c.z
    c.fy = c.y
    c.tx = tx
    c.tz = tz
    c.t = 0
    c.span = span
    c.heading = Math.atan2(tx - c.x, tz - c.z)
  }

  private place(c: Critter, x: number, y: number, z: number) {
    c.x = x
    c.y = y
    c.z = z
  }

  // ---- Birds: fly in, hop and peck, fly off when the rain comes near.

  private birdIn(garden: Garden, c: Critter) {
    const a = Math.random() * Math.PI * 2
    const spot = this.lawnSpot(garden)
    this.place(c, spot.x + Math.cos(a) * 14, 7 + Math.random() * 4, spot.z + Math.sin(a) * 14)
    this.go(c, spot.x, spot.z, 2.2 + Math.random())
  }

  private flyOff(c: Critter) {
    const a = Math.random() * Math.PI * 2
    this.go(c, c.x + Math.cos(a) * 16, c.z + Math.sin(a) * 16, 2.5)
    this.events.push('flutter')
  }

  private bird(garden: Garden, c: Critter, dt: number, t: number) {
    if (c.mode === 'away') return
    const { head, wingL, wingR } = c.parts
    const flying = c.mode !== 'here'
    if (flying) {
      c.t = Math.min(1, c.t + dt / c.span)
      const s = smooth(c.t)
      const goal = c.mode === 'leaving' ? 9 : 0
      c.x = lerp(c.fx, c.tx, s)
      c.z = lerp(c.fz, c.tz, s)
      c.y = lerp(c.fy, goal, c.mode === 'leaving' ? c.t * c.t : 1 - (1 - c.t) * (1 - c.t)) + Math.sin(c.t * Math.PI) * 1.2
      const flap = Math.sin(t * 40 + c.phase) * 0.9
      wingL.rotation.z = flap
      wingR.rotation.z = -flap
      if (c.t >= 1) {
        if (c.mode === 'leaving') {
          c.mode = 'away'
          c.root.visible = false
        } else {
          c.mode = 'here'
          c.y = 0
          c.wait = 0.5
        }
      }
    } else {
      wingL.rotation.z = wingR.rotation.z = 0
      // Startled by the rain or the breeze: off to somewhere else on the lawn.
      if (this.rained(garden, c.x, c.z)) {
        const spot = this.lawnSpot(garden)
        c.mode = 'arriving'
        c.fy = 0.01
        this.go(c, spot.x, spot.z, 1.6)
        this.events.push('flutter')
        return
      }
      c.wait -= dt
      if (c.t < 1) {
        // A hop.
        c.t = Math.min(1, c.t + dt / c.span)
        c.x = lerp(c.fx, c.tx, c.t)
        c.z = lerp(c.fz, c.tz, c.t)
        c.y = Math.sin(c.t * Math.PI) * 0.06
      } else if (c.wait <= 0) {
        if (Math.random() < 0.6) {
          const a = c.heading + (Math.random() - 0.5) * 2
          const d = 0.12 + Math.random() * 0.25
          const nx = c.x + Math.sin(a) * d
          const nz = c.z + Math.cos(a) * d
          const k = garden.ground.index(nx, nz)
          if (k >= 0 && garden.ground.lawn[k]) this.go(c, nx, nz, 0.18)
          else c.heading += Math.PI
        }
        c.wait = 0.4 + Math.random() * 1.6
      }
      // Pecking between hops.
      const peck = c.t >= 1 && Math.sin(t * 5 + c.phase) > 0.6
      head.rotation.x = peck ? 0.9 : Math.sin(t * 2 + c.phase) * 0.15
    }
    c.root.position.set(c.x, c.y, c.z)
    c.root.rotation.y = c.heading
  }

  // ---- Rabbits: hop in under a side hedge, graze, and keep out of the rain.

  private rabbitIn(garden: Garden, c: Critter) {
    const left = Math.random() < 0.5
    const y = T.yard
    const z = lerp(y.z0 + 6, y.z1 - 2, Math.random())
    this.place(c, left ? y.x0 - 1.5 : y.x1 + 1.5, 0, z)
    const spot = this.lawnSpot(garden, { x: left ? y.x0 + 5 : y.x1 - 5, z }, 3.5)
    this.hopTo(c, spot.x, spot.z)
  }

  private hopOff(c: Critter) {
    const y = T.yard
    const left = c.x < (y.x0 + y.x1) / 2
    this.hopTo(c, left ? y.x0 - 2 : y.x1 + 2, c.z)
  }

  private hopTo(c: Critter, x: number, z: number) {
    this.go(c, x, z, Math.max(0.3, Math.hypot(x - c.x, z - c.z) / 1.6))
  }

  private rabbit(garden: Garden, c: Critter, dt: number, t: number) {
    if (c.mode === 'away') return
    const { head, earL, earR } = c.parts
    if (c.t < 1) {
      c.t = Math.min(1, c.t + dt / c.span)
      c.x = lerp(c.fx, c.tx, c.t)
      c.z = lerp(c.fz, c.tz, c.t)
      // Bounding: one hop every 0.35 m or so.
      const hops = Math.max(1, Math.round(Math.hypot(c.tx - c.fx, c.tz - c.fz) / 0.35))
      c.y = Math.abs(Math.sin(c.t * hops * Math.PI)) * 0.12
      head.rotation.x = -0.2
      if (c.t >= 1) {
        if (c.mode === 'leaving') {
          c.mode = 'away'
          c.root.visible = false
          return
        }
        c.mode = 'here'
        c.wait = 2 + Math.random() * 4
      }
    } else {
      c.y = 0
      if (this.rained(garden, c.x, c.z)) {
        const spot = this.lawnSpot(garden, { x: c.x, z: c.z }, 6)
        this.hopTo(c, spot.x, spot.z)
        c.span *= 0.5
      } else {
        c.wait -= dt
        // Grazing, with now and then a look round.
        const look = Math.sin(t * 0.7 + c.phase) > 0.75
        head.rotation.x = look ? -0.3 : 0.45 + Math.sin(t * 6 + c.phase) * 0.06
        if (c.wait <= 0) {
          const spot = this.lawnSpot(garden, { x: c.x, z: c.z }, 1.2)
          this.hopTo(c, spot.x, spot.z)
          c.wait = 3 + Math.random() * 5
        }
      }
    }
    const twitch = Math.sin(t * 9 + c.phase) > 0.9 ? 0.25 : 0
    earL.rotation.z = -0.15 - twitch
    earR.rotation.z = 0.15
    c.root.position.set(c.x, c.y, c.z)
    c.root.rotation.y = c.heading
  }

  // ---- Frogs: climb out onto the bank, sit and croak, hop back in.

  private bankSpot() {
    const a = Math.random() * Math.PI * 2
    const r = T.pond.radius + 0.35
    return { x: T.pond.x + Math.cos(a) * r, z: T.pond.z + Math.sin(a) * r }
  }

  private frogIn(c: Critter) {
    const s = this.bankSpot()
    this.place(c, T.pond.x + (s.x - T.pond.x) * 0.6, -0.08, T.pond.z + (s.z - T.pond.z) * 0.6)
    this.go(c, s.x, s.z, 0.5)
  }

  private frogOff(c: Critter) {
    this.go(c, T.pond.x + (c.x - T.pond.x) * 0.55, T.pond.z + (c.z - T.pond.z) * 0.55, 0.5)
  }

  private frog(c: Critter, dt: number, t: number) {
    if (c.mode === 'away') return
    if (c.t < 1) {
      c.t = Math.min(1, c.t + dt / c.span)
      c.x = lerp(c.fx, c.tx, c.t)
      c.z = lerp(c.fz, c.tz, c.t)
      const sink = c.mode === 'leaving' ? -0.08 * c.t : c.mode === 'arriving' ? -0.08 * (1 - c.t) : 0
      c.y = Math.sin(c.t * Math.PI) * 0.12 + sink
      if (c.t >= 1) {
        if (c.mode === 'leaving') {
          c.mode = 'away'
          c.root.visible = false
          return
        }
        c.mode = 'here'
        c.wait = 4 + Math.random() * 8
        // Face the water, ready to jump in.
        c.heading = Math.atan2(T.pond.x - c.x, T.pond.z - c.z) + Math.PI
      }
    } else {
      c.wait -= dt
      if (c.wait <= 0) {
        // Hop along the bank, a little way at a time.
        const a = Math.atan2(c.z - T.pond.z, c.x - T.pond.x) + (Math.random() - 0.5) * 0.8
        const r = T.pond.radius + 0.35
        this.go(c, T.pond.x + Math.cos(a) * r, T.pond.z + Math.sin(a) * r, 0.4)
        c.wait = 4 + Math.random() * 8
      }
    }
    const croak = Math.max(0, Math.sin(t * 7 + c.phase)) * (Math.sin(t * 0.6 + c.phase) > 0.3 ? 1 : 0)
    c.parts.throat.scale.set(0.035 * (1 + croak * 0.8), 0.025 * (1 + croak), 0.03 * (1 + croak * 0.6))
    c.root.position.set(c.x, c.y, c.z)
    c.root.rotation.y = c.heading
  }

  // ---- Ducks: glide down onto the pond, paddle round, fly off.

  private duckIn(c: Critter) {
    const a = Math.random() * Math.PI * 2
    this.place(c, T.pond.x + Math.cos(a) * 18, 8, T.pond.z + Math.sin(a) * 18)
    this.go(c, T.pond.x + Math.cos(a) * 0.6, T.pond.z + Math.sin(a) * 0.6, 4)
  }

  private duck(c: Critter, dt: number, t: number) {
    if (c.mode === 'away') return
    if (c.mode !== 'here') {
      c.t = Math.min(1, c.t + dt / c.span)
      const s = smooth(c.t)
      c.x = lerp(c.fx, c.tx, s)
      c.z = lerp(c.fz, c.tz, s)
      c.y = c.mode === 'leaving' ? lerp(c.fy, 9, c.t * c.t) : lerp(c.fy, 0.02, 1 - (1 - c.t) * (1 - c.t))
      if (c.t >= 1) {
        if (c.mode === 'leaving') {
          c.mode = 'away'
          c.root.visible = false
          return
        }
        c.mode = 'here'
      }
    } else {
      // Paddle slow loops on the pond, each at its own pace.
      const i = this.ducks.indexOf(c)
      const a = t * (0.12 + i * 0.05) + c.phase
      const r = T.pond.radius * (0.45 + 0.15 * Math.sin(t * 0.21 + c.phase))
      const nx = T.pond.x + Math.cos(a) * r
      const nz = T.pond.z + Math.sin(a) * r
      c.heading = Math.atan2(nx - c.x, nz - c.z)
      c.x = nx
      c.z = nz
      c.y = 0.02 + Math.sin(t * 2 + c.phase) * 0.006
      c.parts.head.rotation.x = Math.sin(t * 0.9 + c.phase) > 0.85 ? 1.2 : 0
    }
    c.root.position.set(c.x, c.y, c.z)
    c.root.rotation.y = c.heading
  }

  // ---- Deer: walk along beyond the back hedge, stop to graze, walk on.

  private deerIn(c: Critter) {
    const z = T.yard.z0 - 3.4 - Math.random() * 0.8
    const fromLeft = Math.random() < 0.5
    this.place(c, fromLeft ? -4 : T.yard.x1 + 12, 0, z)
    this.go(c, lerp(-1, T.yard.x1 - 2, Math.random()), z, 1)
    c.span = Math.abs(c.tx - c.x) / 0.9
  }

  private deerOff(c: Critter) {
    const tx = T.yard.x1 + 14
    this.go(c, tx, c.z, Math.abs(tx - c.x) / 1.1)
  }

  private walker(c: Critter, dt: number, t: number) {
    if (c.mode === 'away') return
    const { neck, l0, l1, l2, l3 } = c.parts
    let walking = false
    if (c.t < 1) {
      walking = true
      c.t = Math.min(1, c.t + dt / c.span)
      c.x = lerp(c.fx, c.tx, c.t)
      c.z = lerp(c.fz, c.tz, c.t)
      if (c.t >= 1) {
        if (c.mode === 'leaving') {
          c.mode = 'away'
          c.root.visible = false
          return
        }
        c.mode = 'here'
        c.wait = 6 + Math.random() * 8
      }
    } else {
      c.wait -= dt
      if (c.wait <= 0) {
        const tx = THREE.MathUtils.clamp(c.x + (Math.random() - 0.5) * 6, -1, T.yard.x1 - 1)
        this.go(c, tx, c.z, Math.abs(tx - c.x) / 0.8 + 0.1)
      }
    }
    const stride = walking ? Math.sin(t * 6 + c.phase) * 0.35 : 0
    l0.rotation.x = l3.rotation.x = stride
    l1.rotation.x = l2.rotation.x = -stride
    // Head down to graze, up now and then to look about.
    const alert = Math.sin(t * 0.5 + c.phase) > 0.6
    neck.rotation.x += ((walking || alert ? -0.15 : 1.9) - neck.rotation.x) * Math.min(1, dt * 2)
    c.root.position.set(c.x, 0, c.z)
    c.root.rotation.y = c.heading
  }

  // ---- Geese: a V going over now and then in autumn.

  private updateGeese(on: boolean, dt: number, t: number) {
    const f = this.flock
    if (!f.on) {
      f.wait -= dt
      if (on && f.wait <= 0) {
        f.on = true
        f.t = 0
        // Heading south-west across the garden, the way geese go in autumn.
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
      // Back along the line of flight and out to the side, for the V.
      const back = rank * 1.6
      const out = side * rank * 1.3
      g.root.visible = true
      g.root.position.set(
        cx - f.dx * back + f.dz * out,
        16 + Math.sin(t * 0.8 + i) * 0.2,
        cz - f.dz * back - f.dx * out,
      )
      g.root.rotation.y = heading
      const flap = Math.sin(t * 6 + i * 0.7) * 0.5
      g.parts.wingL.rotation.z = flap
      g.parts.wingR.rotation.z = -flap
    })
  }
}
