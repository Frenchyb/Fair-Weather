/**
 * The player's cloud, high over the garden: a heap of lumpy puffs, grey
 * underneath and bright on top, much wider than the shower it drops. Rain
 * falls from its base in streaks and splashes where it lands, a faint veil
 * shows where the shower is, mist lifts off the pond while it drinks, and in
 * a storm it swells and darkens over half the yard. Reads the garden only.
 */
import * as THREE from 'three'
import { onBed, type Garden } from '../sim/garden'
import { T } from '../tuning'
import { rng } from './world'

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
  private puffs: THREE.Mesh[] = []
  private mat: THREE.MeshStandardMaterial
  private size = 1
  private y: number = T.cloud.height
  private storm = 0
  private rain: THREE.LineSegments
  private drops: { x: number; y: number; z: number; floor: number; live: boolean }[] = []
  private spawnDebt = 0
  private splash: THREE.Points
  private splashes: { x: number; y: number; z: number; age: number }[] = []
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
      p.userData.base = p.position.clone()
      p.userData.phase = r() * 6
      p.castShadow = false
      this.group.add(p)
      this.puffs.push(p)
    }
    scene.add(this.group)

    // Rain: streaks recycled from a fixed pool.
    const m = T.render.rainDrops
    this.rain = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0x9fb8cc, transparent: true, opacity: 0.6 }),
    )
    this.rain.frustumCulled = false
    for (let i = 0; i < m; i++) this.drops.push({ x: 0, y: -10, z: 0, floor: 0, live: false })
    scene.add(this.rain)

    const k = 700
    this.splash = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(k * 3), 3)),
      new THREE.PointsMaterial({ color: 0xdfeaf2, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false }),
    )
    this.splash.frustumCulled = false
    for (let i = 0; i < k; i++) this.splashes.push({ x: 0, y: -10, z: 0, age: 1 })
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
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vH; varying vec3 vN; varying vec3 vV;
        void main() { float edge = 1.0 - abs(dot(vN, vV));
          float a = uOpacity * (0.35 + 0.65 * edge) * smoothstep(0.0, 0.15, vH) * (0.55 + 0.45 * vH);
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
    this.puffs.forEach((p) => {
      const b = p.userData.base as THREE.Vector3
      const ph = p.userData.phase as number
      p.position.set(b.x + Math.sin(t * 0.3 + ph) * 0.02, b.y + Math.sin(t * 0.45 + ph) * 0.025, b.z)
    })
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
    const rate = (c.raining && !garden.climate.dormant ? 900 : 0) + (storming ? 2600 * this.storm : 0)
    this.spawnDebt += rate * dt
    const len = 0.7
    const top = this.y - 0.2
    const sp = this.splash.geometry.attributes.position as THREE.BufferAttribute
    this.drops.forEach((d, i) => {
      if (d.live) {
        d.y -= fall
        if (d.y < d.floor) {
          d.live = false
          // One splash in three, which reads as plenty.
          if (i % 3 === 0) {
            const s = this.splashes[this.nextSplash]
            this.nextSplash = (this.nextSplash + 1) % this.splashes.length
            s.x = d.x
            s.z = d.z
            s.y = d.floor
            s.age = 0
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
        d.y = top - Math.random() * 1.2
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
      arr[i * 6 + 4] = y + len
      arr[i * 6 + 5] = d.z - sz
    })
    this.spawnDebt = Math.min(this.spawnDebt, 50)
    pos.needsUpdate = true
    this.splashes.forEach((s, i) => {
      s.age += dt
      const on = s.age < 0.18
      sp.setXYZ(i, s.x, on ? s.y + 0.03 + s.age * 0.4 : -10, s.z)
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
