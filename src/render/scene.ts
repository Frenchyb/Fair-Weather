/**
 * The garden on screen: the countryside round it, the lawn and what the
 * weather leaves on it, the raised bed and every plant, the cloud high
 * overhead, the sky from morning to night, and a camera that pans, turns and
 * zooms. Reads the garden every frame and never writes to it.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { N8AOPass } from 'n8ao'
import { onBed, type Garden, type Plant } from '../sim/garden'
import { sunDirection } from '../sim/sky'
import { T } from '../tuning'
import { CloudView } from './cloud'
import { Effects } from './effects'
import { GroundView } from './ground'
import { Horizon } from './horizon'
import { needIcons } from './icons'
import { PlantView } from './plants'
import { fieldUniforms, shadeUniforms } from './shade'
import { WindView } from './wind'
import { World, lambert } from './world'

const DRY = new THREE.Color(0xa4835e)
const WET = new THREE.Color(0x4a3524)
const SOAKED = new THREE.Color(0x3a3a40)
const MULCH_DRY = new THREE.Color(0x8a6a48)

const ZENITH_DAY = new THREE.Color(0x3d7cc9)
const HORIZON_DAY = new THREE.Color(0xd3e4ee)
const ZENITH_NIGHT = new THREE.Color(0x070b18)
const HORIZON_NIGHT = new THREE.Color(0x1a2440)
const HORIZON_DUSK = new THREE.Color(0xf0a070)
const STORM = new THREE.Color(0x4a525c)

export class GardenScene {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2500)
  /** The point on the ground the camera looks at. Panning moves it. */
  readonly focus = new THREE.Vector2(T.camera.startX, T.camera.startZ)
  /** Which way the camera faces, radians: 0 looks north from the south side. */
  yaw = 0
  private zoom = 1
  private scene = new THREE.Scene()
  private composer: EffectComposer
  private ao: N8AOPass | null = null
  private plain: RenderPass
  private bloom: UnrealBloomPass
  private pixelRatio: number
  private slow = 0
  private world = new World()
  private horizon = new Horizon()
  private hemi = new THREE.HemisphereLight(0xdfeeff, 0x4d6a32, 0.9)
  private sun = new THREE.DirectionalLight(0xfff0d8, 3.2)
  private moon = new THREE.DirectionalLight(0x8fa8ff, 0)
  private fogColor = new THREE.Color()
  private plants: PlantView[] = []
  private soil: THREE.MeshStandardMaterial[] = []
  private icons: THREE.Sprite[] = []
  private iconTex = needIcons()
  private bees: THREE.Group[] = []
  private wind: WindView
  private effects: Effects
  private ground: GroundView
  private cloud: CloudView
  private ray = new THREE.Raycaster()
  private dist = 20
  private gust = 0

  constructor(private canvas: HTMLCanvasElement, garden: Garden) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const s = this.scene
    s.fog = new THREE.Fog(0xd3e4ee, 90, 700)
    s.add(this.hemi, this.sun, this.sun.target, this.moon, this.moon.target)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.04
    this.sun.shadow.radius = 3
    s.add(this.horizon.root, this.world.root)
    s.environment = this.skyLight()

    this.buildBed()
    this.ground = new GroundView(s, garden)
    this.cloud = new CloudView(s)

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
        ring.position.set(p.x, 0.02, p.z)
        ring.receiveShadow = true
        s.add(ring)
        this.soil.push(mat)
      }
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false }))
      icon.scale.setScalar(0.6)
      icon.renderOrder = 10
      s.add(icon)
      this.icons.push(icon)
    }

    this.wind = new WindView(s, garden.plants.length)
    this.effects = new Effects(s, garden)

    const beeBody = new THREE.SphereGeometry(0.045, 8, 6)
    const beeMat = new THREE.MeshStandardMaterial({ color: 0xe6b422 })
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x2a2018 })
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

    // Ambient occlusion and a touch of bloom, then tone mapping.
    this.composer = new EffectComposer(this.renderer)
    this.plain = new RenderPass(s, this.camera)
    try {
      this.ao = new N8AOPass(s, this.camera, 1, 1)
      Object.assign(this.ao.configuration, {
        aoRadius: 1.6,
        distanceFalloff: 0.6,
        intensity: 2.2,
        halfRes: true,
        gammaCorrection: false,
      })
      this.ao.setQualityMode('Medium')
      this.composer.addPass(this.ao)
    } catch {
      this.ao = null
      this.composer.addPass(this.plain)
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.5, 0.92)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  /** Soft light from the whole sky, for the shiny bits (puddles, the pond) to reflect. */
  private skyLight() {
    const env = new THREE.Scene()
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vP; void main() { float y = normalize(vP).y;
          vec3 c = mix(vec3(0.75, 0.85, 0.92), vec3(0.32, 0.55, 0.85), clamp(y, 0.0, 1.0));
          c = mix(c, vec3(0.25, 0.3, 0.18), smoothstep(0.0, -0.2, y));
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    )
    env.add(dome)
    const pm = new THREE.PMREMGenerator(this.renderer)
    const tex = pm.fromScene(env, 0).texture
    pm.dispose()
    return tex
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

  /** Move the view across the garden, `right` and `toward` the viewer as seen on screen. */
  pan(right: number, toward: number) {
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    const y = T.yard
    this.focus.x = THREE.MathUtils.clamp(this.focus.x + right * c + toward * s, y.x0 + 4, y.x1 - 4)
    this.focus.y = THREE.MathUtils.clamp(this.focus.y - right * s + toward * c, y.z0 + 3, y.z1 - 2)
    this.placeCamera()
  }

  turn(by: number) {
    this.yaw += by
    this.placeCamera()
  }

  zoomBy(factor: number) {
    const [lo, hi] = T.camera.zoom
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, lo, hi)
    this.placeCamera()
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h)
    this.composer.setPixelRatio(this.pixelRatio)
    this.composer.setSize(w, h)
    const aspect = w / h
    this.camera.aspect = aspect
    const vfov = THREE.MathUtils.degToRad(this.camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    // Show about `viewWidth` metres across, but never so little depth that the view feels cramped.
    this.dist = Math.max(T.camera.viewWidth / 2 / Math.tan(hfov / 2), 8 / Math.tan(vfov / 2))
    this.camera.updateProjectionMatrix()
    this.placeCamera()
  }

  private placeCamera() {
    const look = new THREE.Vector3(this.focus.x, 0, this.focus.y)
    // Zoomed in, the camera drops lower for a view across the garden; zoomed out, it looks down.
    const pitch = THREE.MathUtils.degToRad(T.camera.pitch + (this.zoom - 1) * 14)
    const d = this.dist * this.zoom
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch),
    )
    this.camera.position.copy(look).addScaledVector(dir, d)
    this.camera.lookAt(look)
  }

  render(garden: Garden, dt: number) {
    const t = garden.time
    const c = garden.cloud
    const day = garden.daylight
    const night = 1 - day

    this.gust += ((garden.storming ? 1 : c.breezing ? 0.35 : 0) - this.gust) * (1 - Math.exp(-dt * 1.5))
    this.light(garden, day, dt)
    shadeUniforms.uCloud.value.set(c.x, c.z)
    shadeUniforms.uRadius.value = garden.radius
    shadeUniforms.uSoft.value = garden.softEdge
    shadeUniforms.uDark.value = THREE.MathUtils.lerp(1, T.render.shadeDarkness, day)
    shadeUniforms.uStorm.value += ((garden.storming ? 1 : 0) - shadeUniforms.uStorm.value) * (1 - Math.exp(-dt))
    fieldUniforms.uTime.value = t
    fieldUniforms.uGust.value = this.gust
    fieldUniforms.uWind.value.set(c.windX, c.windZ)

    this.cloud.update(garden, dt)
    this.ground.update(garden, dt)
    this.horizon.update(t, dt)
    this.world.setNight(night)
    this.world.fadeOak(c.x, c.z, dt)

    garden.plants.forEach((p, i) => {
      const view = this.plants[i]
      const breeze = Math.max(garden.breezeAt(p.x, p.z), this.gust * 0.8)
      view.update(p, t, breeze, c.windX, c.windZ, night)
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
      icon.position.set(p.x, view.top + 0.45 + Math.sin(t * 2 + i) * 0.04, p.z)
    })

    this.wind.update(garden, dt)
    this.effects.update(garden, this.camera, dt)
    this.updateBees(garden)
    this.adapt(dt)
    this.composer.render(dt)
  }

  /**
   * Keep it smooth on slower machines: if frames run long for a few seconds,
   * render fewer pixels, and as a last resort drop the ambient occlusion.
   */
  private adapt(dt: number) {
    this.slow = dt > 1 / 38 ? this.slow + dt : Math.max(0, this.slow - dt * 0.5)
    if (this.slow < 3) return
    this.slow = 0
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25)
      this.renderer.setPixelRatio(this.pixelRatio)
      this.resize()
    } else if (this.ao) {
      this.composer.removePass(this.ao)
      this.composer.insertPass(this.plain, 0)
      this.ao = null
    }
  }

  /** Sky colour, sun and moon, storm gloom and the lightning flash. */
  private light(garden: Garden, day: number, dt: number) {
    const dusk = Math.max(0, 1 - Math.abs(day - 0.45) / 0.35) * (day < 0.98 ? 1 : 0)
    const gloom = shadeUniforms.uStorm.value * 0.75
    const flash = this.effects?.flash ?? 0
    const sky = this.horizon.sky.uniforms
    const zenith = (sky.uZenith.value as THREE.Color).copy(ZENITH_NIGHT).lerp(ZENITH_DAY, day).lerp(STORM, gloom * day)
    const horizon = (sky.uHorizon.value as THREE.Color)
      .copy(HORIZON_NIGHT)
      .lerp(HORIZON_DAY, day)
      .lerp(HORIZON_DUSK, dusk * 0.5)
      .lerp(STORM, gloom * day * 0.8)
    if (flash > 0) {
      zenith.lerp(new THREE.Color(0xe8ecff), flash * 0.6)
      horizon.lerp(new THREE.Color(0xf4f6ff), flash * 0.6)
    }
    ;(sky.uGround.value as THREE.Color).copy(horizon).multiplyScalar(0.7)
    this.fogColor.copy(horizon)
    ;(this.scene.fog as THREE.Fog).color.copy(this.fogColor)

    const s = sunDirection(garden.time)
    const sunDir = new THREE.Vector3(s.x, s.y, s.z).normalize()
    ;(sky.uSunDir.value as THREE.Vector3).copy(sunDir)
    sky.uSun.value = day * (1 - gloom)
    ;(sky.uSunColor.value as THREE.Color).setHex(0xfff2d8).lerp(new THREE.Color(0xffa060), dusk * 0.7)

    this.scene.environmentIntensity = (0.12 + 0.55 * day) * (1 - gloom * 0.5) + flash
    this.hemi.intensity = (0.25 + 0.75 * day) * (1 - gloom * 0.4) + flash * 2
    this.hemi.color.setHex(0xdfeeff).lerp(new THREE.Color(0x6f80b8), 1 - day)

    // The shadow box follows the view and grows when zoomed out.
    const f = new THREE.Vector3(this.focus.x, 0, this.focus.y)
    const box = 16 + 12 * this.zoom
    const cam = this.sun.shadow.camera
    if (cam.right !== box) {
      Object.assign(cam, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 140 })
      cam.updateProjectionMatrix()
    }
    this.sun.position.copy(f).addScaledVector(sunDir, 60)
    this.sun.target.position.copy(f)
    this.sun.intensity = 3.2 * day * (1 - gloom * 0.7)
    this.sun.color.setHex(0xfff0d8).lerp(new THREE.Color(0xffa868), dusk * 0.6)
    this.moon.position.set(f.x - 10, 25, f.z + 12)
    this.moon.target.position.copy(f)
    this.moon.intensity = 0.6 * (1 - day)
    void dt
  }

  private updateBees(garden: Garden) {
    const t = garden.time
    const per = T.render.beesPerPlant
    const awake = garden.daylight > 0.4 && !garden.storming
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
