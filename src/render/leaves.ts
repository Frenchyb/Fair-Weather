/**
 * Leaf, petal and flower shapes for the plants: real outlines with a fold
 * down the midrib, a curve along their length and, for lettuce, a ruffled
 * edge, shaded darker at the base and lighter towards the tip. Every shape
 * carries vertex colours so one material per plant can tint them all.
 */
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type LeafShape = {
  length: number
  width: number
  /** Widest point along the leaf, 0 base to 1 tip. */
  widest?: number
  /** How far the two halves rise either side of the midrib, as a share of the half-width. */
  fold?: number
  /** How far the tip bends down, as a share of the length (negative cups it up). */
  curl?: number
  /** Waves along the edge, as a share of the width. */
  ruffle?: number
  /** A heart-shaped base. */
  heart?: boolean
  /** Brightness at the base and tip. */
  shade?: [number, number]
}

/** A single leaf lying along +z from its stalk at the origin, face up. */
export function leaf(s: LeafShape, rows = 9, cols = 4) {
  const { length, width, widest = 0.4, fold = 0.25, curl = 0.25, ruffle = 0, heart = false, shade = [0.72, 1.08] } = s
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rows; r++) {
    const t = r / rows
    // Width profile: rises to its widest point, then tapers to a point.
    const k = t < widest ? Math.sin((t / widest) * Math.PI * 0.5) : Math.cos(((t - widest) / (1 - widest)) * Math.PI * 0.5)
    let half = (width / 2) * Math.pow(Math.max(0, k), heart ? 0.6 : 0.85)
    if (heart && t < 0.12) half *= 0.6 + (t / 0.12) * 0.4
    for (let c = -cols; c <= cols; c++) {
      const u = c / cols
      const x = u * half
      let y = Math.abs(u) * fold * half - curl * length * t * t
      if (ruffle) y += Math.sin(t * 23 + u * 3) * Math.abs(u) ** 2 * ruffle * width
      const z = t * length * (1 - curl * curl * t * 0.3)
      pos.push(x, y, z)
      const light = shade[0] + (shade[1] - shade[0]) * t + (Math.abs(u) < 0.2 ? 0.06 : 0)
      col.push(light, light, light * 0.96)
    }
  }
  const w = cols * 2 + 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < w - 1; c++) {
      const a = r * w + c
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Give a plain shape a flat vertex colour, so it can share a vertex-coloured material. */
export function painted<G extends THREE.BufferGeometry>(g: G, light = 1): G {
  const n = g.attributes.position.count
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(light), 3))
  return g
}

/** A smooth lumpy ball, welded so it shades round rather than faceted. */
export function lump(detail = 2, seed = 1, bump = 0.08) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const m = mergeVertices(g)
  const p = m.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 5 + seed) * Math.sin(v.y * 4.3 + seed * 2) * Math.sin(v.z * 4.7 + seed * 3)
    v.multiplyScalar(1 + n * bump)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  m.computeVertexNormals()
  return painted(m)
}

/** Collects copies of shapes at their places, then welds them into one mesh's geometry. */
export class Bundle {
  private parts: THREE.BufferGeometry[] = []
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler(0, 0, 0, 'YXZ')

  /** `yaw` turns about the stem, `pitch` raises the tip (positive is up), `roll` twists along it. */
  add(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, scale: number | THREE.Vector3 = 1) {
    this.e.set(-pitch, yaw, roll)
    this.q.setFromEuler(this.e)
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale
    this.m.compose(new THREE.Vector3(x, y, z), this.q, s)
    // Keep only what every part shares, so they can be welded together.
    const part = g.clone()
    for (const name of Object.keys(part.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') part.deleteAttribute(name)
    }
    if (!part.attributes.normal) part.computeVertexNormals()
    if (!part.attributes.color) painted(part)
    this.parts.push(part.applyMatrix4(this.m))
    return this
  }

  get empty() {
    return this.parts.length === 0
  }

  build() {
    const g = mergeGeometries(this.parts.map((p) => (p.index ? p : mergeVertices(p))), false)
    this.parts = []
    return g
  }
}

/** A five-petalled star flower of unit radius, facing up (tomato, apple blossom). */
export function starFlower(petals = 5, cupped = 0.3, centre = 0.25) {
  const b = new Bundle()
  const petal = leaf({ length: 1, width: 0.55, widest: 0.55, fold: 0.1, curl: -cupped, shade: [1.0, 1.06] }, 5, 2)
  for (let i = 0; i < petals; i++) b.add(petal, 0, 0, 0, (i / petals) * Math.PI * 2, 0.15)
  const eye = painted(new THREE.SphereGeometry(centre, 8, 6), 0.75)
  eye.scale(1, 0.6, 1)
  b.add(eye, 0, 0.05, 0)
  return b.build()
}

/** A lavender spike: whorls of tiny florets up a unit-tall stem, fuller at the base. */
export function spike(whorls = 7) {
  const b = new Bundle()
  const bud = painted(new THREE.SphereGeometry(0.2, 6, 4))
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1)
    const r = 0.22 * (1 - t * 0.6)
    const n = w === whorls - 1 ? 1 : 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + w * 0.7
      const g = bud.clone()
      painted(g, 0.78 + t * 0.3)
      b.add(g, Math.cos(a) * r * (n > 1 ? 1 : 0), t, Math.sin(a) * r * (n > 1 ? 1 : 0), 0, 0, 0, 1 - t * 0.35)
    }
  }
  return b.build()
}

/** A fern frond: an arching stalk with leaflets either side, shorter towards the tip. */
export function frond(length: number, pairs = 13) {
  const b = new Bundle()
  const pinna = leaf({ length: 1, width: 0.28, widest: 0.3, fold: 0.15, curl: 0.15, shade: [0.8, 1.05] }, 5, 2)
  const arch = (t: number) => {
    // Rises, then curves over and down.
    const a = 0.95 - t * 1.6
    return a
  }
  let x = 0
  let y = 0
  const steps = pairs + 1
  const seg = length / steps
  const stalk = painted(new THREE.CylinderGeometry(0.006, 0.01, 1, 4), 0.8)
  stalk.translate(0, 0.5, 0)
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const a = arch(t)
    const dz = Math.cos(a) * seg
    const dy = Math.sin(a) * seg
    // The stalk piece, laid along this step.
    b.add(stalk, 0, y, x, 0, a - Math.PI / 2, 0, new THREE.Vector3(1, seg, 1))
    if (i > 0) {
      const len = length * 0.22 * Math.sin((1 - t) * Math.PI * 0.5 + 0.25) * (1 - t * 0.5)
      for (const side of [-1, 1]) b.add(pinna, 0, y, x, (side * Math.PI) / 2.4, a * 0.6 - 0.1, side * 0.3, len)
    }
    x += dz
    y += dy
  }
  b.add(pinna, 0, y, x, 0, arch(1), 0, length * 0.08)
  return b.build()
}

/** A trumpet flower opening upward: narrow tube, flared mouth, unit tall. */
export function trumpet() {
  const pts = [
    new THREE.Vector2(0.04, 0),
    new THREE.Vector2(0.07, 0.35),
    new THREE.Vector2(0.14, 0.65),
    new THREE.Vector2(0.32, 0.88),
    new THREE.Vector2(0.55, 1.0),
  ]
  const g = new THREE.LatheGeometry(pts, 16)
  // Five soft points round the rim.
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    if (v.y > 0.8) {
      const a = Math.atan2(v.z, v.x)
      const k = 1 + Math.cos(a * 5) * 0.12 * ((v.y - 0.8) / 0.2)
      p.setXYZ(i, v.x * k, v.y, v.z * k)
    }
  }
  g.computeVertexNormals()
  return painted(g)
}

/** A sunflower's seed head: brown florets set in the golden-angle spiral. */
export function seedHeadTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#3b2412'
  g.fillRect(0, 0, 256, 256)
  const n = 900
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(i / n) * 124
    const a = i * 2.39996
    const t = r / 124
    const x = 128 + Math.cos(a) * r
    const y = 128 + Math.sin(a) * r
    g.fillStyle = t < 0.35 ? '#6b5a1e' : t < 0.75 ? '#4a2e14' : '#2a170a'
    g.beginPath()
    g.arc(x, y, 2.2 + t * 1.6, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
