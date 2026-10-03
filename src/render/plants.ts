/**
 * The plants, built from simple shapes. What matters is that each kind
 * reads at a glance, that growth is visible, and that an unhappy plant droops
 * and fades while a happy one stands up green.
 */
import * as THREE from 'three'
import type { Plant } from '../sim/garden'
import { T, type KindName } from '../tuning'
import { shaded } from './shade'

const blob = new THREE.IcosahedronGeometry(1, 1)
const ball = new THREE.SphereGeometry(1, 12, 8)
const stalk = new THREE.CylinderGeometry(1, 1, 1, 6)
stalk.translate(0, 0.5, 0)

const TIRED = new THREE.Color(0xa59a52)

/** Full-grown height of each plant, for placing its thought bubble. */
const HEIGHT: Record<KindName, number> = {
  tomato: 1.15,
  lettuce: 0.4,
  lavender: 0.85,
  sunflower: 2.5,
  fern: 0.75,
  moonflower: 0.7,
  apple: 3.6,
}

const ease = (t: number) => 1 - (1 - t) ** 2
const ramp = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)))

function lambert(color: number) {
  return shaded(new THREE.MeshStandardMaterial({ color }))
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  return m
}

export class PlantView {
  readonly root = new THREE.Group()
  /** Leans and droops with mood. */
  private body = new THREE.Group()
  private leaf: THREE.MeshStandardMaterial
  private healthy: THREE.Color
  private flowers: THREE.Object3D[] = []
  private fruit: THREE.Mesh[] = []
  private fruitMat?: THREE.MeshStandardMaterial
  private seed: THREE.Mesh
  private glow?: THREE.MeshStandardMaterial
  private phase = Math.random() * Math.PI * 2

  constructor(readonly kind: KindName) {
    this.root.add(this.body)
    const builders = {
      tomato: this.tomato,
      lettuce: this.lettuce,
      lavender: this.lavender,
      sunflower: this.sunflower,
      fern: this.fern,
      moonflower: this.moonflower,
      apple: this.apple,
    }
    const leafColor = {
      tomato: 0x4f8a3a,
      lettuce: 0x8cc152,
      lavender: 0x8fa58a,
      sunflower: 0x5c8f34,
      fern: 0x4f9a46,
      moonflower: 0x4a7d3a,
      apple: 0x4f8a3a,
    }[kind]
    this.healthy = new THREE.Color(leafColor)
    this.leaf = lambert(leafColor)
    builders[kind].call(this)

    this.seed = mesh(blob, lambert(0x5a4330))
    this.seed.scale.set(0.12, 0.05, 0.12)
    this.root.add(this.seed)
  }

  /** Height of the top of the plant, for placing its thought bubble. */
  get top() {
    return this.root.position.y + this.body.scale.y * HEIGHT[this.kind]
  }

  /**
   * `breeze` is 0 to 1 at this plant; the wind blows along (windX, windZ).
   * `night` is 0 by day and 1 in the dark, when moonflowers open.
   */
  update(p: Plant, time: number, breeze = 0, windX = 1, windZ = 0, night = 0) {
    const size = p.growth < T.stages.sprout ? 0.12 * ease(p.growth / T.stages.sprout) : 0.12 + 0.88 * ease(p.growth)
    const droop = 1 - p.mood
    this.body.scale.set(size, size * (1 - droop * 0.3), size)
    // Lean downwind in a breeze, flutter a little, and droop when unhappy.
    const gust = breeze * (0.22 + Math.sin(time * 7 + this.phase) * 0.06)
    this.body.rotation.x = droop * 0.25 + gust * windZ
    this.body.rotation.z = Math.sin(time * 1.3 + this.phase) * 0.035 * (1 - droop) - gust * windX
    this.leaf.color.copy(this.healthy).lerp(TIRED, droop * 0.75)
    this.seed.visible = p.growth < T.stages.leafy

    let flowering = ramp(p.growth, T.stages.flowering, T.stages.flowering + 0.08)
    if (T.kinds[this.kind].night) {
      flowering *= night
      if (this.glow) this.glow.emissiveIntensity = night * 0.9
    }
    // Picked or cut lately: only some of it has grown back.
    const back = Math.min(1, (time - p.picked) / T.people.regrow)
    const keep = (i: number, n: number) => i < Math.ceil(n * (0.25 + 0.75 * back))
    for (const [i, f] of this.flowers.entries()) {
      f.visible = flowering > 0 && keep(i, this.flowers.length)
      f.scale.setScalar(flowering * (f.userData.size as number))
    }
    if (this.fruitMat) {
      const set = ramp(p.growth, 0.82, 0.92)
      const ripe = ramp(p.growth, 0.9, 1)
      this.fruitMat.color.setRGB(0.45 + 0.45 * ripe, 0.62 - 0.45 * ripe, 0.2 - 0.08 * ripe)
      for (const [i, f] of this.fruit.entries()) {
        f.visible = set > 0 && keep(i, this.fruit.length)
        f.scale.setScalar(set * (f.userData.size as number))
      }
    }
  }

  private tomato() {
    const stem = mesh(stalk, this.leaf)
    stem.scale.set(0.035, 1.05, 0.035)
    this.body.add(stem)
    const cane = mesh(stalk, lambert(0x8a6a44))
    cane.scale.set(0.018, 1.25, 0.018)
    cane.position.set(0.09, 0, -0.04)
    this.root.add(cane)
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4
      const y = 0.18 + i * 0.1
      const leaf = mesh(blob, this.leaf)
      const s = 0.22 - i * 0.01
      leaf.scale.set(s, s * 0.22, s * 0.55)
      leaf.position.set(Math.cos(a) * s * 0.9, y, Math.sin(a) * s * 0.9)
      leaf.rotation.y = -a
      leaf.rotation.z = -0.25
      this.body.add(leaf)
    }
    const yellow = lambert(0xf3d34a)
    this.fruitMat = lambert(0x6f9e33)
    for (let i = 0; i < 6; i++) {
      const a = i * 2.1 + 0.5
      const y = 0.45 + (i % 3) * 0.18
      const flower = mesh(ball, yellow)
      flower.userData.size = 0.045
      flower.position.set(Math.cos(a) * 0.2, y + 0.08, Math.sin(a) * 0.2)
      this.flowers.push(flower)
      this.body.add(flower)
      const fruit = mesh(ball, this.fruitMat)
      fruit.userData.size = 0.085
      fruit.position.set(Math.cos(a) * 0.17, y, Math.sin(a) * 0.17)
      this.fruit.push(fruit)
      this.body.add(fruit)
    }
  }

  private lettuce() {
    const rings = [
      { n: 7, r: 0.2, tilt: 1.15, s: 0.26 },
      { n: 6, r: 0.11, tilt: 0.7, s: 0.2 },
      { n: 4, r: 0.04, tilt: 0.25, s: 0.14 },
    ]
    rings.forEach((ring, k) => {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + k * 0.4
        const pivot = new THREE.Group()
        pivot.rotation.y = -a
        const leaf = mesh(blob, this.leaf)
        leaf.scale.set(ring.s * 0.75, ring.s * 0.22, ring.s)
        leaf.rotation.x = 0
        leaf.position.set(0, ring.s * 0.6, 0)
        const tilt = new THREE.Group()
        tilt.position.x = ring.r
        tilt.rotation.z = -ring.tilt
        tilt.add(leaf)
        leaf.rotation.set(0, Math.PI / 2, 0)
        pivot.add(tilt)
        this.body.add(pivot)
      }
    })
    // A full, pale heart once it has headed up.
    const heart = mesh(blob, lambert(0xc8e38a))
    heart.userData.size = 0.16
    heart.position.y = 0.17
    this.flowers.push(heart)
    this.body.add(heart)
  }

  private lavender() {
    const purple = lambert(0x8e6bc4)
    const spike = new THREE.CapsuleGeometry(0.4, 1.6, 3, 6)
    for (let i = 0; i < 22; i++) {
      const a = i * 2.4
      const lean = 0.12 + (i % 5) * 0.07
      const h = 0.55 + (i % 4) * 0.08
      const pivot = new THREE.Group()
      pivot.rotation.set(Math.sin(a) * lean, 0, Math.cos(a) * lean)
      const stem = mesh(stalk, this.leaf)
      stem.scale.set(0.012, h, 0.012)
      pivot.add(stem)
      const flower = mesh(spike, purple)
      flower.userData.size = 0.045
      flower.position.y = h + 0.03
      pivot.add(flower)
      this.flowers.push(flower)
      this.body.add(pivot)
    }
    const mound = mesh(blob, this.leaf)
    mound.scale.set(0.22, 0.12, 0.22)
    mound.position.y = 0.06
    this.body.add(mound)
  }

  private sunflower() {
    const stem = mesh(stalk, this.leaf)
    stem.scale.set(0.05, 2.3, 0.05)
    this.body.add(stem)
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4
      const leaf = mesh(blob, this.leaf)
      const sz = 0.28 - i * 0.015
      leaf.scale.set(sz, sz * 0.15, sz * 0.75)
      leaf.position.set(Math.cos(a) * sz, 0.3 + i * 0.24, Math.sin(a) * sz)
      leaf.rotation.y = -a
      leaf.rotation.z = -0.4
      this.body.add(leaf)
    }
    // The head faces south, towards you, as sunflowers in a border do.
    const head = new THREE.Group()
    head.position.set(0, 2.35, 0.08)
    head.rotation.x = 0.35
    const petal = lambert(0xf5c518)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const pm = mesh(blob, petal)
      pm.scale.set(0.07, 0.17, 0.02)
      pm.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0)
      pm.rotation.z = a - Math.PI / 2
      head.add(pm)
    }
    const disc = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 18), lambert(0x5a3a1c))
    disc.rotation.x = Math.PI / 2
    head.add(disc)
    head.userData.size = 1
    this.flowers.push(head)
    this.body.add(head)
  }

  private fern() {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2
      const pivot = new THREE.Group()
      pivot.rotation.y = -a
      const arch = new THREE.Group()
      arch.rotation.z = -0.7 - (i % 3) * 0.15
      for (let k = 0; k < 4; k++) {
        const seg = mesh(blob, this.leaf)
        const sz = 0.16 - k * 0.025
        seg.scale.set(sz * 0.45, 0.025, sz)
        seg.rotation.y = Math.PI / 2
        seg.position.set(0, 0.12 + k * 0.17, 0)
        seg.rotation.x = k * 0.25
        arch.add(seg)
      }
      pivot.add(arch)
      this.body.add(pivot)
    }
    // New fronds uncurling at the heart once it's thriving.
    const curl = lambert(0x9ccc5a)
    for (let i = 0; i < 4; i++) {
      const f = mesh(ball, curl)
      f.userData.size = 0.05
      f.position.set(Math.cos(i * 1.6) * 0.06, 0.32, Math.sin(i * 1.6) * 0.06)
      this.flowers.push(f)
      this.body.add(f)
    }
  }

  private moonflower() {
    const mound = mesh(blob, this.leaf)
    mound.scale.set(0.38, 0.28, 0.38)
    mound.position.y = 0.2
    this.body.add(mound)
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4
      const leaf = mesh(blob, this.leaf)
      leaf.scale.set(0.16, 0.04, 0.16)
      leaf.position.set(Math.cos(a) * 0.32, 0.25 + (i % 3) * 0.12, Math.sin(a) * 0.32)
      this.body.add(leaf)
    }
    // White trumpets that open only after dark, and glow a little.
    this.glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 0 })
    const trumpet = new THREE.ConeGeometry(1, 1, 10, 1, true)
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05
      const f = mesh(trumpet, this.glow)
      f.userData.size = 0.14
      f.position.set(Math.cos(a) * 0.3, 0.45 + (i % 2) * 0.12, Math.sin(a) * 0.3)
      f.rotation.set(Math.PI + Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)
      this.flowers.push(f)
      this.body.add(f)
    }
  }

  private apple() {
    const trunk = mesh(new THREE.CylinderGeometry(0.11, 0.17, 1.8, 8), lambert(0x6b4f36))
    trunk.position.y = 0.9
    this.body.add(trunk)
    const crownPositions: [number, number, number, number][] = [
      [0, 2.5, 0, 1.05],
      [0.7, 2.2, 0.2, 0.75],
      [-0.65, 2.25, -0.1, 0.8],
      [0.1, 2.3, -0.65, 0.75],
      [-0.15, 2.15, 0.7, 0.7],
    ]
    for (const [x, y, z, sz] of crownPositions) {
      const c = mesh(blob, this.leaf)
      c.position.set(x, y, z)
      c.scale.set(sz, sz * 0.85, sz)
      this.body.add(c)
    }
    // Blossom first, then apples that redden as they ripen.
    const blossom = lambert(0xf7d7e0)
    this.fruitMat = lambert(0x8fb83a)
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4
      const up = 0.3 + (i % 5) * 0.12
      const r = 1.05
      const x = Math.cos(a) * r * Math.cos(up)
      const z = Math.sin(a) * r * Math.cos(up)
      const y = 2.3 + Math.sin(up) * r * 0.7
      const b = mesh(ball, blossom)
      b.userData.size = 0.09
      b.position.set(x, y + 0.05, z)
      this.flowers.push(b)
      this.body.add(b)
      if (i % 2 === 0) {
        const f = mesh(ball, this.fruitMat)
        f.userData.size = 0.12
        f.position.set(x * 0.98, y - 0.12, z * 0.98)
        this.fruit.push(f)
        this.body.add(f)
      }
    }
  }
}
