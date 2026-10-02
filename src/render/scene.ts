/**
 * The garden on screen: the scenery, the raised bed and every plant, the cloud,
 * its rain, fog and shade, the sky from morning to night, and a camera that
 * pans around the yard. Reads the garden every frame and never writes to it.
 */
import * as THREE from 'three'
import { onBed, type Garden, type Plant } from '../sim/garden'
import { sunDirection } from '../sim/sky'
import { T } from '../tuning'
import { Effects } from './effects'
import { needIcons } from './icons'
import { PlantView } from './plants'
import { shadeUniforms } from './shade'
import { WindView } from './wind'
import { World, lambert } from './world'

const DRY = new THREE.Color(0xa4835e)
const WET = new THREE.Color(0x4a3524)
const SOAKED = new THREE.Color(0x3a3a40)
const MULCH_DRY = new THREE.Color(0x8a6a48)

const SKY_DAY = new THREE.Color(0xbcdcf0)
const SKY_DUSK = new THREE.Color(0xe9a87c)
const SKY_NIGHT = new THREE.Color(0x141c33)

export class GardenScene {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300)
  /** The point on the ground the camera looks at. Panning moves it. */
  readonly focus = new THREE.Vector2(T.camera.startX, T.camera.startZ)
  private scene = new THREE.Scene()
  private world = new World()
  private hemi = new THREE.HemisphereLight(0xe4f2ff, 0x5d7a3e, 1.5)
  private sun = new THREE.DirectionalLight(0xfff0d0, 2.4)
  private moon = new THREE.DirectionalLight(0x8fa8ff, 0)
  private sky = new THREE.Color()
  private plants: PlantView[] = []
  private soil: THREE.MeshLambertMaterial[] = []
  private icons: THREE.Sprite[] = []
  private iconTex = needIcons()
  private cloud = new THREE.Group()
  private cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6b0, transparent: true })
  private puffs: THREE.Mesh[] = []
  private cloudY: number = T.cloud.height
  private rain: THREE.LineSegments
  private drops: { x: number; y: number; z: number; live: boolean }[] = []
  private mist: THREE.Points
  private mistDots: { t: number; ox: number; oz: number }[] = []
  private bees: THREE.Group[] = []
  private wind: WindView
  private effects: Effects
  private ray = new THREE.Raycaster()
  private dist = 20

  constructor(private canvas: HTMLCanvasElement, garden: Garden) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const s = this.scene
    s.background = this.sky
    s.fog = new THREE.Fog(0xc9e2ef, 30, 75)
    s.add(this.hemi, this.sun, this.sun.target, this.moon, this.moon.target)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, far: 80 })
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.03
    s.add(this.world.root)

    this.buildBed()
    this.buildCloud()

    for (const p of garden.plants) {
      const view = new PlantView(p.kind)
      view.root.position.set(p.x, p.inBed ? T.bed.height : 0, p.z)
      s.add(view.root)
      this.plants.push(view)
      if (!p.inBed) {
        // A ring of mulch round each plant outside the bed: its colour shows the soil's moisture.
        const mat = lambert(MULCH_DRY)
        const r = (T.kinds[p.kind].reach ?? 0.5) * 0.85
        const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat)
        ring.rotation.x = -Math.PI / 2
        ring.position.set(p.x, 0.015, p.z)
        ring.receiveShadow = true
        s.add(ring)
        this.soil.push(mat)
      }
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      icon.scale.setScalar(0.55)
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

    this.wind = new WindView(s, garden.plants.length)
    this.effects = new Effects(s, garden)

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
      p.position.set(x, y, z).multiplyScalar(T.cloud.size.reference)
      p.scale.setScalar(s * T.cloud.size.reference)
      p.userData.base = p.position.clone()
      this.cloud.add(p)
      this.puffs.push(p)
    }
    this.scene.add(this.cloud)
  }

  /** Point on the ground under a pointer at client (CSS pixel) coordinates. */
  groundPointAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.ray.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    // Aim at the bed's top when over the bed, and at the lawn elsewhere.
    const lawn = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    if (!this.ray.ray.intersectPlane(lawn, hit)) return null
    if (onBed(hit.x, hit.z, 0.5)) {
      const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -T.bed.height)
      this.ray.ray.intersectPlane(top, hit)
    }
    return { x: hit.x, z: hit.z }
  }

  /** The plant nearest a ground point, if the point is on or very near it. */
  plantNear(garden: Garden, at: { x: number; z: number } | null): Plant | null {
    if (!at) return null
    let best: Plant | null = null
    let bestD = Infinity
    for (const p of garden.plants) {
      const d = Math.hypot(p.x - at.x, p.z - at.z)
      if (d < (T.kinds[p.kind].reach ?? 0.55) && d < bestD) {
        best = p
        bestD = d
      }
    }
    return best
  }

  /** Move the view across the garden, staying over the yard. */
  pan(dx: number, dz: number) {
    const y = T.yard
    this.focus.x = THREE.MathUtils.clamp(this.focus.x + dx, y.x0 + 6, y.x1 - 6)
    this.focus.y = THREE.MathUtils.clamp(this.focus.y + dz, y.z0 + 4, y.z1 - 3)
    this.placeCamera()
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h)
    const aspect = w / h
    this.camera.aspect = aspect
    const vfov = THREE.MathUtils.degToRad(this.camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    // Show about `viewWidth` metres across, but never so little depth that the view feels cramped.
    this.dist = Math.max(T.camera.viewWidth / 2 / Math.tan(hfov / 2), 7 / Math.tan(vfov / 2))
    this.camera.updateProjectionMatrix()
    this.placeCamera()
  }

  private placeCamera() {
    const look = new THREE.Vector3(this.focus.x, 0, this.focus.y)
    const dir = new THREE.Vector3(0, 0.82, 1).normalize()
    this.camera.position.copy(look).addScaledVector(dir, this.dist)
    this.camera.lookAt(look)
  }

  render(garden: Garden, dt: number) {
    const t = garden.time
    const c = garden.cloud
    const day = garden.daylight
    const night = 1 - day

    this.light(garden, day)
    shadeUniforms.uCloud.value.set(c.x, c.z)
    shadeUniforms.uRadius.value = garden.radius
    shadeUniforms.uSoft.value = garden.softEdge
    shadeUniforms.uDark.value = THREE.MathUtils.lerp(1, T.render.shadeDarkness, day)

    // Cloud: as wide as its shade, puffier the more it holds, grey when raining,
    // and down low and thin when it's lying as fog.
    const k = 1 - Math.exp(-dt * 3)
    this.cloudY += ((c.fogging ? 0.55 : T.cloud.height) - this.cloudY) * k
    this.cloud.position.set(c.x, this.cloudY + Math.sin(t * 0.8) * 0.06, c.z)
    const wide = garden.radius / T.cloud.size.reference
    const fill = c.water / c.capacity
    const tall = c.fogging ? 0.35 : wide * (0.55 + 0.25 * fill) + 0.2
    this.cloud.scale.set(wide, tall, wide)
    this.puffs.forEach((p, i) => {
      const base = p.userData.base as THREE.Vector3
      p.position.set(base.x, base.y + Math.sin(t * 1.1 + i) * 0.03, base.z)
    })
    const grey = c.raining ? 0.25 : 0
    const glow = 0.25 + 0.75 * day
    this.cloudMat.emissive.lerp(new THREE.Color(0x9aa6b0).multiplyScalar((1 - grey) * glow), k)
    this.cloudMat.color.lerp(new THREE.Color(1 - grey, 1 - grey, 1 - grey * 0.8), k)
    this.cloudMat.opacity += ((c.fogging ? 0.5 : 1) - this.cloudMat.opacity) * k

    this.updateRain(garden, dt)
    this.updateMist(garden, dt)
    this.world.setNight(night)
    this.world.fadeOak(c.x, c.z, dt)

    garden.plants.forEach((p, i) => {
      const view = this.plants[i]
      view.update(p, t, garden.breezeAt(p.x, p.z), c.windX, c.windZ, night)
      const m = p.moisture
      const soil = this.soil[i]
      soil.color.copy(p.inBed ? DRY : MULCH_DRY).lerp(WET, Math.min(1, m / 0.75))
      if (m > 0.75) soil.color.lerp(SOAKED, (m - 0.75) / 0.25)

      const icon = this.icons[i]
      const mat = icon.material
      if (p.need) mat.map = this.iconTex[p.need]
      const want = p.need ? Math.min(1, (T.showNeedBelow - p.comfort) / 0.25 + 0.4) : 0
      mat.opacity += (want - mat.opacity) * (1 - Math.exp(-dt * 5))
      mat.needsUpdate = true
      icon.visible = mat.opacity > 0.02
      icon.position.set(p.x, view.top + 0.42 + Math.sin(t * 2 + i) * 0.04, p.z)
    })

    this.wind.update(garden, dt)
    this.effects.update(garden, this.camera, dt)
    this.updateBees(garden)
    this.renderer.render(this.scene, this.camera)
  }

  /** Sky colour, sun and moon, and the lightning flash. */
  private light(garden: Garden, day: number) {
    const dusk = Math.max(0, 1 - Math.abs(day - 0.45) / 0.35) * (day < 0.98 ? 1 : 0)
    this.sky.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.45)
    const flash = this.effects?.flash ?? 0
    if (flash > 0) this.sky.lerp(new THREE.Color(0xf4f6ff), flash * 0.5)
    ;(this.scene.fog as THREE.Fog).color.copy(this.sky)

    this.hemi.intensity = 0.35 + 1.15 * day + flash * 2
    this.hemi.color.setHex(0xe4f2ff).lerp(new THREE.Color(0x6f80b8), 1 - day)
    const s = sunDirection(garden.time)
    const f = new THREE.Vector3(this.focus.x, 0, this.focus.y)
    this.sun.position.set(f.x + s.x * 30, s.y * 30, f.z + s.z * 30)
    this.sun.target.position.copy(f)
    this.sun.intensity = 2.4 * day
    this.sun.color.setHex(0xfff0d0).lerp(new THREE.Color(0xffb070), dusk * 0.6)
    this.moon.position.set(f.x - 10, 25, f.z + 12)
    this.moon.target.position.copy(f)
    this.moon.intensity = 0.55 * (1 - day)
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
        const floor = onBed(d.x, d.z) ? T.bed.height : 0
        if (d.y < floor) d.live = false
      }
      if (!d.live && spawn > 0) {
        spawn--
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * garden.radius
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
    const awake = garden.daylight > 0.4
    garden.plants.forEach((p, i) => {
      const bloomed = p.growth >= 1 && awake
      const top = this.plants[i].top
      const spread = (T.kinds[p.kind].reach ?? 0.5) * 0.9
      for (let j = 0; j < per; j++) {
        const bee = this.bees[i * per + j]
        bee.visible = bloomed
        if (!bloomed) continue
        const path = (s: number) =>
          new THREE.Vector3(
            p.x + Math.sin(s) * spread + Math.sin(s * 2.3) * 0.12,
            top - 0.2 + Math.sin(s * 3.1) * 0.15,
            p.z + Math.cos(s * 0.8) * spread,
          )
        const s = t * (1.3 + j * 0.4) + i * 1.7 + j * 3
        bee.position.copy(path(s))
        bee.lookAt(path(s + 0.05))
        bee.children[2].scale.y = 0.15 + Math.abs(Math.sin(t * 60 + j)) * 0.1
      }
    })
  }
}
