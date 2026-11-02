/**
 * What falls through the air over the whole garden: rain on a rainy day,
 * snow in winter (from the sky, and from the player's cloud), and leaves
 * coming down round the trees in autumn. All of it is drawn round the view so
 * it fills the screen without simulating the whole county. Reads the garden.
 */
import * as THREE from 'three'
import { onBed, type Garden } from '../sim/garden'
import { T } from '../tuning'

/** A soft white dot for snowflakes. */
function flakeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface Mote {
  x: number
  y: number
  z: number
  vy: number
  phase: number
  live: boolean
  floor: number
}

const P = T.render.precip

export class Precip {
  private rain: THREE.LineSegments
  private drops: Mote[] = []
  private snow: THREE.Points
  private flakes: Mote[] = []
  private leaves: THREE.InstancedMesh
  private falling: (Mote & { spin: number; tilt: number })[] = []
  private rainDebt = 0
  private snowDebt = 0
  private leafDebt = 0
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private v = new THREE.Vector3()
  private s = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.rain = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.rain * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0xa9bccb, transparent: true, opacity: 0.45, depthWrite: false }),
    )
    this.rain.frustumCulled = false
    for (let i = 0; i < P.rain; i++) this.drops.push(mote())
    scene.add(this.rain)

    this.snow = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.snow * 3), 3)),
      new THREE.PointsMaterial({ map: flakeTexture(), size: 0.13, transparent: true, depthWrite: false, opacity: 0.95 }),
    )
    this.snow.frustumCulled = false
    for (let i = 0; i < P.snow; i++) this.flakes.push(mote())
    scene.add(this.snow)

    const leaf = new THREE.PlaneGeometry(0.13, 0.09)
    this.leaves = new THREE.InstancedMesh(
      leaf,
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }),
      P.leaves,
    )
    const palette = [0xc0561a, 0xd59a24, 0x9c2a14, 0x7a5230, 0xc87a1c]
    const c = new THREE.Color()
    for (let i = 0; i < P.leaves; i++) {
      this.falling.push({ ...mote(), spin: Math.random() * 6, tilt: Math.random() * 6 })
      this.leaves.setColorAt(i, c.setHex(palette[i % palette.length]))
    }
    this.leaves.frustumCulled = false
    scene.add(this.leaves)
  }

  update(garden: Garden, focus: THREE.Vector2, dt: number) {
    const cl = garden.climate
    const t = garden.time
    const wx = cl.windX
    const wz = cl.windZ
    const R = P.reach

    // Rain over everything round the view, slanting a little with the wind.
    this.rainDebt = Math.min(200, this.rainDebt + cl.rainfall * P.rainRate * dt)
    const rp = this.rain.geometry.attributes.position as THREE.BufferAttribute
    const ra = rp.array as Float32Array
    const fall = T.render.rainSpeed * 1.1 * dt
    this.drops.forEach((d, i) => {
      if (d.live) {
        d.y -= fall
        d.x += wx * fall * 0.12
        d.z += wz * fall * 0.12
        if (d.y < d.floor) d.live = false
      }
      if (!d.live && this.rainDebt >= 1) {
        this.rainDebt -= 1
        d.x = focus.x + (Math.random() - 0.5) * R * 2
        d.z = focus.y + (Math.random() - 0.5) * R * 2
        d.floor = onBed(d.x, d.z) ? T.bed.height : 0
        d.y = d.floor + Math.random() * P.height
        d.live = true
      }
      const y = d.live ? d.y : -50
      ra[i * 6] = d.x
      ra[i * 6 + 1] = y
      ra[i * 6 + 2] = d.z
      ra[i * 6 + 3] = d.x - wx * 0.09
      ra[i * 6 + 4] = y + 0.75
      ra[i * 6 + 5] = d.z - wz * 0.09
    })
    rp.needsUpdate = true
    this.rain.visible = cl.rainfall > 0.01 || this.drops.some((d) => d.live)

    // Snow: from the sky in winter weather, and from the cloud when it snows.
    const c = garden.cloud
    const cloudSnow = c.raining && cl.dormant
    this.snowDebt = Math.min(200, this.snowDebt + cl.snowfall * P.snowRate * dt)
    let cloudDebt = cloudSnow ? P.cloudSnowRate * dt : 0
    const sp = this.snow.geometry.attributes.position as THREE.BufferAttribute
    this.flakes.forEach((f, i) => {
      if (f.live) {
        f.y -= f.vy * dt
        f.x += (wx * 0.5 + Math.sin(t * 1.3 + f.phase) * 0.35) * dt
        f.z += (wz * 0.5 + Math.cos(t * 1.1 + f.phase) * 0.35) * dt
        if (f.y < f.floor) f.live = false
      }
      if (!f.live && (cloudDebt >= 1 || this.snowDebt >= 1)) {
        if (cloudDebt >= 1) {
          cloudDebt -= 1
          const a = Math.random() * Math.PI * 2
          const r = Math.sqrt(Math.random()) * garden.radius
          f.x = c.x + Math.cos(a) * r
          f.z = c.z + Math.sin(a) * r
          f.y = T.cloud.height - Math.random() * 2
        } else {
          this.snowDebt -= 1
          f.x = focus.x + (Math.random() - 0.5) * R * 2
          f.z = focus.y + (Math.random() - 0.5) * R * 2
          f.y = Math.random() * P.height
        }
        f.floor = onBed(f.x, f.z) ? T.bed.height : 0
        f.vy = 0.9 + Math.random() * 0.7
        f.phase = Math.random() * 6
        f.live = true
      }
      sp.setXYZ(i, f.x, f.live ? f.y : -50, f.z)
    })
    sp.needsUpdate = true
    this.snow.visible = this.flakes.some((f) => f.live)

    // Leaves coming down round the trees in autumn, fluttering as they fall.
    const autumn = cl.look.autumn
    this.leafDebt = Math.min(20, this.leafDebt + autumn * P.leafRate * (1 + (c.breezing ? 3 : 0)) * dt)
    const trees = garden.trees
    let shown = 0
    this.falling.forEach((l, i) => {
      if (l.live) {
        l.y -= l.vy * dt
        l.x += (wx * 0.6 + Math.sin(t * 2 + l.phase) * 0.5) * dt
        l.z += (wz * 0.6 + Math.cos(t * 1.7 + l.phase) * 0.4) * dt
        if (l.y < 0.02) l.live = false
      }
      if (!l.live && this.leafDebt >= 1) {
        this.leafDebt -= 1
        const tree = trees[Math.floor(Math.random() * trees.length)]
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * 2.2
        l.x = tree.x + Math.cos(a) * r
        l.z = tree.z + Math.sin(a) * r
        l.y = 2.5 + Math.random() * 3
        l.vy = 0.5 + Math.random() * 0.4
        l.phase = Math.random() * 6
        l.live = true
      }
      if (!l.live) {
        this.m.makeScale(0, 0, 0)
      } else {
        shown++
        this.e.set(l.tilt + t * 2.1 + l.phase, l.spin + t * 1.3, Math.sin(t * 3 + l.phase) * 0.8)
        this.m.compose(this.v.set(l.x, l.y, l.z), this.q.setFromEuler(this.e), this.s.set(1, 1, 1))
      }
      this.leaves.setMatrixAt(i, this.m)
    })
    this.leaves.instanceMatrix.needsUpdate = true
    this.leaves.visible = shown > 0
  }
}

function mote(): Mote {
  return { x: 0, y: -50, z: 0, vy: 1, phase: 0, live: false, floor: 0 }
}
