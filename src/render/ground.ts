/**
 * The lawn and what the weather leaves on it: grass that greens where it has
 * rained and lies over where the breeze has passed, wet ground and puddles,
 * lightning scorches that heal into fairy rings of mushrooms, and fog that
 * lingers after the cloud has moved on. Reads the garden; keeps only its own
 * animation state.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { T } from '../tuning'
import { fieldUniforms, seasonUniforms, shaded } from './shade'
import { surfaces } from './textures'
import { rng } from './world'

/** A soft round blob, for fog and scorch marks. */
function radialTexture(stops: [number, string][]) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [at, colour] of stops) grad.addColorStop(at, colour)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Three blades from one root, each two segments tall so it can bend. */
function clump() {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const r = rng(99)
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI + r() * 0.6
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const ox = (r() - 0.5) * 0.06
    const oz = (r() - 0.5) * 0.06
    const h = 0.24 + r() * 0.1
    const w = 0.022
    const lean = (r() - 0.5) * 0.08
    const base = pos.length / 3
    const ring: [number, number][] = [
      [-w, 0],
      [w, 0],
      [-w * 0.6, h * 0.55],
      [w * 0.6, h * 0.55],
      [0, h],
    ]
    for (const [s, y] of ring) {
      const t = y / h
      pos.push(ox + ca * s + lean * t * sa, y, oz + sa * s - lean * t * ca)
      // Normals point mostly up, so a lawn of blades lights like a lawn, not like slivers.
      nor.push(sa * 0.3, 1, -ca * 0.3)
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  g.normalizeNormals()
  return g
}

export class GroundView {
  private data: Uint8Array
  private tex: THREE.DataTexture
  private coverData: Uint8Array
  private cover: THREE.DataTexture
  private scorch: THREE.Mesh[] = []
  private scorchMat: THREE.MeshBasicMaterial[] = []
  private stems: THREE.InstancedMesh
  private caps: THREE.InstancedMesh
  private ringSpots: { dx: number; dz: number; s: number }[] = []
  private banks: THREE.Sprite[] = []
  private bankState: { x: number; z: number; age: number; life: number; size: number; drift: number }[] = []
  private bankClock = 0
  private m = new THREE.Matrix4()

  constructor(scene: THREE.Scene, garden: Garden, lite = false) {
    const g = garden.ground
    this.data = new Uint8Array(g.cols * g.rows * 4)
    this.tex = new THREE.DataTexture(this.data, g.cols, g.rows, THREE.RGBAFormat)
    this.tex.magFilter = THREE.LinearFilter
    this.tex.minFilter = THREE.LinearFilter
    this.tex.needsUpdate = true
    fieldUniforms.uField.value = this.tex
    this.coverData = new Uint8Array(g.cols * g.rows * 4)
    this.cover = new THREE.DataTexture(this.coverData, g.cols, g.rows, THREE.RGBAFormat)
    this.cover.magFilter = this.cover.minFilter = THREE.LinearFilter
    this.cover.needsUpdate = true
    seasonUniforms.uCover.value = this.cover
    fieldUniforms.uFieldMin.value.set(g.x0, g.z0)
    fieldUniforms.uFieldSize.value.set(g.cols * g.cell, g.rows * g.cell)

    // The ground itself, under the grass.
    const y = T.yard
    const lawnGeo = new THREE.PlaneGeometry(y.x1 - y.x0 + 60, y.z1 - y.z0 + 50, 1, 1)
    lawnGeo.rotateX(-Math.PI / 2)
    const lawnNormal = surfaces.grass.normal.clone()
    lawnNormal.repeat.set((y.x1 - y.x0 + 60) / 2.6, (y.z1 - y.z0 + 50) / 2.6)
    const lawnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, normalMap: lawnNormal })
    lawnMat.normalScale.setScalar(0.8)
    const lawn = new THREE.Mesh(lawnGeo, shaded(lawnMat, 'lawn'))
    lawn.position.set((y.x0 + y.x1) / 2, 0, (y.z0 + y.z1) / 2 + 8)
    lawn.receiveShadow = true
    scene.add(lawn)

    // Grass: a few tens of thousands of clumps, kept off beds, paving and water.
    const r = rng(41)
    const count = lite ? T.render.grassClumps / 4 : T.render.grassClumps
    const grass = new THREE.InstancedMesh(
      clump(),
      shaded(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), 'grass'),
      count,
    )
    const c = new THREE.Color()
    const s = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let placed = 0
    let tries = 0
    while (placed < count && tries++ < count * 4) {
      const x = y.x0 - 1 + r() * (y.x1 - y.x0 + 2)
      const z = y.z0 - 0.5 + r() * (y.z1 - y.z0 + 4)
      const inBed = Math.abs(x) < T.bed.width / 2 + 0.15 && Math.abs(z) < T.bed.depth / 2 + 0.15
      const inPond = Math.hypot(x - T.pond.x, z - T.pond.z) < T.pond.radius + 0.25
      const hard = T.hardGround.some((h) => x > h.x0 - 0.1 && x < h.x1 + 0.1 && z > h.z0 - 0.1 && z < h.z1 + 0.1)
      if (inBed || inPond || hard) continue
      const k = 0.8 + r() * 0.6
      q.setFromAxisAngle(up, r() * Math.PI * 2)
      this.m.compose(new THREE.Vector3(x, 0, z), q, s.set(k, k * (0.75 + r() * 0.5), k))
      grass.setMatrixAt(placed, this.m)
      grass.setColorAt(placed, c.setRGB(0.85 + r() * 0.3, 0.85 + r() * 0.3, 0.8 + r() * 0.2))
      placed++
    }
    grass.count = placed
    grass.receiveShadow = true
    grass.frustumCulled = false
    scene.add(grass)

    // Scorches, one per remembered strike.
    const burn = radialTexture([
      [0, 'rgba(20,14,8,0.95)'],
      [0.45, 'rgba(40,28,14,0.8)'],
      [0.75, 'rgba(60,45,25,0.35)'],
      [1, 'rgba(60,45,25,0)'],
    ])
    const disc = new THREE.PlaneGeometry(2.6, 2.6)
    disc.rotateX(-Math.PI / 2)
    for (let i = 0; i < T.lightning.marks; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: burn, transparent: true, depthWrite: false, opacity: 0 })
      const mesh = new THREE.Mesh(disc, mat)
      mesh.visible = false
      mesh.renderOrder = 1
      scene.add(mesh)
      this.scorch.push(mesh)
      this.scorchMat.push(mat)
    }

    // Fairy rings: mushrooms come up round each scorch as it heals.
    const per = 11
    for (let i = 0; i < per; i++) {
      const a = (i / per) * Math.PI * 2 + (r() - 0.5) * 0.3
      const d = 0.95 + (r() - 0.5) * 0.25
      this.ringSpots.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, s: 0.7 + r() * 0.6 })
    }
    const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.12, 6)
    stem.translate(0, 0.06, 0)
    const cap = new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
    cap.scale(1, 0.7, 1)
    cap.translate(0, 0.11, 0)
    const n = T.lightning.marks * per
    this.stems = new THREE.InstancedMesh(stem, shaded(new THREE.MeshStandardMaterial({ color: 0xeee6d4 })), n)
    this.caps = new THREE.InstancedMesh(cap, shaded(new THREE.MeshStandardMaterial({ color: 0xffffff })), n)
    for (let i = 0; i < n; i++) {
      // Mostly tan field mushrooms, with the odd red one.
      this.caps.setColorAt(i, c.setHex(i % 7 === 3 ? 0xc0392b : i % 3 === 0 ? 0xe9dcc0 : 0xb98a5a))
    }
    this.stems.count = this.caps.count = 0
    this.stems.castShadow = this.caps.castShadow = true
    scene.add(this.stems, this.caps)

    // Fog banks that settle where the fog has been and take a minute to burn off.
    const fogTex = radialTexture([
      [0, 'rgba(255,255,255,0.75)'],
      [0.5, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    for (let i = 0; i < T.render.fogBanks; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, transparent: true, depthWrite: false, opacity: 0 }))
      sp.visible = false
      scene.add(sp)
      this.banks.push(sp)
      this.bankState.push({ x: 0, z: 0, age: 1, life: 0, size: 1, drift: 0 })
    }
  }

  update(garden: Garden, dt: number) {
    const g = garden.ground
    const d = this.data
    const wetScale = 255 / T.ground.maxWet
    for (let k = 0; k < g.green.length; k++) {
      const o = k * 4
      d[o] = g.green[k] * 255
      d[o + 1] = Math.min(255, g.wet[k] * wetScale)
      d[o + 2] = (g.bendX[k] * 0.5 + 0.5) * 255
      d[o + 3] = (g.bendZ[k] * 0.5 + 0.5) * 255
    }
    this.tex.needsUpdate = true
    const cv = this.coverData
    for (let k = 0; k < g.snow.length; k++) {
      cv[k * 4] = g.snow[k] * 255
      cv[k * 4 + 1] = g.leaves[k] * 255
    }
    this.cover.needsUpdate = true

    this.updateMarks(garden)
    this.updateBanks(garden, dt)
  }

  private updateMarks(garden: Garden) {
    const L = T.lightning
    const marks = garden.marks
    let n = 0
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    this.scorch.forEach((mesh, i) => {
      const m = marks[i]
      mesh.visible = !!m
      if (!m) return
      // Black at first, then fading as the grass heals greener than before.
      this.scorchMat[i].opacity = Math.max(0, 1 - m.age / (L.ringAfter * 1.4)) * 0.9
      mesh.visible = this.scorchMat[i].opacity > 0.01
      mesh.position.set(m.x, 0.03, m.z)
      const grow = Math.min(1, Math.max(0, (m.age - L.ringAfter * 0.5) / (L.ringAfter * 0.5)))
      if (grow <= 0) return
      for (const spot of this.ringSpots) {
        const k = grow * spot.s
        p.set(m.x + spot.dx, 0, m.z + spot.dz)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.dx * 7)
        this.m.compose(p, q, s.set(k, k, k))
        this.stems.setMatrixAt(n, this.m)
        this.caps.setMatrixAt(n, this.m)
        n++
      }
    })
    this.stems.count = this.caps.count = n
    this.stems.instanceMatrix.needsUpdate = this.caps.instanceMatrix.needsUpdate = true
  }

  private updateBanks(garden: Garden, dt: number) {
    const c = garden.cloud
    const night = 1 - garden.daylight
    // While fogging, lay new banks down under the cloud.
    // On a foggy day, banks lie all over the garden.
    const foggy = garden.climate.fogginess
    if (c.fogging || foggy > 0.3) {
      this.bankClock += dt * (c.fogging ? 1 : foggy * 0.5)
      while (this.bankClock > 0.25) {
        this.bankClock -= 0.25
        const y = T.yard
        const wide = !c.fogging
        const bx = wide ? y.x0 + Math.random() * (y.x1 - y.x0) : c.x
        const bz = wide ? y.z0 + Math.random() * (y.z1 - y.z0) : c.z
        const i = this.bankState.findIndex((b) => b.age >= b.life)
        const free = i >= 0 ? i : this.bankState.reduce((o, b, j, a) => (b.age / b.life > a[o].age / a[o].life ? j : o), 0)
        const a = Math.random() * Math.PI * 2
        const r = wide ? 0 : Math.sqrt(Math.random()) * garden.radius
        this.bankState[free] = {
          x: bx + Math.cos(a) * r,
          z: bz + Math.sin(a) * r,
          age: 0,
          life: T.render.fogLingers * (0.7 + Math.random() * 0.6),
          size: 2.2 + Math.random() * 2,
          drift: (Math.random() - 0.5) * 0.3,
        }
      }
    }
    this.bankState.forEach((b, i) => {
      const sp = this.banks[i]
      b.age += dt
      const alive = b.age < b.life
      sp.visible = alive
      if (!alive) return
      b.x += (c.windX * 0.08 + b.drift * 0.2) * dt
      b.z += (c.windZ * 0.08) * dt
      const fade = Math.min(1, b.age / 1.5) * Math.min(1, (b.life - b.age) / (b.life * 0.6))
      sp.material.opacity = fade * (0.55 - night * 0.25)
      sp.position.set(b.x, 0.35 + b.size * 0.12, b.z)
      sp.scale.set(b.size * 1.6, b.size * 0.55, 1)
    })
  }
}
