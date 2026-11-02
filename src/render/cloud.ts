/**
 * The player's cloud, high over the garden: a heap of lumpy puffs, grey
 * underneath and bright on top, much wider than the shower it drops. Rain
 * falls from its base in streaks and splashes where it lands, a faint veil
 * shows where the shower is, mist lifts off the pond while it drinks, and in
 * a storm it swells and darkens over half the yard. Reads the garden only.
 */
import * as THREE from 'three'
import { weld } from './batch'
import { onBed, type Garden } from '../sim/garden'
import { T } from '../tuning'
import { rng } from './world'
import { HEIGHT } from './plants'

/** A soft round dot, so a splash reads as a burst of spray rather than a square pixel. */
function sprayDot() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const cloudUniforms = {
  uBase: { value: T.cloud.height },
  uDepth: { value: 2 },
  uGrey: { value: 0 },
}

export function lumpy(detail: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 5 + seed) * Math.sin(v.y * 4.3 + seed * 2) * Math.sin(v.z * 4.7 + seed * 3)
    v.multiplyScalar(1 + n * 0.09)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

export class CloudView {
  private group = new THREE.Group()
  private mat: THREE.MeshStandardMaterial
  private size = 1
  private y: number = T.cloud.height
  private storm = 0
  private rain: THREE.LineSegments
  private drops: { x: number; y: number; z: number; floor: number; live: boolean }[] = []
  private spawnDebt = 0
  private splash: THREE.Points
  private splashes: { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number }[] = []
  private nextSplash = 0
  private veil: THREE.Mesh
  private veilMat: THREE.ShaderMaterial
  private mist: THREE.Points
  private mistDots: { t: number; ox: number; oz: number }[] = []

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7d8a99, roughness: 1, transparent: true })
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, cloudUniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vCloudY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCloudY = (modelMatrix * vec4(transformed, 1.0)).y;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vCloudY;\nuniform float uBase, uDepth, uGrey;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Grey underneath, where the cloud is thick and the light can't get through.
          float up = smoothstep(uBase - 0.2, uBase + uDepth, vCloudY);
          diffuseColor.rgb *= mix(vec3(0.52, 0.56, 0.62), vec3(1.0), up) * (1.0 - uGrey * 0.55);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= mix(0.45, 1.0, up) * (1.0 - uGrey * 0.75);`,
        )
    }
    this.mat.customProgramCacheKey = () => 'fw-cloud'

    // A heap of puffs in a unit-radius footprint: big in the middle, a flat-ish base.
    const r = rng(17)
    const geos = [lumpy(3, 1), lumpy(3, 2.3), lumpy(3, 3.7)]
    const n = 26
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2
      const d = i === 0 ? 0 : Math.sqrt(r()) * 0.85
      const s = (0.62 - d * 0.32) * (0.75 + r() * 0.5)
      const p = new THREE.Mesh(geos[i % 3], this.mat)
      p.position.set(Math.cos(a) * d, s * 0.55 + r() * 0.12 + (1 - d) * 0.2, Math.sin(a) * d * 0.8)
      p.scale.set(s * 1.15, s * 0.9, s)
      p.rotation.set(r() * 3, r() * 3, r() * 3)
      p.castShadow = false
      this.group.add(p)
    }
    // One mesh for the whole heap; the heap breathes as one.
    weld(this.group)
    scene.add(this.group)

    // Rain: streaks recycled from a fixed pool.
    const m = T.render.rainDrops
    this.rain = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0x9fb8cc, transparent: true, opacity: T.render.rainOpacity }),
    )
    this.rain.frustumCulled = false
    for (let i = 0; i < m; i++) this.drops.push({ x: 0, y: -10, z: 0, floor: 0, live: false })
    scene.add(this.rain)

    const k = T.render.splash.pool
    this.splash = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(k * 3), 3)),
      new THREE.PointsMaterial({ color: 0xe4eef5, map: sprayDot(), size: T.render.splash.size, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    this.splash.frustumCulled = false
    for (let i = 0; i < k; i++) this.splashes.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, age: 1 })
    scene.add(this.splash)

    // A faint veil from the cloud's base to the ground: where the shower is falling.
    this.veilMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xb8c6d2) } },
      vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
        void main() { vH = position.y + 0.5; vec4 w = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }`,
      // Thickest through the middle of the shower and fading to nothing at its
      // sides, up into the cloud and down to the ground, so it has no hard edge anywhere.
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vH; varying vec3 vN; varying vec3 vV;
        void main() { float face = abs(dot(vN, vV));
          float a = uOpacity * pow(face, 2.5) * smoothstep(0.0, 0.25, vH) * (1.0 - smoothstep(0.6, 1.0, vH));
          gl_FragColor = vec4(uColor, a); }`,
    })
    this.veil = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), this.veilMat)
    this.veil.visible = false
    this.veil.renderOrder = 2
    scene.add(this.veil)

    const q = 160
    this.mist = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(q * 3), 3)),
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.7, depthWrite: false }),
    )
    this.mist.frustumCulled = false
    for (let i = 0; i < q; i++) this.mistDots.push({ t: i / q, ox: 0, oz: 0 })
    scene.add(this.mist)
  }

  /** Height of the cloud's base right now: low when it lies as fog. */
  get base() {
    return this.y
  }

  update(garden: Garden, dt: number) {
    const c = garden.cloud
    const t = garden.time
    const k = 1 - Math.exp(-dt * 2.5)
    this.storm += ((garden.storming ? 1 : 0) - this.storm) * (1 - Math.exp(-dt * 1.2))
    this.y += ((c.fogging ? 0.5 : T.cloud.height) - this.y) * k
    const want = c.fogging
      ? garden.radius * 1.15
      : THREE.MathUtils.lerp(garden.radius * T.cloud.look, T.storm.radius * 1.2, this.storm)
    this.size += (want - this.size) * k
    const fill = c.water / c.capacity
    const puffy = c.fogging ? 0.35 : (0.7 + 0.3 * fill) * (1 + this.storm * 0.4)
    this.group.position.set(c.x, this.y + Math.sin(t * 0.5) * 0.08, c.z)
    this.group.scale.set(this.size, this.size * puffy * 0.75, this.size)
    cloudUniforms.uBase.value = this.y
    cloudUniforms.uDepth.value = this.size * puffy * 0.75
    const grey = Math.max(c.raining ? 0.35 : 0, this.storm)
    cloudUniforms.uGrey.value += (grey - cloudUniforms.uGrey.value) * k
    const day = garden.daylight
    this.mat.emissive.setHex(0x7d8a99).multiplyScalar(0.06 + 0.94 * day)
    this.mat.opacity += ((c.fogging ? 0.45 : 0.97) - this.mat.opacity) * k

    this.updateRain(garden, dt)
    this.updateVeil(garden, dt)
    this.updateMist(garden, dt)
  }

  private updateRain(garden: Garden, dt: number) {
    const c = garden.cloud
    const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const fall = T.render.rainSpeed * dt
    const storming = this.storm > 0.3
    const radius = storming ? T.storm.radius : garden.radius
    // In winter the cloud snows instead; `Precip` draws the flakes.
    const R = T.render
    const rate = (c.raining && !garden.climate.dormant ? R.showerRain : 0) + (storming ? R.stormRain * this.storm : 0)
    // Plants the shower can reach: a drop that falls on one lands on its leaves, not the soil.
    const leafy = garden.plants.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < radius + 0.5 && p.growth > 0.15)
    this.spawnDebt += rate * dt
    const R0 = T.render.streak
    const top = this.y - 0.2
    const sp = this.splash.geometry.attributes.position as THREE.BufferAttribute
    this.drops.forEach((d, i) => {
      if (d.live) {
        d.y -= fall
        if (d.y < d.floor) {
          d.live = false
          // One drop in three splashes, into a few droplets thrown up and out.
          if (i % 3 === 0) {
            for (let j = 0; j < T.render.splash.droplets; j++) {
              const s = this.splashes[this.nextSplash]
              this.nextSplash = (this.nextSplash + 1) % this.splashes.length
              const a = Math.random() * Math.PI * 2
              const out = 0.4 + Math.random() * 0.6
              s.x = d.x
              s.z = d.z
              s.y = d.floor + 0.02
              s.vx = Math.cos(a) * out
              s.vz = Math.sin(a) * out
              s.vy = 0.8 + Math.random() * 0.9
              s.age = 0
            }
          }
        }
      }
      if (!d.live && this.spawnDebt >= 1) {
        this.spawnDebt -= 1
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * radius
        d.x = c.x + Math.cos(a) * r
        d.z = c.z + Math.sin(a) * r
        d.floor = onBed(d.x, d.z) ? T.bed.height : 0
        for (const p of leafy) {
          const reach = (T.kinds[p.kind].reach ?? 0.4) * 0.8 * p.growth
          if (Math.hypot(d.x - p.x, d.z - p.z) < reach) {
            d.floor = (p.inBed ? T.bed.height : 0) + HEIGHT[p.kind] * p.growth * (0.45 + Math.random() * 0.45)
            break
          }
        }
        // Born anywhere down the fall, so the shower has no hard line under the cloud.
        d.y = top - Math.random() * (top - d.floor) * 0.8
        d.live = true
      }
      const y = d.live ? d.y : -10
      // Storm rain slants with the wind.
      const sx = storming ? c.windX * 0.25 : 0
      const sz = storming ? c.windZ * 0.25 : 0
      arr[i * 6] = d.x
      arr[i * 6 + 1] = y
      arr[i * 6 + 2] = d.z
      arr[i * 6 + 3] = d.x - sx
      const len = (storming ? R0.storm : R0.shower) * (0.6 + 0.8 * ((i * 0.618) % 1))
      arr[i * 6 + 4] = y + len
      arr[i * 6 + 5] = d.z - sz
    })
    this.spawnDebt = Math.min(this.spawnDebt, 50)
    pos.needsUpdate = true
    const life = T.render.splash.life
    this.splashes.forEach((s, i) => {
      s.age += dt
      const on = s.age < life
      if (on) {
        s.x += s.vx * dt
        s.z += s.vz * dt
        s.y += s.vy * dt
        s.vy -= 9.8 * dt
      }
      sp.setXYZ(i, s.x, on ? s.y : -10, s.z)
    })
    sp.needsUpdate = true
  }

  private updateVeil(garden: Garden, dt: number) {
    const c = garden.cloud
    const storming = this.storm > 0.3
    const want = c.raining || storming ? (storming ? 0.22 : 0.16) : 0
    const u = this.veilMat.uniforms.uOpacity
    u.value += (want - u.value) * (1 - Math.exp(-dt * 4))
    this.veil.visible = u.value > 0.005
    if (!this.veil.visible) return
    const r = storming ? T.storm.radius : garden.radius
    const h = this.y
    this.veil.scale.set(r, h, r)
    this.veil.position.set(c.x, h / 2, c.z)
  }

  private updateMist(garden: Garden, dt: number) {
    const c = garden.cloud
    const mat = this.mist.material as THREE.PointsMaterial
    mat.opacity += ((c.refilling ? 0.7 : 0) - mat.opacity) * (1 - Math.exp(-dt * 3))
    this.mist.visible = mat.opacity > 0.01
    if (!this.mist.visible) return
    const pos = this.mist.geometry.attributes.position as THREE.BufferAttribute
    this.mistDots.forEach((m, i) => {
      m.t += dt * 0.3
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
      pos.setXYZ(i, x + (c.x - x) * s * s, 0.05 + s * (this.y - 0.3), z + (c.z - z) * s * s)
    })
    pos.needsUpdate = true
  }
}
