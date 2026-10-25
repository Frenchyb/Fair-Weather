/**
 * The garden's fixed scenery: fence and hedge, the house and patio,
 * paths, shed, oak, pond, bird bath and bench. Built once; the only thing
 * that changes afterwards is the house windows glowing after dark.
 */
import * as THREE from 'three'
import { T } from '../tuning'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import lanternGlb from '../assets/lantern.glb'
import { weld } from './batch'
import { canopy, trunk, type Lump } from './leaves'
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

const stoneGrain = rng(13)

/**
 * Lay texture coordinates on in metres, each face projected along its main
 * axis, so a photographed surface keeps its real scale on boxes of any size.
 */
export function metricUV<G extends THREE.BufferGeometry>(g: G): G {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** A photographed surface, tinted. Use on geometry with `metricUV`, or set its own repeat. */
export function surface(kind: 'wood' | 'roof' | 'plaster' | 'bark', tint: number | THREE.Color, roughness = 0.88) {
  const m = lambert(tint)
  m.map = surfaces[kind].map
  m.normalMap = surfaces[kind].normal
  m.roughness = roughness
  return m
}

/** A loose stone: photographed grain from the paving, a part of one tile at a time. */
function fieldStone(color: THREE.Color, wet = true) {
  const m = wet ? paving(color) : lambert(color)
  const pick = (t: THREE.Texture) => {
    const c = t.clone()
    c.repeat.set(0.3, 0.3)
    c.offset.set(stoneGrain(), stoneGrain())
    return c
  }
  m.map = pick(surfaces.stone.map)
  m.normalMap = pick(surfaces.stone.normal)
  m.roughness = 0.95
  return m
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
  // Weld the faces so the crown shades smoothly instead of as facets.
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const smooth = mergeVertices(g)
  smooth.computeVertexNormals()
  return smooth
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

/** A box with softly rounded edges: a raw box's knife edges read as a toy at play distance. */
export function rounded(w: number, h: number, d: number) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, Math.min(w, h, d) * 0.25))
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(metricUV(rounded(w, h, d)), mat)
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
  g.computeVertexNormals()
  return metricUV(g)
}

export class World {
  readonly root = new THREE.Group()
  private windows: THREE.MeshStandardMaterial
  private lamps = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc46a, emissiveIntensity: 0 })
  private oakLeaves: THREE.MeshStandardMaterial[] = []
  /** Deciduous crowns: bare in winter, so they stop casting full shadows. */
  private crowns: THREE.Mesh[] = []
  /** Places the meadow grass leaves bare: each stepping stone, as (x, z, radius). */
  readonly clearings: [number, number, number][] = []
  private water!: THREE.MeshStandardMaterial
  private lilies: THREE.Mesh[] = []
  private r = rng(7)

  constructor() {
    // Glass: dark and glossy, so it shows the sky rather than reading as pale blue paint.
    this.windows = new THREE.MeshStandardMaterial({ color: 0x55707e, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.08, metalness: 0.4 })
    this.boundary()
    this.house()
    this.paths()
    this.shed()
    this.oak()
    this.pond()
    this.ornaments()
    // Everything that never changes on its own welds into a few meshes; the lanterns load later.
    const live = new Set<THREE.Material>([this.windows, this.lamps, this.water, ...this.oakLeaves])
    weld(this.root, (m) => live.has(m.material as THREE.Material) || this.crowns.includes(m) || this.lilies.includes(m))
    this.lanterns()
  }

  /** Two garden lanterns by the patio (Kenney, CC0), lit after dark. */
  private lanterns() {
    const p = T.hardGround[1]
    const spots: [number, number][] = [
      [p.x1 + 0.35, p.z1 + 0.35],
      [p.x0 - 0.35, p.z1 + 0.35],
    ]
    // Models are meshopt-compressed by `npm run shrink`.
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(lanternGlb, (gltf) => {
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
   * turns see-through while the cloud is working near it, and while the
   * camera is up among its leaves.
   */
  fadeOak(cloudX: number, cloudZ: number, camera: THREE.Vector3, dt: number) {
    const o = T.oak
    const inside = Math.hypot(camera.x - o.x, camera.y - o.crownHeight, camera.z - o.z) < o.crownRadius * 1.8
    const near = inside || Math.hypot(cloudX - o.x, cloudZ - o.z) < o.crownRadius + 3
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
    const wood = surface('wood', 0xd9c7ad)
    const post = metricUV(rounded(0.12, 1.3, 0.12))
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
        const rail = new THREE.Mesh(metricUV(rounded(len, 0.1, 0.06)), wood)
        rail.position.set((x0 + x1) / 2, h, (z0 + z1) / 2)
        rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
        add(this.root, rail, true, false)
      }
    }
    run(y.x0 - 0.5, back, y.x1 + 0.5, back)
    run(y.x0 - 0.5, back, y.x0 - 0.5, y.z1 + 2)
    run(y.x1 + 0.5, back, y.x1 + 0.5, y.z1 + 2)

    // A hedge of round shrubs outside the fence, and trees beyond it.
    const crown = canopy([[0, 0, 0, 1]], { length: 1, width: 0.5, widest: 0.45, fold: 0.3, curl: 0.2 }, 0.22, T.render.canopy.sprays, 0.86, 3, [3, 1])
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
    const bark = surface('bark', 0xb8a898, 0.95)
    const C = T.render.canopy
    // Three tree shapes, used round the boundary at different sizes and turns.
    const shapes: Lump[][] = [
      [[0, 4.2, 0, 1.9], [1.2, 3.6, 0.3, 1.3], [-1.1, 3.7, -0.2, 1.4], [0.2, 5.2, -0.3, 1.2]],
      [[0, 4.6, 0, 1.6], [0.9, 3.9, -0.6, 1.2], [-0.8, 4.0, 0.7, 1.2]],
      [[0, 3.9, 0, 2.1], [1.4, 3.4, 0.6, 1.2], [-1.3, 3.3, 0.5, 1.1], [0.3, 4.5, -1.1, 1.3]],
    ]
    const leaf = { length: 1, width: 0.55, widest: 0.45, fold: 0.3, curl: 0.2 }
    const crowns = shapes.map((l, i) => canopy(l, leaf, 0.34, C.sprays * 0.6, C.core, 40 + i, [3, 1]))
    const trunks = shapes.map((l, i) => trunk(l, 2.6, 0.24, 40 + i))
    let k = 0
    for (let x = y.x0 - 6; x <= y.x1 + 6; x += 4 + r() * 3, k++) {
      const t = new THREE.Group()
      add(t, new THREE.Mesh(trunks[k % 3], bark), true, false)
      const c = new THREE.Mesh(crowns[k % 3], leaves(new THREE.Color().setHSL(0.27 + r() * 0.04, 0.35, 0.3 + r() * 0.06)))
      add(t, c, true, false)
      this.crowns.push(c)
      t.position.set(x, 0, back - 5 - r() * 3)
      t.rotation.y = r() * Math.PI * 2
      t.scale.setScalar(0.9 + r() * 0.5)
      this.root.add(t)
    }
  }

  private house() {
    const h = new THREE.Group()
    const wall = surface('plaster', 0xffffff, 0.92)
    const trim = lambert(0xf4f1ea)
    const roof = surface('roof', 0xd0a090, 0.8)
    const W = 9
    const D = 5.6
    const H = 3
    add(h, box(W, H, D, wall, 0, H / 2, 0))
    // A stone plinth along the foot of the walls.
    add(h, box(W + 0.06, 0.4, D + 0.06, fieldStone(new THREE.Color(0x9a9286), false), 0, 0.2, 0))
    const r = new THREE.Mesh(gable(W + 0.6, D + 0.8, 2.2), roof)
    r.position.y = H
    add(h, r)
    add(h, box(0.7, 1.6, 0.7, lambert(0x9a5b47), 2.4, H + 1.6, -0.8))
    // Front: a door, four windows, a step and a little porch roof.
    const front = D / 2 + 0.03
    add(h, box(1.1, 2.1, 0.08, surface('wood', 0x7f9c86), 0.8, 1.05, front))
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
      add(h, box(1.2, 0.22, 0.25, surface('wood', 0xc09070), x, 1.05, front + 0.14))
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
      add(this.root, box(0.45, 0.06, 0.45, surface('wood', 0xd8b890), cx + dx, 0.45, cz))
      add(this.root, box(0.45, 0.5, 0.06, surface('wood', 0xd8b890), cx + dx * 1.25, 0.7, cz))
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
    const ball = canopy([[0, 0, 0, 1]], { length: 1, width: 0.4, widest: 0.5, fold: 0.2, curl: 0.1 }, 0.16, T.render.canopy.sprays * 1.6, 0.88, 5, [3, 1]).scale(0.45, 0.45, 0.45)
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
          const s = new THREE.Mesh(stone, fieldStone(new THREE.Color().setHSL(0.08, 0.07, 0.42 + r() * 0.1)))
          s.position.set(x0 + (x1 - x0) * t + (r() - 0.5) * 0.15, 0.03, z0 + (z1 - z0) * t + (r() - 0.5) * 0.15)
          s.scale.set(0.9 + r() * 0.3, 1, 0.8 + r() * 0.3)
          s.rotation.y = r() * 3
          add(this.root, s, false)
          this.clearings.push([s.position.x, s.position.z, 0.36 * Math.max(s.scale.x, s.scale.z)])
        }
      }
    }
  }

  private shed() {
    const s = T.hardGround[2]
    const g = new THREE.Group()
    const W = s.x1 - s.x0 - 0.4
    const D = s.z1 - s.z0 - 0.6
    add(g, box(W, 2.2, D, surface('wood', 0x8fb898), 0, 1.1, 0))
    const roof = box(W + 0.4, 0.12, D + 0.5, surface('wood', 0x6a5a50), 0, 2.45, 0)
    roof.rotation.x = -0.18
    add(g, roof)
    add(g, box(0.9, 1.8, 0.06, surface('wood', 0xf0e8d8), -0.5, 0.9, D / 2 + 0.03))
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
    const lumps: Lump[] = []
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const d = i === 0 ? 0 : o.crownRadius * (0.45 + r() * 0.25)
      lumps.push([Math.cos(a) * d, o.crownHeight + (r() - 0.3) * 0.9, Math.sin(a) * d, o.crownRadius * (0.5 + r() * 0.2)])
    }
    const oakBark = surface('bark', 0xb0a090, 0.95)
    add(g, new THREE.Mesh(trunk(lumps, o.crownHeight * 0.55, 0.42, 23), oakBark))
    const oakLeaf = { length: 1, width: 0.7, widest: 0.5, fold: 0.25, curl: 0.2, ruffle: 0.08 }
    const mat = leaves(new THREE.Color().setHSL(0.27, 0.42, 0.3))
    // Front faces only: the camera can sit up inside the oak's crown, and from in there it should vanish.
    this.oakLeaves.push(mat)
    const c = new THREE.Mesh(canopy(lumps, oakLeaf, 0.28, T.render.canopy.sprays * 1.4, T.render.canopy.core, 23, [3, 1]), mat)
    add(g, c, true, false)
    this.crowns.push(c)
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
      const st = new THREE.Mesh(stone, fieldStone(new THREE.Color().setHSL(0.1, 0.06, 0.36 + r() * 0.12), false))
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
    const wood = surface('wood', 0xd0b08a)
    const bench = new THREE.Group()
    add(bench, box(1.6, 0.06, 0.45, wood, 0, 0.45, 0))
    add(bench, box(1.6, 0.4, 0.06, wood, 0, 0.75, -0.2))
    for (const dx of [-0.7, 0.7]) add(bench, box(0.08, 0.45, 0.4, lambert(0x3d4440), dx, 0.22, 0))
    bench.position.set(-9.6, 0, 6.6)
    bench.rotation.y = 0.9
    this.root.add(bench)
  }
}
