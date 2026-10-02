/**
 * The weather's moments: a rainbow after a sunny shower, a lightning bolt and
 * its flash, fireflies after dark, butterflies among the blooms, and a golden
 * shimmer over soil that lightning has enriched. Reads the garden only.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { T } from '../tuning'

const BANDS = [0xe8473c, 0xf08a3c, 0xf5d142, 0x6cc04a, 0x4a8fd6, 0x5a5fc8, 0x9a62c8]

export class Effects {
  /** 0 to 1: how bright the lightning flash is this frame. */
  flash = 0
  private rainbow = new THREE.Group()
  private rainbowMats: THREE.MeshBasicMaterial[] = []
  private bolt: THREE.Line
  private boltFor: unknown = null
  private fireflies: THREE.Points
  private flyHome: { x: number; z: number; phase: number }[] = []
  private butterflies: THREE.Group[] = []
  private sparkle: THREE.Points

  constructor(scene: THREE.Scene, garden: Garden) {
    // Rainbow: seven thin arcs, nested.
    BANDS.forEach((color, i) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false })
      const arc = new THREE.Mesh(new THREE.TorusGeometry(11 - i * 0.32, 0.17, 6, 96, Math.PI), mat)
      this.rainbow.add(arc)
      this.rainbowMats.push(mat)
    })
    this.rainbow.visible = false
    scene.add(this.rainbow)

    this.bolt = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3)),
      new THREE.LineBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 1, fog: false }),
    )
    this.bolt.frustumCulled = false
    this.bolt.visible = false
    scene.add(this.bolt)

    // Fireflies drift over the lawn near the pond and the oak.
    const n = T.render.fireflies
    this.fireflies = new THREE.Points(
      new THREE.BufferGeometry()
        .setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
        .setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)),
      new THREE.PointsMaterial({
        size: 0.13,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.fireflies.frustumCulled = false
    const homes = [
      [T.pond.x, T.pond.z, 4],
      [T.oak.x, T.oak.z, 5],
      [0, 5, 6],
      [-12, 0, 5],
    ]
    for (let i = 0; i < n; i++) {
      const [hx, hz, r] = homes[i % homes.length]
      const a = Math.random() * Math.PI * 2
      const d = Math.sqrt(Math.random()) * r
      this.flyHome.push({ x: hx + Math.cos(a) * d, z: hz + Math.sin(a) * d, phase: Math.random() * 20 })
    }
    scene.add(this.fireflies)

    const wing = new THREE.CircleGeometry(0.09, 8)
    for (let i = 0; i < T.render.butterflies; i++) {
      const color = [0xf0a030, 0xffffff, 0x6fa8e8, 0xf5d142][i % 4]
      const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })
      const b = new THREE.Group()
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group()
        const w = new THREE.Mesh(wing, mat)
        w.position.x = side * 0.08
        w.rotation.x = -Math.PI / 2
        pivot.add(w)
        b.add(pivot)
      }
      b.visible = false
      scene.add(b)
      this.butterflies.push(b)
    }

    const m = garden.plants.length * 8
    this.sparkle = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3)),
      new THREE.PointsMaterial({
        color: 0xffe08a,
        size: 0.07,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.sparkle.frustumCulled = false
    scene.add(this.sparkle)
  }

  update(garden: Garden, camera: THREE.Camera, dt: number) {
    this.updateRainbow(garden, camera)
    this.updateBolt(garden, dt)
    this.updateFireflies(garden)
    this.updateButterflies(garden)
    this.updateSparkle(garden)
  }

  private updateRainbow(garden: Garden, camera: THREE.Camera) {
    const r = garden.rainbow
    this.rainbow.visible = !!r
    if (!r) return
    const fadeIn = Math.min(1, r.age / 1.5)
    const fadeOut = Math.min(1, (T.rainbow.lasts - r.age) / 4)
    const o = 0.42 * Math.min(fadeIn, fadeOut) * garden.daylight
    for (const m of this.rainbowMats) m.opacity = o
    // Stand it up far off in the sky beyond the shower, square on to the viewer.
    const away = new THREE.Vector3(r.x - camera.position.x, 0, r.z - camera.position.z).normalize()
    this.rainbow.position.set(r.x + away.x * 22, -6, r.z + away.z * 22)
    this.rainbow.rotation.y = Math.atan2(away.x, away.z)
    this.rainbow.scale.setScalar(1.8)
  }

  private updateBolt(garden: Garden, dt: number) {
    const s = garden.strike
    this.flash = Math.max(0, this.flash - dt * 5)
    if (!s) {
      this.bolt.visible = false
      return
    }
    if (this.boltFor !== s) {
      this.boltFor = s
      this.flash = 1
      const pos = this.bolt.geometry.attributes.position as THREE.BufferAttribute
      const top = T.cloud.height - 0.3
      for (let i = 0; i < 16; i++) {
        const t = i / 15
        const jag = i === 0 || i === 15 ? 0 : 0.45
        pos.setXYZ(
          i,
          s.x + (Math.random() - 0.5) * jag,
          top * (1 - t),
          s.z + (Math.random() - 0.5) * jag,
        )
      }
      pos.needsUpdate = true
    }
    // A double flicker, as real strikes do.
    this.bolt.visible = s.age < 0.08 || (s.age > 0.13 && s.age < 0.22)
  }

  private updateFireflies(garden: Garden) {
    const night = 1 - garden.daylight
    this.fireflies.visible = night > 0.3
    if (!this.fireflies.visible) return
    const t = garden.time
    const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute
    const col = this.fireflies.geometry.attributes.color as THREE.BufferAttribute
    // More of them as the lawn fills with wildflowers.
    const lit = Math.min(1, 0.25 + garden.wildflowers.length / 40)
    this.flyHome.forEach((f, i) => {
      const p = t * 0.3 + f.phase
      pos.setXYZ(i, f.x + Math.sin(p * 1.3) * 0.6, 0.4 + Math.sin(p * 0.9) * 0.3 + 0.3, f.z + Math.cos(p) * 0.6)
      const blink = Math.max(0, Math.sin(t * 2.2 + f.phase * 3)) ** 3
      const on = i / this.flyHome.length < lit ? blink * night : 0
      col.setXYZ(i, 0.85 * on, 1 * on, 0.35 * on)
    })
    pos.needsUpdate = true
    col.needsUpdate = true
  }

  private updateButterflies(garden: Garden) {
    const t = garden.time
    const blooms = garden.plants.filter((p) => p.growth >= 1)
    const want = garden.daylight > 0.5 ? Math.min(this.butterflies.length, blooms.length + (garden.rainbow ? 8 : 0)) : 0
    this.butterflies.forEach((b, i) => {
      b.visible = i < want && blooms.length > 0
      if (!b.visible) return
      // Each one visits a bloom for a while, then moves on to another.
      const visit = Math.floor(t / 9 + i * 0.37)
      const home = blooms[(visit * 7 + i * 3) % blooms.length]
      const s = t * (0.9 + (i % 5) * 0.1) + i
      const x = home.x + Math.sin(s) * 0.7 + Math.sin(s * 2.7) * 0.2
      const z = home.z + Math.cos(s * 0.8) * 0.6
      const y = (home.inBed ? T.bed.height : 0) + 0.9 + Math.sin(s * 1.9) * 0.3
      b.position.set(x, y, z)
      b.rotation.y = -s
      const flap = Math.sin(t * 18 + i) * 0.9
      ;(b.children[0] as THREE.Group).rotation.z = flap
      ;(b.children[1] as THREE.Group).rotation.z = -flap
    })
  }

  private updateSparkle(garden: Garden) {
    const pos = this.sparkle.geometry.attributes.position as THREE.BufferAttribute
    const t = garden.time
    let k = 0
    for (const p of garden.plants) {
      const base = p.inBed ? T.bed.height : 0
      for (let j = 0; j < 8; j++, k++) {
        if (p.rich <= 0 || j / 8 > p.rich) {
          pos.setXYZ(k, 0, -5, 0)
          continue
        }
        const a = j * 0.785 + t * 0.6
        const rise = (t * 0.4 + j * 0.13) % 1
        pos.setXYZ(k, p.x + Math.cos(a) * 0.35, base + 0.05 + rise * 0.6, p.z + Math.sin(a) * 0.35)
      }
    }
    pos.needsUpdate = true
  }
}
