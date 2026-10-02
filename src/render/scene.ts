/**
 * The yard: grass, a raised bed, a pond, a fence and a few trees, the cloud,
 * its rain and its shade. Reads the garden every frame and never writes to it.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { T } from '../tuning'
import { needIcons } from './icons'
import { PlantView } from './plants'
import { shaded, shadeUniforms } from './shade'

const DRY = new THREE.Color(0xa4835e)
const WET = new THREE.Color(0x4a3524)
const SOAKED = new THREE.Color(0x3a3a40)

/** Deterministic scatter, so the yard looks the same every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

function lambert(color: number) {
  return shaded(new THREE.MeshLambertMaterial({ color }))
}

export class GardenScene {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)
  private scene = new THREE.Scene()
  private bedTop = T.bed.height
  private plants: PlantView[] = []
  private soil: THREE.MeshLambertMaterial[] = []
  private icons: THREE.Sprite[] = []
  private iconTex = needIcons()
  private cloud = new THREE.Group()
  private cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6b0 })
  private puffs: THREE.Mesh[] = []
  private rain: THREE.LineSegments
  private drops: { x: number; y: number; z: number; live: boolean }[] = []
  private mist: THREE.Points
  private mistDots: { t: number; ox: number; oz: number }[] = []
  private bees: THREE.Group[] = []
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -T.bed.height)

  constructor(private canvas: HTMLCanvasElement, garden: Garden) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const s = this.scene
    s.background = new THREE.Color(0xbcdcf0)
    s.fog = new THREE.Fog(0xc9e2ef, 22, 55)
    s.add(new THREE.HemisphereLight(0xe4f2ff, 0x5d7a3e, 1.5))
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4)
    sun.position.set(5, 12, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9 })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
    s.add(sun)

    this.buildYard()
    this.buildBed()
    this.buildPond()
    this.buildCloud()

    for (const p of garden.plants) {
      const view = new PlantView(p.kind)
      view.root.position.set(p.x, this.bedTop, p.z)
      s.add(view.root)
      this.plants.push(view)
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      icon.scale.setScalar(0.45)
      icon.renderOrder = 10
      s.add(icon)
      this.icons.push(icon)
    }

    // Rain: short streaks recycled from a fixed pool.
    const n = T.render.rainDrops
    this.rain = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0x7fa6c8, transparent: true, opacity: 0.55 }),
    )
    this.rain.frustumCulled = false
    for (let i = 0; i < n; i++) this.drops.push({ x: 0, y: -10, z: 0, live: false })
    s.add(this.rain)

    // Mist lifting off the pond while the cloud drinks.
    const m = 120
    this.mist = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3)),
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }),
    )
    this.mist.frustumCulled = false
    for (let i = 0; i < m; i++) this.mistDots.push({ t: i / m, ox: 0, oz: 0 })
    s.add(this.mist)

    const beeBody = new THREE.SphereGeometry(0.045, 8, 6)
    const beeMat = new THREE.MeshLambertMaterial({ color: 0xe6b422 })
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x2a2018 })
    for (let i = 0; i < garden.plants.length * T.render.beesPerPlant; i++) {
      const bee = new THREE.Group()
      const body = new THREE.Mesh(beeBody, beeMat)
      body.scale.set(1, 1, 1.3)
      const stripe = new THREE.Mesh(beeBody, stripeMat)
      stripe.scale.set(1.05, 1.05, 0.35)
      const wing = new THREE.Mesh(beeBody, wingMat)
      wing.scale.set(1.6, 0.15, 0.6)
      wing.position.y = 0.04
      bee.add(body, stripe, wing)
      bee.visible = false
      s.add(bee)
      this.bees.push(bee)
    }
  }

  private buildYard() {
    const r = rng(7)
    const ground = new THREE.PlaneGeometry(90, 90, 90, 90)
    ground.rotateX(-Math.PI / 2)
    const colors: number[] = []
    const c = new THREE.Color()
    for (let i = 0; i < ground.attributes.position.count; i++) {
      c.setHSL(0.24 + r() * 0.03, 0.42, 0.36 + r() * 0.06)
      colors.push(c.r, c.g, c.b)
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const grass = new THREE.Mesh(ground, shaded(new THREE.MeshLambertMaterial({ vertexColors: true })))
    grass.receiveShadow = true
    this.scene.add(grass)

    // Tufts, kept off the bed and the pond.
    const tuft = new THREE.ConeGeometry(0.035, 0.2, 3)
    tuft.translate(0, 0.1, 0)
    const count = 7000
    const tufts = new THREE.InstancedMesh(tuft, lambert(0xffffff), count)
    const m = new THREE.Matrix4()
    let placed = 0
    while (placed < count) {
      const x = (r() - 0.5) * 34
      const z = (r() - 0.5) * 22 - 2
      const inBed = Math.abs(x) < T.bed.width / 2 + 0.2 && Math.abs(z) < T.bed.depth / 2 + 0.2
      const inPond = Math.hypot(x - T.pond.x, z - T.pond.z) < T.pond.radius + 0.35
      if (inBed || inPond) continue
      const s = 0.6 + r() * 0.7
      m.makeRotationY(r() * 6).scale(new THREE.Vector3(s, s * (0.7 + r() * 0.8), s)).setPosition(x, 0, z)
      tufts.setMatrixAt(placed, m)
      tufts.setColorAt(placed, c.setHSL(0.22 + r() * 0.06, 0.45, 0.3 + r() * 0.12))
      placed++
    }
    tufts.castShadow = true
    this.scene.add(tufts)

    // A fence along the back and a few round trees beyond it.
    const wood = lambert(0xb08a5e)
    const post = new THREE.BoxGeometry(0.12, 1.3, 0.12)
    const rail = new THREE.BoxGeometry(22, 0.1, 0.06)
    for (let x = -11; x <= 11; x += 1.6) {
      const p = new THREE.Mesh(post, wood)
      p.position.set(x, 0.65, -6.2)
      p.castShadow = true
      this.scene.add(p)
    }
    for (const y of [0.45, 1.05]) {
      const rl = new THREE.Mesh(rail, wood)
      rl.position.set(0, y, -6.15)
      rl.castShadow = true
      this.scene.add(rl)
    }
    // A hedge of round shrubs behind the fence: trees would only show their trunks.
    const crown = new THREE.IcosahedronGeometry(1, 1)
    for (let x = -14; x <= 14; x += 1.3 + r() * 0.6) {
      const shrub = new THREE.Mesh(crown, lambert(new THREE.Color().setHSL(0.25 + r() * 0.05, 0.4, 0.27 + r() * 0.08).getHex()))
      const s = 0.7 + r() * 0.45
      shrub.scale.set(s * 1.2, s, s)
      shrub.position.set(x, s * 0.6, -7 - r() * 0.6)
      shrub.castShadow = true
      this.scene.add(shrub)
    }
  }

  private buildBed() {
    const { width, depth, height } = T.bed
    const wall = 0.2
    const wood = lambert(0x9c7048)
    const sides: [number, number, number, number][] = [
      [width, wall, 0, -(depth - wall) / 2],
      [width, wall, 0, (depth - wall) / 2],
      [wall, depth, -(width - wall) / 2, 0],
      [wall, depth, (width - wall) / 2, 0],
    ]
    for (const [w, d, x, z] of sides) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, height + 0.06, d), wood)
      b.position.set(x, (height + 0.06) / 2, z)
      b.castShadow = b.receiveShadow = true
      this.scene.add(b)
    }
    // One tile of soil under each plant, so its colour can show that plant's moisture.
    const cols = T.layout[0].length
    const rows = T.layout.length
    const tw = (width - 2 * wall) / cols
    const td = (depth - 2 * wall) / rows
    const tile = new THREE.BoxGeometry(tw, height, td)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mat = lambert(DRY.getHex())
        const t = new THREE.Mesh(tile, mat)
        t.position.set((c - (cols - 1) / 2) * tw, height / 2, (r - (rows - 1) / 2) * td)
        t.receiveShadow = true
        this.scene.add(t)
        this.soil.push(mat)
      }
    }
  }

  private buildPond() {
    const { x, z, radius } = T.pond
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      shaded(new THREE.MeshStandardMaterial({ color: 0x4b87a8, roughness: 0.12, metalness: 0.1 })),
    )
    water.rotation.x = -Math.PI / 2
    water.position.set(x, 0.03, z)
    water.receiveShadow = true
    this.scene.add(water)
    const stone = new THREE.DodecahedronGeometry(0.17, 0)
    const r = rng(3)
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2
      const st = new THREE.Mesh(stone, lambert(new THREE.Color().setHSL(0.1, 0.06, 0.5 + r() * 0.15).getHex()))
      st.position.set(x + Math.cos(a) * (radius + 0.1), 0.05, z + Math.sin(a) * (radius + 0.1))
      st.rotation.set(r() * 3, r() * 3, r() * 3)
      st.scale.set(1 + r() * 0.5, 0.6, 1 + r() * 0.4)
      st.castShadow = true
      this.scene.add(st)
    }
  }

  private buildCloud() {
    const geo = new THREE.IcosahedronGeometry(1, 2)
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 0.62],
      [0.55, -0.08, 0.1, 0.48],
      [-0.55, -0.1, -0.05, 0.5],
      [0.2, 0.25, -0.2, 0.45],
      [-0.25, 0.2, 0.25, 0.42],
      [0.85, -0.2, -0.25, 0.32],
      [-0.85, -0.22, 0.25, 0.34],
      [0.05, -0.18, 0.45, 0.38],
      [0.1, -0.15, -0.5, 0.4],
    ]
    for (const [x, y, z, s] of puffs) {
      const p = new THREE.Mesh(geo, this.cloudMat)
      p.position.set(x, y, z).multiplyScalar(T.cloud.radius)
      p.scale.setScalar(s * T.cloud.radius)
      p.userData.base = p.position.clone()
      this.cloud.add(p)
      this.puffs.push(p)
    }
    this.scene.add(this.cloud)
  }

  /** Point on the bed's surface under a pointer at client (CSS pixel) coordinates. */
  groundPointAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.ray.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    return this.ray.ray.intersectPlane(this.plane, hit) ? { x: hit.x, z: hit.z } : null
  }

  /** The plant nearest a ground point, if the point is on or very near it. */
  plantNear(garden: Garden, at: { x: number; z: number } | null) {
    if (!at) return null
    let best = null
    let bestD = 0.55
    for (const p of garden.plants) {
      const d = Math.hypot(p.x - at.x, p.z - at.z)
      if (d < bestD) {
        best = p
        bestD = d
      }
    }
    return best
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h)
    const aspect = w / h
    this.camera.aspect = aspect
    // Frame the pond and the whole bed whatever the window's shape.
    const vfov = THREE.MathUtils.degToRad(this.camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const dist = Math.max(7.4 / Math.tan(hfov / 2), 5 / Math.tan(vfov / 2))
    const look = new THREE.Vector3(-1, 0, -0.3)
    const dir = new THREE.Vector3(0, 0.82, 1).normalize()
    this.camera.position.copy(look).addScaledVector(dir, dist)
    this.camera.lookAt(look)
    this.camera.updateProjectionMatrix()
  }

  render(garden: Garden, dt: number) {
    const t = garden.time
    const c = garden.cloud
    shadeUniforms.uCloud.value.set(c.x, c.z)

    // Cloud: puffs breathe, the whole thing swells with water and greys when raining.
    this.cloud.position.set(c.x, T.cloud.height + Math.sin(t * 0.8) * 0.06, c.z)
    const full = 0.72 + 0.28 * c.water
    this.cloud.scale.set(full, 0.8 + 0.2 * c.water, full)
    this.puffs.forEach((p, i) => {
      const base = p.userData.base as THREE.Vector3
      p.position.set(base.x, base.y + Math.sin(t * 1.1 + i) * 0.03, base.z)
    })
    const grey = c.raining ? 0.25 : 0
    const k = 1 - Math.exp(-dt * 4)
    this.cloudMat.emissive.lerp(new THREE.Color(0x9aa6b0).multiplyScalar(1 - grey), k)
    this.cloudMat.color.lerp(new THREE.Color(1 - grey, 1 - grey, 1 - grey * 0.8), k)

    this.updateRain(garden, dt)
    this.updateMist(garden, dt)

    garden.plants.forEach((p, i) => {
      const view = this.plants[i]
      view.update(p, t)
      const m = p.moisture
      const soil = this.soil[i]
      soil.color.copy(DRY).lerp(WET, Math.min(1, m / 0.75))
      if (m > 0.75) soil.color.lerp(SOAKED, (m - 0.75) / 0.25)

      const icon = this.icons[i]
      const mat = icon.material
      if (p.need) mat.map = this.iconTex[p.need]
      const want = p.need ? Math.min(1, (T.showNeedBelow - p.comfort) / 0.25 + 0.4) : 0
      mat.opacity += (want - mat.opacity) * (1 - Math.exp(-dt * 5))
      mat.needsUpdate = true
      icon.visible = mat.opacity > 0.02
      icon.position.set(p.x, view.top + 0.38 + Math.sin(t * 2 + i) * 0.04, p.z)
    })

    this.updateBees(garden)
    this.renderer.render(this.scene, this.camera)
  }

  private updateRain(garden: Garden, dt: number) {
    const c = garden.cloud
    const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const fall = T.render.rainSpeed * dt
    let spawn = c.raining ? Math.ceil(T.render.rainDrops * dt * 1.6) : 0
    const len = 0.28
    this.drops.forEach((d, i) => {
      if (d.live) {
        d.y -= fall
        const floor = this.onBed(d.x, d.z) ? this.bedTop : 0
        if (d.y < floor) d.live = false
      }
      if (!d.live && spawn > 0) {
        spawn--
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * T.cloud.radius
        d.x = c.x + Math.cos(a) * r
        d.z = c.z + Math.sin(a) * r
        d.y = T.cloud.height - 0.3 - Math.random() * 0.4
        d.live = true
      }
      const y = d.live ? d.y : -10
      arr.set([d.x, y, d.z, d.x, y + len, d.z], i * 6)
    })
    pos.needsUpdate = true
  }

  private updateMist(garden: Garden, dt: number) {
    const c = garden.cloud
    const on = c.refilling
    const mat = this.mist.material as THREE.PointsMaterial
    mat.opacity += ((on ? 0.65 : 0) - mat.opacity) * (1 - Math.exp(-dt * 3))
    this.mist.visible = mat.opacity > 0.01
    if (!this.mist.visible) return
    const pos = this.mist.geometry.attributes.position as THREE.BufferAttribute
    this.mistDots.forEach((m, i) => {
      m.t += dt * 0.45
      if (m.t > 1) {
        m.t -= 1
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * T.pond.radius * 0.9
        m.ox = Math.cos(a) * r
        m.oz = Math.sin(a) * r
      }
      const s = m.t
      const x = T.pond.x + m.ox
      const z = T.pond.z + m.oz
      pos.setXYZ(i, x + (c.x - x) * s * s, 0.05 + s * (T.cloud.height - 0.4), z + (c.z - z) * s * s)
    })
    pos.needsUpdate = true
  }

  private updateBees(garden: Garden) {
    const t = garden.time
    const per = T.render.beesPerPlant
    garden.plants.forEach((p, i) => {
      const bloomed = p.growth >= 1
      const top = this.plants[i].top
      for (let j = 0; j < per; j++) {
        const bee = this.bees[i * per + j]
        bee.visible = bloomed
        if (!bloomed) continue
        const path = (s: number) =>
          new THREE.Vector3(
            p.x + Math.sin(s) * 0.45 + Math.sin(s * 2.3) * 0.12,
            top + 0.1 + Math.sin(s * 3.1) * 0.12,
            p.z + Math.cos(s * 0.8) * 0.4,
          )
        const s = t * (1.3 + j * 0.4) + i * 1.7 + j * 3
        bee.position.copy(path(s))
        bee.lookAt(path(s + 0.05))
        bee.children[2].scale.y = 0.15 + Math.abs(Math.sin(t * 60 + j)) * 0.1
      }
    })
  }

  private onBed(x: number, z: number) {
    return Math.abs(x) < T.bed.width / 2 && Math.abs(z) < T.bed.depth / 2
  }
}
