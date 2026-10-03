/**
 * The garden's fixed scenery: fence and hedge, the house and patio,
 * paths, shed, oak, pond, bird bath and bench. Built once; the only thing
 * that changes afterwards is the house windows glowing after dark.
 */
import * as THREE from 'three'
import { T } from '../tuning'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import lanternGlb from '../assets/lantern.glb'
import { shaded } from './shade'
import { surfaces } from './textures'

const ICE = new THREE.Color(0xb8cad6)

/** Deterministic scatter, so the garden looks the same every visit. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

export function lambert(color: number | THREE.Color) {
  return shaded(new THREE.MeshStandardMaterial({ color }))
}

/** Paving and stones: darken in the rain and hold puddles. */
function paving(color: number | THREE.Color) {
  return shaded(new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), 'wet')
}

/**
 * A clump of foliage: a lumpy ball, lighter on top where the sun gets in and
 * darker underneath, so a crown made of a few of them reads as leaves, not as
 * a sphere.
 */
export function foliage(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 3)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const colours: number[] = []
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n =
      Math.sin(v.x * 7 + seed) * Math.sin(v.y * 6.1 + seed * 1.7) * Math.sin(v.z * 6.7 + seed * 2.3) * 0.12 +
      Math.sin(v.x * 17 + seed * 3) * Math.sin(v.z * 15 + seed) * 0.04
    v.multiplyScalar(1 + n)
    p.setXYZ(i, v.x, v.y, v.z)
    const light = 0.55 + 0.45 * (v.y * 0.5 + 0.5) + n * 1.5
    colours.push(light, light, light * 0.95)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  g.computeVertexNormals()
  return g
}

/** Leaves that turn in autumn and drop in winter, or (`evergreen`) stay. */
function leaves(color: THREE.Color, evergreen = false) {
  return shaded(new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.85 }), evergreen ? 'evergreen' : 'foliage')
}

function add(parent: THREE.Object3D, mesh: THREE.Mesh, cast = true, receive = true) {
  mesh.castShadow = cast
  mesh.receiveShadow = receive
  parent.add(mesh)
  return mesh
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

/** A triangular prism for a gable roof, ridge along x. */
function gable(width: number, depth: number, rise: number) {
  const s = new THREE.Shape()
  s.moveTo(-depth / 2, 0)
  s.lineTo(depth / 2, 0)
  s.lineTo(0, rise)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false })
  g.translate(0, 0, -width / 2)
  g.rotateY(Math.PI / 2)
  return g
}

export class World {
  readonly root = new THREE.Group()
  private windows: THREE.MeshStandardMaterial
  private lamps = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc46a, emissiveIntensity: 0 })
  private oakLeaves: THREE.MeshStandardMaterial[] = []
  /** Deciduous crowns: bare in winter, so they stop casting full shadows. */
  private crowns: THREE.Mesh[] = []
  private water!: THREE.MeshStandardMaterial
  private lilies: THREE.Mesh[] = []
  private r = rng(7)

  constructor() {
    this.windows = new THREE.MeshStandardMaterial({ color: 0x9cc3d6, emissive: 0xffc070, emissiveIntensity: 0 })
    this.boundary()
    this.house()
    this.paths()
    this.shed()
    this.oak()
    this.pond()
    this.ornaments()
    this.lanterns()
  }

  /** Two garden lanterns by the patio (Kenney, CC0), lit after dark. */
  private lanterns() {
    const p = T.hardGround[1]
    const spots: [number, number][] = [
      [p.x1 + 0.35, p.z1 + 0.35],
      [p.x0 - 0.35, p.z1 + 0.35],
    ]
    new GLTFLoader().load(lanternGlb, (gltf) => {
      const model = gltf.scene
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      const k = 1.9 / size.y
      for (const [x, z] of spots) {
        const lamp = model.clone()
        lamp.scale.setScalar(k)
        lamp.position.set(x, 0, z)
        lamp.traverse((o) => (o.castShadow = true))
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), this.lamps)
        bulb.position.set(x, 1.9 * 0.86, z)
        this.root.add(lamp, bulb)
      }
    })
  }

  /**
   * The oak stands between the camera and the ferns it shades, so its crown
   * turns see-through while the cloud is working near it.
   */
  fadeOak(cloudX: number, cloudZ: number, dt: number) {
    const near = Math.hypot(cloudX - T.oak.x, cloudZ - T.oak.z) < T.oak.crownRadius + 3
    for (const m of this.oakLeaves) {
      m.opacity += ((near ? 0.28 : 1) - m.opacity) * (1 - Math.exp(-dt * 4))
      m.transparent = m.opacity < 0.99
      m.depthWrite = !m.transparent
    }
  }

  /** Winter: bare trees, a frozen pond, lily pads gone under the ice. */
  setWinter(winter: number) {
    const bare = winter > 0.5
    for (const c of this.crowns) c.castShadow = !bare
    for (const l of this.lilies) l.visible = winter < 0.3
    this.water.color.setHex(0x4b87a8).lerp(ICE, winter)
    this.water.roughness = 0.12 + winter * 0.3
  }

  /** 0 by day, 1 at night: lights on in the house. `inside` adds a glow when someone is in at the window. */
  setNight(night: number, inside = 0) {
    this.windows.emissiveIntensity = Math.max(night, inside * 0.35) * 1.4
    this.lamps.emissiveIntensity = night * 4
  }

  private boundary() {
    const r = this.r
    const wood = lambert(0xb08a5e)
    const post = new THREE.BoxGeometry(0.12, 1.3, 0.12)
    const y = T.yard
    const back = y.z0 - 0.5
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const n = Math.ceil(len / 1.6)
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const p = new THREE.Mesh(post, wood)
        p.position.set(x0 + (x1 - x0) * t, 0.65, z0 + (z1 - z0) * t)
        add(this.root, p, true, false)
      }
      for (const h of [0.45, 1.05]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.06), wood)
        rail.position.set((x0 + x1) / 2, h, (z0 + z1) / 2)
        rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
        add(this.root, rail, true, false)
      }
    }
    run(y.x0 - 0.5, back, y.x1 + 0.5, back)
    run(y.x0 - 0.5, back, y.x0 - 0.5, y.z1 + 2)
    run(y.x1 + 0.5, back, y.x1 + 0.5, y.z1 + 2)

    // A hedge of round shrubs outside the fence, and trees beyond it.
    const crown = foliage(3)
    const shrub = (x: number, z: number, s: number) => {
      const mat = leaves(new THREE.Color().setHSL(0.25 + r() * 0.05, 0.4, 0.27 + r() * 0.08), true)
      const m = new THREE.Mesh(crown, mat)
      m.scale.set(s * 1.2, s, s)
      m.position.set(x, s * 0.6, z)
      add(this.root, m, true, false)
    }
    for (let x = y.x0 - 3; x <= y.x1 + 3; x += 1.3 + r() * 0.6) shrub(x, back - 1 - r() * 0.6, 0.7 + r() * 0.5)
    for (let z = back; z <= y.z1 + 3; z += 1.3 + r() * 0.6) {
      shrub(y.x0 - 1.6 - r() * 0.5, z, 0.7 + r() * 0.5)
      shrub(y.x1 + 1.6 + r() * 0.5, z, 0.7 + r() * 0.5)
    }
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 7)
    trunk.translate(0, 1.5, 0)
    const bark = lambert(0x5f4630)
    for (let x = y.x0 - 6; x <= y.x1 + 6; x += 4 + r() * 3) {
      const t = new THREE.Group()
      add(t, new THREE.Mesh(trunk, bark), true, false)
      const c = new THREE.Mesh(crown, leaves(new THREE.Color().setHSL(0.27 + r() * 0.04, 0.35, 0.25 + r() * 0.06)))
      c.position.y = 4
      c.scale.set(2.4, 2.2, 2.4)
      add(t, c, true, false)
      this.crowns.push(c)
      t.position.set(x, 0, back - 5 - r() * 3)
      t.scale.setScalar(0.9 + r() * 0.5)
      this.root.add(t)
    }
  }

  private house() {
    const h = new THREE.Group()
    const wall = lambert(0xefe6d2)
    const trim = lambert(0xffffff)
    const roof = lambert(0x7a4a3a)
    const W = 9
    const D = 5.6
    const H = 3
    add(h, box(W, H, D, wall, 0, H / 2, 0))
    const r = new THREE.Mesh(gable(W + 0.6, D + 0.8, 2.2), roof)
    r.position.y = H
    add(h, r)
    add(h, box(0.7, 1.6, 0.7, lambert(0x9a5b47), 2.4, H + 1.6, -0.8))
    // Front: a door, four windows, a step and a little porch roof.
    const front = D / 2 + 0.03
    add(h, box(1.1, 2.1, 0.08, lambert(0x4f6b57), 0.8, 1.05, front))
    for (const x of [-3.2, -1.4, 2.6]) {
      add(h, box(1.2, 1.1, 0.1, trim, x, 1.7, front), false)
      add(h, box(1.0, 0.9, 0.12, this.windows, x, 1.7, front + 0.01), false)
    }
    add(h, box(1.8, 0.18, 0.9, lambert(0xb7ad9c), 0.8, 0.09, front + 0.45))
    const porch = box(2.2, 0.1, 1.2, roof, 0.8, 2.45, front + 0.55)
    porch.rotation.x = 0.2
    add(h, porch)
    // Window boxes full of flowers under the front windows.
    for (const x of [-3.2, -1.4, 2.6]) {
      add(h, box(1.2, 0.22, 0.25, lambert(0x8c5a3c), x, 1.05, front + 0.14))
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), lambert([0xd8432f, 0xf2c14e, 0xe48fb0][i % 3]))
        f.position.set(x - 0.45 + i * 0.22, 1.22, front + 0.16)
        add(h, f, false)
      }
    }
    const [hx0, hx1, hz0, hz1] = [T.hardGround[0].x0, T.hardGround[0].x1, T.hardGround[0].z0, T.hardGround[0].z1]
    h.position.set((hx0 + hx1) / 2, 0, (hz0 + hz1) / 2 + 0.4)
    this.root.add(h)

    // The patio: flagstones, a table, two chairs, and pots at the corners.
    const p = T.hardGround[1]
    const r2 = rng(11)
    // Stone paving, photographed, with a brick-coloured edge.
    const pw = p.x1 - p.x0
    const pd = p.z1 - p.z0
    const tiles = (t: THREE.Texture) => {
      const c = t.clone()
      c.repeat.set(pw / 2.2, pd / 2.2)
      return c
    }
    const stone = paving(0xffffff)
    stone.map = tiles(surfaces.stone.map)
    stone.normalMap = tiles(surfaces.stone.normal)
    stone.roughnessMap = tiles(surfaces.stone.rough)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.06, pd), stone)
    // Box UVs run 0..1 on the top face, so the repeat above sets the tile size.
    slab.position.set((p.x0 + p.x1) / 2, 0.03, (p.z0 + p.z1) / 2)
    add(this.root, slab, false)
    const edge = lambert(0x9a6b52)
    for (const [w, d, x, z] of [
      [pw + 0.2, 0.1, (p.x0 + p.x1) / 2, p.z1 + 0.05],
      [0.1, pd, p.x0 - 0.05, (p.z0 + p.z1) / 2],
      [0.1, pd, p.x1 + 0.05, (p.z0 + p.z1) / 2],
    ] as [number, number, number, number][]) {
      add(this.root, box(w, 0.08, d, edge, x, 0.04, z), false)
    }
    const cx = (p.x0 + p.x1) / 2 + 1
    const cz = (p.z0 + p.z1) / 2
    const iron = lambert(0x3d4440)
    add(this.root, box(0.08, 0.72, 0.08, iron, cx, 0.36, cz))
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), lambert(0xe9e4d8))
    top.position.set(cx, 0.74, cz)
    add(this.root, top)
    for (const dx of [-0.85, 0.85]) {
      add(this.root, box(0.45, 0.06, 0.45, lambert(0x8f6a45), cx + dx, 0.45, cz))
      add(this.root, box(0.45, 0.5, 0.06, lambert(0x8f6a45), cx + dx * 1.25, 0.7, cz))
    }
    const pot = new THREE.CylinderGeometry(0.32, 0.24, 0.5, 12)
    pot.translate(0, 0.25, 0)
    for (const [x, z] of [
      [p.x0 + 0.4, p.z1 - 0.4],
      [p.x1 - 0.4, p.z1 - 0.4],
      [p.x1 - 0.4, p.z0 + 0.4],
    ]) {
      const tub = new THREE.Mesh(pot, lambert(0xb5653a))
      tub.position.set(x, 0, z)
      add(this.root, tub)
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), lambert(0x4e7f3a))
      leaf.position.set(x, 0.75, z)
      add(this.root, leaf)
    }

    // Foundation planting: boxwood balls and a strip of flowers along the house.
    const ball = foliage(5).scale(0.45, 0.45, 0.45)
    const boxwood = leaves(new THREE.Color(0x3f6b32), true)
    for (const x of [hx0 + 0.6, hx0 + 1.6, hx1 - 0.6, hx1 - 1.6]) {
      const b = new THREE.Mesh(ball, boxwood)
      b.position.set(x, 0.4, p.z0 + 0.2)
      add(this.root, b)
    }
    const bloom = new THREE.IcosahedronGeometry(0.08, 0)
    const n = 220
    const flowers = new THREE.InstancedMesh(bloom, lambert(0xffffff), n)
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const palette = [0xe85d75, 0xf6c445, 0xffffff, 0x9a6fd0, 0xf08a3c]
    for (let i = 0; i < n; i++) {
      // Two strips: either side of the patio.
      const left = i % 2 === 0
      const x = left ? p.x0 - 0.5 - r2() * 0.8 : p.x1 + 0.6 + r2() * 0.8
      const z = p.z0 - 2 + r2() * 4.6
      m.makeScale(1, 0.8, 1).setPosition(x, 0.2 + r2() * 0.25, z)
      flowers.setMatrixAt(i, m)
      flowers.setColorAt(i, c.setHex(palette[Math.floor(r2() * palette.length)]))
    }
    flowers.castShadow = true
    this.root.add(flowers)
  }

  private paths() {
    // Stepping stones from the patio to the bed, the pond and the orchard.
    const r = rng(5)
    const routes: [number, number][][] = [
      [
        [-9, -2.6],
        [-6, -1.6],
        [-4.4, -0.6],
      ],
      [
        [-9, -2.6],
        [-8.6, 0.5],
        [-7.6, 2.4],
      ],
      [
        [4.3, -0.4],
        [6.5, -2],
        [8, -4.6],
      ],
      [
        [0, 2.2],
        [1.8, 4],
        [3.4, 4.8],
      ],
    ]
    const stone = new THREE.CylinderGeometry(0.32, 0.34, 0.06, 9)
    for (const route of routes) {
      for (let i = 0; i < route.length - 1; i++) {
        const [x0, z0] = route[i]
        const [x1, z1] = route[i + 1]
        const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.75)
        for (let k = 0; k < n; k++) {
          const t = k / n
          const s = new THREE.Mesh(stone, paving(new THREE.Color().setHSL(0.08, 0.08, 0.58 + r() * 0.12)))
          s.position.set(x0 + (x1 - x0) * t + (r() - 0.5) * 0.15, 0.03, z0 + (z1 - z0) * t + (r() - 0.5) * 0.15)
          s.scale.set(0.9 + r() * 0.3, 1, 0.8 + r() * 0.3)
          s.rotation.y = r() * 3
          add(this.root, s, false)
        }
      }
    }
  }

  private shed() {
    const s = T.hardGround[2]
    const g = new THREE.Group()
    const W = s.x1 - s.x0 - 0.4
    const D = s.z1 - s.z0 - 0.6
    add(g, box(W, 2.2, D, lambert(0x6f8f74), 0, 1.1, 0))
    const roof = box(W + 0.4, 0.12, D + 0.5, lambert(0x5b4636), 0, 2.45, 0)
    roof.rotation.x = -0.18
    add(g, roof)
    add(g, box(0.9, 1.8, 0.06, lambert(0xe8e0cc), -0.5, 0.9, D / 2 + 0.03))
    add(g, box(0.6, 0.5, 0.06, this.windows, 0.9, 1.4, D / 2 + 0.03), false)
    // A watering can by the door: a nod to the job you're doing instead.
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.3, 12), lambert(0x6d8c9c))
    can.position.set(0.5, 0.15, D / 2 + 0.45)
    add(g, can)
    g.position.set((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2)
    this.root.add(g)
  }

  private oak() {
    const o = T.oak
    const r = rng(23)
    const g = new THREE.Group()
    const trunk = new THREE.CylinderGeometry(0.35, 0.55, o.crownHeight, 9)
    trunk.translate(0, o.crownHeight / 2, 0)
    add(g, new THREE.Mesh(trunk, lambert(0x5c4330)))
    const crowns = [foliage(1), foliage(2.2), foliage(4.1)]
    for (let i = 0; i < 9; i++) {
      const crown = crowns[i % 3]
      const a = (i / 9) * Math.PI * 2
      const d = i === 0 ? 0 : o.crownRadius * (0.45 + r() * 0.25)
      const mat = leaves(new THREE.Color().setHSL(0.26 + r() * 0.03, 0.42, 0.26 + r() * 0.06))
      this.oakLeaves.push(mat)
      const c = new THREE.Mesh(crown, mat)
      c.position.set(Math.cos(a) * d, o.crownHeight + (r() - 0.3) * 0.9, Math.sin(a) * d)
      c.scale.setScalar(o.crownRadius * (0.5 + r() * 0.2))
      add(g, c, true, false)
      this.crowns.push(c)
    }
    g.position.set(o.x, 0, o.z)
    this.root.add(g)
  }

  private pond() {
    const { x, z, radius } = T.pond
    this.water = shaded(new THREE.MeshStandardMaterial({ color: 0x4b87a8, roughness: 0.12, metalness: 0.1 }))
    const water = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), this.water)
    water.rotation.x = -Math.PI / 2
    water.position.set(x, 0.03, z)
    add(this.root, water, false)
    const r = rng(3)
    const stone = new THREE.DodecahedronGeometry(0.17, 0)
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2
      const st = new THREE.Mesh(stone, lambert(new THREE.Color().setHSL(0.1, 0.06, 0.5 + r() * 0.15)))
      st.position.set(x + Math.cos(a) * (radius + 0.1), 0.05, z + Math.sin(a) * (radius + 0.1))
      st.rotation.set(r() * 3, r() * 3, r() * 3)
      st.scale.set(1 + r() * 0.5, 0.6, 1 + r() * 0.4)
      add(this.root, st)
    }
    // Lily pads, a couple in flower.
    const pad = new THREE.CircleGeometry(0.22, 14, 0.3, Math.PI * 2 - 0.6)
    pad.rotateX(-Math.PI / 2)
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2
      const d = r() * radius * 0.7
      const p = new THREE.Mesh(pad, lambert(0x4d8a3c))
      p.position.set(x + Math.cos(a) * d, 0.045, z + Math.sin(a) * d)
      p.rotation.y = r() * 6
      p.scale.setScalar(0.8 + r() * 0.6)
      add(this.root, p, false)
      this.lilies.push(p)
      if (i % 3 === 0) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), lambert(0xf2b6c8))
        f.position.set(p.position.x, 0.09, p.position.z)
        add(this.root, f, false)
        this.lilies.push(f)
      }
    }
    // Reeds and bulrushes on the far bank.
    const reed = new THREE.CylinderGeometry(0.012, 0.016, 1.1, 4)
    reed.translate(0, 0.55, 0)
    const head = new THREE.CapsuleGeometry(0.035, 0.16, 2, 6)
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.85 + r() * Math.PI * 0.5
      const d = radius - 0.1 + r() * 0.3
      const rx = x + Math.cos(a) * d
      const rz = z + Math.sin(a) * d
      const m = new THREE.Mesh(reed, lambert(0x6f8f45))
      m.position.set(rx, 0, rz)
      m.rotation.set((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2)
      m.scale.y = 0.8 + r() * 0.5
      add(this.root, m, true, false)
      if (i % 2 === 0) {
        const h = new THREE.Mesh(head, lambert(0x6b4a2c))
        h.position.set(rx, 1.05 * m.scale.y, rz)
        add(this.root, h, true, false)
      }
    }
  }

  private ornaments() {
    // A bird bath on the lawn.
    const stone = lambert(0xcfc8ba)
    const bath = new THREE.Group()
    const stem = new THREE.CylinderGeometry(0.1, 0.16, 0.8, 10)
    stem.translate(0, 0.4, 0)
    add(bath, new THREE.Mesh(stem, stone))
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.14, 16), stone)
    bowl.position.y = 0.85
    add(bath, bowl)
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), lambert(0x6fa3c0))
    water.rotation.x = -Math.PI / 2
    water.position.y = 0.925
    add(bath, water, false)
    bath.position.set(4.2, 0, 5.2)
    this.root.add(bath)

    // A bench looking over the pond.
    const wood = lambert(0x8f6a45)
    const bench = new THREE.Group()
    add(bench, box(1.6, 0.06, 0.45, wood, 0, 0.45, 0))
    add(bench, box(1.6, 0.4, 0.06, wood, 0, 0.75, -0.2))
    for (const dx of [-0.7, 0.7]) add(bench, box(0.08, 0.45, 0.4, lambert(0x3d4440), dx, 0.22, 0))
    bench.position.set(-9.6, 0, 6.6)
    bench.rotation.y = 0.9
    this.root.add(bench)
  }
}
