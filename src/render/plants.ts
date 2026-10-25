/**
 * The plants. Each is built from real leaf and petal outlines (see
 * `leaves.ts`), welded into one mesh for its foliage, with flowers and fruit
 * kept separate so they can open, set and ripen. What matters is that each
 * kind reads at a glance, that growth is visible, and that an unhappy plant
 * droops and fades while a happy one stands up green.
 */
import * as THREE from 'three'
import type { Plant } from '../sim/garden'
import { T, type KindName } from '../tuning'
import { Bundle, canopy, frond, leaf, lump, painted, seedHeadTexture, spike, starFlower, trunk, trumpet, type Lump } from './leaves'
import { shaded } from './shade'
import { surfaces } from './textures'

const ball = new THREE.SphereGeometry(1, 16, 12)
const stalk = painted(new THREE.CylinderGeometry(0.8, 1, 1, 7))
stalk.translate(0, 0.5, 0)
const seedLump = lump(1, 4, 0.15)

// Shapes shared by every plant of a kind.
const SHAPES = {
  tomatoLeaflet: leaf({ length: 1, width: 0.55, widest: 0.35, fold: 0.3, curl: 0.35, ruffle: 0.05 }),
  lettuceLeaf: leaf({ length: 1, width: 0.9, widest: 0.62, fold: 0.35, curl: -0.15, ruffle: 0.09, shade: [1.15, 0.92] }, 12, 6),
  lavenderLeaf: leaf({ length: 1, width: 0.12, widest: 0.5, fold: 0.2, curl: 0.1, shade: [0.85, 1.05] }, 4, 1),
  sunflowerLeaf: leaf({ length: 1, width: 0.85, widest: 0.3, fold: 0.25, curl: 0.45, heart: true }, 10, 4),
  sunflowerPetal: leaf({ length: 1, width: 0.32, widest: 0.45, fold: 0.15, curl: 0.12, shade: [0.85, 1.1] }, 5, 2),
  heartLeaf: leaf({ length: 1, width: 0.95, widest: 0.32, fold: 0.2, curl: 0.3, heart: true }, 8, 4),
  fern: frond(0.85),
  star: starFlower(),
  blossom: starFlower(5, 0.45, 0.18),
  spike: spike(),
  trumpet: trumpet(),
  fiddlehead: painted(new THREE.TorusGeometry(1, 0.35, 6, 12, Math.PI * 1.5)),
}
let seedHead: THREE.Texture | null = null

const TIRED = new THREE.Color(0xa59a52)

/**
 * One flower or fruit drawn as an instance of a shared mesh: it keeps the
 * interface a separate mesh had (visible, scale, userData), and `flush`
 * writes it into the instanced mesh.
 */
class Slot {
  visible = true
  readonly scale = new THREE.Vector3(1, 1, 1)
  readonly userData: Record<string, unknown>
  private zero = new THREE.Vector3()
  constructor(
    private inst: THREE.InstancedMesh,
    private index: number,
    private position: THREE.Vector3,
    private quaternion: THREE.Quaternion,
    userData: Record<string, unknown>,
  ) {
    this.userData = userData
  }
  flush(m: THREE.Matrix4) {
    m.compose(this.position, this.quaternion, this.visible ? this.scale : this.zero)
    this.inst.setMatrixAt(this.index, m)
    this.inst.instanceMatrix.needsUpdate = true
  }
}

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

function lambert(color: number, roughness = 0.8) {
  return shaded(new THREE.MeshStandardMaterial({ color, roughness }))
}

/** Petals and leaves are thin: lit from either side, coloured per vertex. */
function sheet(color: number, roughness = 0.65) {
  return shaded(new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide, vertexColors: true }))
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export class PlantView {
  readonly root = new THREE.Group()
  /** Leans and droops with mood. */
  private body = new THREE.Group()
  private leaf: THREE.MeshStandardMaterial
  private healthy: THREE.Color
  private flowers: (THREE.Object3D | Slot)[] = []
  private fruit: (THREE.Object3D | Slot)[] = []
  private slots: Slot[] = []
  private m = new THREE.Matrix4()
  private fruitMat?: THREE.MeshStandardMaterial
  private seed: THREE.Mesh
  private glow?: THREE.MeshStandardMaterial
  private phase = Math.random() * Math.PI * 2
  /** Leaves and stems, welded into one mesh once the plant is built. */
  private green = new Bundle()
  private r: () => number

  constructor(readonly kind: KindName) {
    let seed = Math.floor(this.phase * 1000) + 7
    this.r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
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
      tomato: 0x3f7a2e,
      lettuce: 0x86c04a,
      lavender: 0x8fa287,
      sunflower: 0x4d8a2c,
      fern: 0x3f8a36,
      moonflower: 0x3b6e30,
      apple: 0x467f30,
    }[kind]
    this.healthy = new THREE.Color(leafColor)
    this.leaf = sheet(leafColor)
    builders[kind].call(this)
    if (!this.green.empty) this.body.add(mesh(this.green.build(), this.leaf))
    this.flowers = this.pack(this.flowers)
    this.fruit = this.pack(this.fruit)

    this.seed = mesh(seedLump, lambert(0x5a4330, 0.95))
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
      this.fruitMat.color.setRGB(0.45 + 0.45 * ripe, 0.62 - 0.5 * ripe, 0.2 - 0.12 * ripe)
      for (const [i, f] of this.fruit.entries()) {
        f.visible = set > 0 && keep(i, this.fruit.length)
        f.scale.setScalar(set * (f.userData.size as number))
      }
    }
    for (const s of this.slots) s.flush(this.m)
  }

  /** Turn repeated flowers or fruit into instances of one mesh: a draw call per kind, not per flower. */
  private pack(list: (THREE.Object3D | Slot)[]) {
    const groups = new Map<string, THREE.Mesh[]>()
    for (const o of list) {
      const m = o as THREE.Mesh
      if (!m.isMesh || m.parent !== this.body) continue
      const key = m.geometry.uuid + (m.material as THREE.Material).uuid
      groups.set(key, [...(groups.get(key) ?? []), m])
    }
    const swap = new Map<THREE.Object3D, Slot>()
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue
      const inst = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length)
      inst.castShadow = true
      inst.receiveShadow = true
      meshes.forEach((m, i) => {
        const slot = new Slot(inst, i, m.position.clone(), m.quaternion.clone(), m.userData)
        swap.set(m, slot)
        this.slots.push(slot)
        m.removeFromParent()
      })
      this.body.add(inst)
    }
    return list.map((o) => swap.get(o as THREE.Object3D) ?? o)
  }

  /** A tapering stem from `from` to `to`, `r` thick at the base. */
  private stem(from: THREE.Vector3, to: THREE.Vector3, r: number) {
    const d = to.clone().sub(from)
    const len = d.length()
    const pitch = Math.asin(d.y / len) - Math.PI / 2
    const yaw = Math.atan2(d.x, d.z)
    this.green.add(stalk, from.x, from.y, from.z, yaw, pitch, 0, new THREE.Vector3(r, len, r))
  }

  /** Something that opens with the flowers: `geo` at `size`, placed and turned. */
  private bloom(geo: THREE.BufferGeometry, mat: THREE.Material, size: number, at: THREE.Vector3, rot?: THREE.Euler) {
    const m = mesh(geo, mat)
    m.userData.size = size
    m.position.copy(at)
    if (rot) m.rotation.copy(rot)
    this.flowers.push(m)
    this.body.add(m)
    return m
  }

  private tomato() {
    const r = this.r
    this.stem(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 1.05, -0.01), 0.03)
    const cane = mesh(stalk, lambert(0x8a6a44))
    cane.scale.set(0.016, 1.25, 0.016)
    cane.position.set(0.09, 0, -0.04)
    this.root.add(cane)
    // Compound leaves: a stalk with leaflets in pairs and one at the end.
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4
      const y = 0.12 + i * 0.085
      const len = 0.42 - i * 0.018
      const dir = new THREE.Vector3(Math.sin(a), 0.25 - i * 0.02, Math.cos(a)).normalize()
      const base = new THREE.Vector3(0, y, 0)
      const tip = base.clone().addScaledVector(dir, len)
      this.stem(base, tip, 0.008)
      for (let k = 1; k <= 3; k++) {
        const at = base.clone().addScaledVector(dir, (len * k) / 3.3)
        const s = 0.1 + 0.045 * (k / 3)
        for (const side of [-1, 1]) this.green.add(SHAPES.tomatoLeaflet, at.x, at.y, at.z, a + side * 1.2, -0.15, side * 0.4, s)
      }
      this.green.add(SHAPES.tomatoLeaflet, tip.x, tip.y, tip.z, a, -0.2 - r() * 0.2, 0, 0.15)
    }
    const yellow = sheet(0xf3d34a, 0.6)
    this.fruitMat = shaded(new THREE.MeshStandardMaterial({ color: 0x6f9e33, roughness: 0.28 }))
    const calyx = sheet(0x3f7a2e)
    for (let i = 0; i < 6; i++) {
      const a = i * 2.1 + 0.5
      const y = 0.45 + (i % 3) * 0.18
      this.bloom(SHAPES.star, yellow, 0.05, new THREE.Vector3(Math.cos(a) * 0.2, y + 0.08, Math.sin(a) * 0.2), new THREE.Euler(Math.PI * 0.6, a, 0))
      const fruit = new THREE.Group()
      const tom = mesh(ball, this.fruitMat)
      tom.scale.set(1, 0.85, 1)
      const cap = mesh(SHAPES.star, calyx)
      cap.position.y = 0.8
      cap.scale.setScalar(0.45)
      fruit.add(tom, cap)
      fruit.userData.size = 0.085
      fruit.position.set(Math.cos(a) * 0.17, y, Math.sin(a) * 0.17)
      this.fruit.push(fruit)
      this.body.add(fruit)
    }
  }

  private lettuce() {
    const r = this.r
    // A rosette: broad ruffled outer leaves lying open, inner ones cupped and upright.
    const rings = [
      { n: 9, len: 0.34, lift: 0.3 },
      { n: 8, len: 0.28, lift: 0.7 },
      { n: 6, len: 0.2, lift: 1.1 },
    ]
    rings.forEach((ring, k) => {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + k * 0.45 + r() * 0.2
        this.green.add(SHAPES.lettuceLeaf, 0, 0.02 + k * 0.03, 0, a, ring.lift + r() * 0.15, (r() - 0.5) * 0.3, ring.len * (0.9 + r() * 0.2))
      }
    })
    // A full, pale heart once it has headed up.
    const heart = new THREE.Group()
    const pale = sheet(0xc8e38a, 0.6)
    const b = new Bundle()
    for (let i = 0; i < 6; i++) b.add(SHAPES.lettuceLeaf, 0, 0, 0, i * 1.05, 1.35, 0, 0.75)
    heart.add(mesh(b.build(), pale))
    heart.userData.size = 0.2
    heart.position.y = 0.06
    this.flowers.push(heart)
    this.body.add(heart)
  }

  private lavender() {
    const r = this.r
    const purple = sheet(0x8e6bc4, 0.75)
    // A silvery mound of narrow leaves.
    for (let i = 0; i < 46; i++) {
      const a = i * 2.4
      this.green.add(SHAPES.lavenderLeaf, Math.cos(a) * 0.05, 0.02 + (i % 4) * 0.03, Math.sin(a) * 0.05, Math.PI / 2 - a, 0.5 + r() * 0.7, 0, 0.14 + r() * 0.06)
    }
    for (let i = 0; i < 24; i++) {
      const a = i * 2.4
      const lean = 0.12 + (i % 5) * 0.07
      const h = 0.55 + (i % 4) * 0.08
      const tip = new THREE.Vector3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h)
      this.stem(new THREE.Vector3(0, 0.05, 0), tip, 0.006)
      this.bloom(SHAPES.spike, purple, 0.13, tip, new THREE.Euler(Math.sin(a) * lean, 0, -Math.cos(a) * lean))
    }
  }

  private sunflower() {
    const r = this.r
    this.stem(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.32, 0.04), 0.045)
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4
      const y = 0.3 + i * 0.22
      const sz = 0.42 - i * 0.025
      const out = new THREE.Vector3(Math.sin(a) * 0.08, y + 0.03, Math.cos(a) * 0.08)
      this.stem(new THREE.Vector3(0, y, 0), out, 0.01)
      this.green.add(SHAPES.sunflowerLeaf, out.x, out.y, out.z, a, 0.1 - r() * 0.2, 0, sz)
    }
    // The head faces south, towards you, as sunflowers in a border do.
    const head = new THREE.Group()
    head.position.set(0, 2.35, 0.08)
    head.rotation.x = 0.35
    const petal = sheet(0xf5c518, 0.6)
    const petals = new Bundle()
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (i % 2) * 0.12
      // Laid out in the head's own plane, which faces +z.
      const g = SHAPES.sunflowerPetal.clone().rotateX(-Math.PI / 2 + 0.25 * (i % 2 ? 1 : 0.4)).rotateZ(a - Math.PI / 2)
      petals.add(g, Math.cos(a) * 0.13, Math.sin(a) * 0.13, i % 2 ? -0.005 : 0.005, 0, 0, 0, 0.19 + (i % 3) * 0.015)
    }
    head.add(mesh(petals.build(), petal))
    seedHead ??= seedHeadTexture()
    const discMat = lambert(0xffffff, 0.95)
    discMat.map = seedHead
    const disc = mesh(new THREE.CircleGeometry(0.16, 32), discMat)
    disc.position.z = 0.02
    head.add(disc)
    const back = mesh(new THREE.SphereGeometry(0.17, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x4d7a2c))
    back.scale.set(1, 0.4, 1)
    back.rotation.x = -Math.PI / 2
    head.add(back)
    head.userData.size = 1
    this.flowers.push(head)
    this.body.add(head)
  }

  private fern() {
    const r = this.r
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + r() * 0.3
      this.green.add(SHAPES.fern, 0, 0.02, 0, a, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, 0.8 + r() * 0.35)
    }
    // New fronds uncurling at the heart once it's thriving.
    const curl = lambert(0x9ccc5a)
    for (let i = 0; i < 4; i++) {
      this.bloom(
        SHAPES.fiddlehead,
        curl,
        0.045,
        new THREE.Vector3(Math.cos(i * 1.6) * 0.06, 0.3, Math.sin(i * 1.6) * 0.06),
        new THREE.Euler(0, i * 1.6, 0),
      )
    }
  }

  private moonflower() {
    const r = this.r
    // A low tangle of vine: heart-shaped leaves on short stalks round a dark heart.
    const core = lump(2, 3, 0.18)
    this.green.add(core, 0, 0.18, 0, 0, 0, 0, new THREE.Vector3(0.3, 0.2, 0.3))
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4
      const d = 0.12 + (i % 3) * 0.1
      const y = 0.12 + (i % 4) * 0.09
      this.green.add(SHAPES.heartLeaf, Math.cos(a) * d, y, Math.sin(a) * d, Math.PI / 2 - a, 0.1 + r() * 0.4, (r() - 0.5) * 0.5, 0.16 + r() * 0.06)
    }
    // White trumpets that open only after dark, and glow a little.
    this.glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 0, side: THREE.DoubleSide, vertexColors: true })
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05
      this.bloom(
        SHAPES.trumpet,
        this.glow,
        0.15,
        new THREE.Vector3(Math.cos(a) * 0.28, 0.42 + (i % 2) * 0.12, Math.sin(a) * 0.28),
        new THREE.Euler(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7),
      )
    }
  }

  private apple() {
    const bark = lambert(0xb0a090, 0.95)
    bark.map = surfaces.bark.map
    bark.normalMap = surfaces.bark.normal
    const crown: Lump[] = [
      [0, 2.55, 0, 0.95],
      [0.7, 2.25, 0.2, 0.7],
      [-0.65, 2.3, -0.1, 0.75],
      [0.1, 2.35, -0.65, 0.7],
      [-0.15, 2.2, 0.7, 0.66],
    ]
    // A short trunk forking into boughs, one up into each lump of the crown.
    this.body.add(mesh(trunk(crown, 1.4, 0.15, 11), bark))
    this.green.add(canopy(crown, { length: 1, width: 0.42, widest: 0.5, fold: 0.25, curl: 0.15 }, 0.16, T.render.canopy.sprays * 2.2, T.render.canopy.core, 11), 0, 0, 0)
    // Blossom first, then apples that redden as they ripen.
    const blossom = sheet(0xf7d7e0, 0.6)
    this.fruitMat = shaded(new THREE.MeshStandardMaterial({ color: 0x8fb83a, roughness: 0.35 }))
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4
      const up = 0.3 + (i % 5) * 0.12
      const rr = 1.08
      const x = Math.cos(a) * rr * Math.cos(up)
      const z = Math.sin(a) * rr * Math.cos(up)
      const y = 2.3 + Math.sin(up) * rr * 0.7
      this.bloom(SHAPES.blossom, blossom, 0.08, new THREE.Vector3(x, y + 0.05, z), new THREE.Euler(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9))
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
