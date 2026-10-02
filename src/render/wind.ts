/**
 * Everything the breeze moves: wisps of air around the cloud, seed fluff in
 * flight, pollen on open flowers, and the wildflowers the seed grows into.
 * Reads the garden; keeps only its own animation state.
 */
import * as THREE from 'three'
import { WILD_KINDS, type Garden, type WildKind } from '../sim/garden'
import { T } from '../tuning'
import { shaded } from './shade'

const HEAD: Record<WildKind, number> = {
  poppy: 0xd8432f,
  cornflower: 0x4f6fd0,
  daisy: 0xf4f1e6,
  buttercup: 0xf1c232,
}

function points(n: number, color: number, size: number) {
  const p = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)),
    new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, depthWrite: false }),
  )
  p.frustumCulled = false
  return p
}

export class WindView {
  private wisps: THREE.LineSegments
  private wispState: { x: number; z: number; y: number; age: number; life: number }[] = []
  private seeds = points(T.wind.maxSeedsInAir, 0xfdfbf2, 0.09)
  private pollen: THREE.Points
  private stems: THREE.InstancedMesh
  private heads: THREE.InstancedMesh
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private v = new THREE.Vector3()
  private s = new THREE.Vector3()
  private c = new THREE.Color()

  constructor(scene: THREE.Scene, plants: number) {
    this.pollen = points(plants * 12, 0xf6d55c, 0.06)
    const n = T.render.windWisps
    this.wisps = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    )
    this.wisps.frustumCulled = false
    for (let i = 0; i < n; i++) this.wispState.push({ x: 0, z: 0, y: -5, age: 1, life: 1 })
    scene.add(this.wisps, this.seeds, this.pollen)

    const stem = new THREE.CylinderGeometry(0.016, 0.022, 1, 4)
    stem.translate(0, 0.5, 0)
    const head = new THREE.IcosahedronGeometry(1, 0)
    head.scale(1, 0.55, 1)
    this.stems = new THREE.InstancedMesh(stem, shaded(new THREE.MeshLambertMaterial({ color: 0x5d8f3c })), T.wild.max)
    this.heads = new THREE.InstancedMesh(head, shaded(new THREE.MeshLambertMaterial({ color: 0xffffff })), T.wild.max)
    const c = new THREE.Color()
    for (let i = 0; i < T.wild.max; i++) {
      this.heads.setColorAt(i, c.setHex(HEAD[WILD_KINDS[i % WILD_KINDS.length]]))
    }
    this.stems.count = this.heads.count = 0
    this.stems.castShadow = this.heads.castShadow = true
    scene.add(this.stems, this.heads)
  }

  update(garden: Garden, dt: number) {
    this.updateWisps(garden, dt)
    this.updateSeeds(garden)
    this.updatePollen(garden)
    this.updateFlowers(garden)
  }

  private updateWisps(garden: Garden, dt: number) {
    const c = garden.cloud
    const mat = this.wisps.material as THREE.LineBasicMaterial
    mat.opacity += ((c.breezing ? 0.8 : 0) - mat.opacity) * (1 - Math.exp(-dt * 4))
    this.wisps.visible = mat.opacity > 0.01
    if (!this.wisps.visible) return
    const pos = this.wisps.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const reach = garden.radius + T.wind.reach
    const speed = 3.2
    const len = 0.8
    this.wispState.forEach((w, i) => {
      w.age += dt
      if (w.age > w.life && c.breezing) {
        // Start upwind of the cloud and travel through and past it.
        const side = (Math.random() - 0.5) * 2 * reach
        const back = -reach * (0.4 + Math.random() * 0.6)
        w.x = c.x + c.windX * back - c.windZ * side
        w.z = c.z + c.windZ * back + c.windX * side
        w.y = 0.4 + Math.random() * 1.8
        w.age = 0
        w.life = 0.6 + Math.random() * 0.6
      }
      const live = w.age < w.life
      const t = w.age * speed
      const x = w.x + c.windX * t
      const z = w.z + c.windZ * t
      const y = live ? w.y + Math.sin(w.age * 6 + i) * 0.05 : -5
      arr.set([x, y, z, x - c.windX * len, y, z - c.windZ * len], i * 6)
    })
    pos.needsUpdate = true
  }

  private updateSeeds(garden: Garden) {
    const pos = this.seeds.geometry.attributes.position as THREE.BufferAttribute
    const t = garden.time
    for (let i = 0; i < T.wind.maxSeedsInAir; i++) {
      const s = garden.seeds[i]
      if (!s) {
        pos.setXYZ(i, 0, -5, 0)
        continue
      }
      // Float up off the plant, then settle as the flight runs out.
      const y = 0.3 + Math.min(1.2, s.flight * 0.7) + Math.sin(t * 5 + i) * 0.06
      pos.setXYZ(i, s.x, y, s.z)
    }
    pos.needsUpdate = true
  }

  private updatePollen(garden: Garden) {
    const pos = this.pollen.geometry.attributes.position as THREE.BufferAttribute
    const t = garden.time
    let k = 0
    for (const p of garden.plants) {
      for (let j = 0; j < 12; j++, k++) {
        if (!p.pollinating) {
          pos.setXYZ(k, 0, -5, 0)
          continue
        }
        const a = t * 2 + j * 0.52
        const r = 0.18 + ((j * 37) % 10) * 0.025
        const drift = ((t * 0.8 + j * 0.13) % 1) * 0.6
        pos.setXYZ(
          k,
          p.x + Math.cos(a) * r + garden.cloud.windX * drift,
          (p.inBed ? T.bed.height : 0) + 0.5 + Math.sin(a * 1.7) * 0.2,
          p.z + Math.sin(a) * r + garden.cloud.windZ * drift,
        )
      }
    }
    pos.needsUpdate = true
  }

  private updateFlowers(garden: Garden) {
    const t = garden.time
    const flowers = garden.wildflowers
    flowers.forEach((f, i) => {
      const g = Math.max(0.05, f.growth)
      const h = (0.3 + ((i * 7) % 5) * 0.04) * g
      const breeze = garden.breezeAt(f.x, f.z)
      const lean = Math.sin(t * 1.6 + i) * 0.06 + breeze * 0.35
      this.q.setFromAxisAngle(this.v.set(garden.cloud.windZ, 0, -garden.cloud.windX), lean)
      this.m.compose(this.v.set(f.x, 0, f.z), this.q, this.s.set(1, h, 1))
      this.stems.setMatrixAt(i, this.m)
      const top = this.v.set(0, h, 0).applyQuaternion(this.q)
      // A green bud until it opens, then the flower's own colour.
      const r = Math.max(0.012, f.growth < 0.6 ? 0 : 0.08 * ((f.growth - 0.6) / 0.4))
      this.m.compose(this.v.set(f.x + top.x, top.y, f.z + top.z), this.q, this.s.setScalar(r))
      this.heads.setMatrixAt(i, this.m)
      this.heads.setColorAt(i, this.c.setHex(f.growth < 0.6 ? 0x6f9f4a : HEAD[f.kind]))
    })
    this.stems.count = this.heads.count = flowers.length
    this.stems.instanceMatrix.needsUpdate = true
    this.heads.instanceMatrix.needsUpdate = true
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true
  }
}
