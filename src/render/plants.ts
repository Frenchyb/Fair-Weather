/**
 * The three plants, built from simple shapes. What matters is that each kind
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

const ease = (t: number) => 1 - (1 - t) ** 2
const ramp = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)))

function lambert(color: number) {
  return shaded(new THREE.MeshLambertMaterial({ color }))
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
  private leaf: THREE.MeshLambertMaterial
  private healthy: THREE.Color
  private flowers: THREE.Object3D[] = []
  private fruit: THREE.Mesh[] = []
  private fruitMat?: THREE.MeshLambertMaterial
  private seed: THREE.Mesh
  private phase = Math.random() * Math.PI * 2

  constructor(readonly kind: KindName) {
    this.root.add(this.body)
    const builders = { tomato: this.tomato, lettuce: this.lettuce, lavender: this.lavender }
    const leafColor = { tomato: 0x4f8a3a, lettuce: 0x8cc152, lavender: 0x8fa58a }[kind]
    this.healthy = new THREE.Color(leafColor)
    this.leaf = lambert(leafColor)
    builders[kind].call(this)

    this.seed = mesh(blob, lambert(0x5a4330))
    this.seed.scale.set(0.12, 0.05, 0.12)
    this.root.add(this.seed)
  }

  /** Height of the top of the plant, for placing its thought bubble. */
  get top() {
    return this.root.position.y + this.body.scale.y * { tomato: 1.15, lettuce: 0.4, lavender: 0.85 }[this.kind]
  }

  /** `breeze` is 0 to 1 at this plant; the wind blows along (windX, windZ). */
  update(p: Plant, time: number, breeze = 0, windX = 1, windZ = 0) {
    const size = p.growth < T.stages.sprout ? 0.12 * ease(p.growth / T.stages.sprout) : 0.12 + 0.88 * ease(p.growth)
    const droop = 1 - p.mood
    this.body.scale.set(size, size * (1 - droop * 0.3), size)
    // Lean downwind in a breeze, flutter a little, and droop when unhappy.
    const gust = breeze * (0.22 + Math.sin(time * 7 + this.phase) * 0.06)
    this.body.rotation.x = droop * 0.25 + gust * windZ
    this.body.rotation.z = Math.sin(time * 1.3 + this.phase) * 0.035 * (1 - droop) - gust * windX
    this.leaf.color.copy(this.healthy).lerp(TIRED, droop * 0.75)
    this.seed.visible = p.growth < T.stages.leafy

    const flowering = ramp(p.growth, T.stages.flowering, T.stages.flowering + 0.08)
    for (const f of this.flowers) {
      f.visible = flowering > 0
      f.scale.setScalar(flowering * (f.userData.size as number))
    }
    if (this.fruitMat) {
      const set = ramp(p.growth, 0.82, 0.92)
      const ripe = ramp(p.growth, 0.9, 1)
      this.fruitMat.color.setRGB(0.45 + 0.45 * ripe, 0.62 - 0.45 * ripe, 0.2 - 0.08 * ripe)
      for (const f of this.fruit) {
        f.visible = set > 0
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
}
