/**
 * Footprints in the snow: anything that walks across a snowy lawn leaves a
 * trail behind it, so you can see who has been about even when they are
 * hiding. They fade as the snow melts. Reads the garden only.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'

const MAX = 400

export class Tracks {
  private mesh: THREE.InstancedMesh
  private prints: { x: number; z: number; a: number; s: number; age: number }[] = []
  private next = 0
  private last = new Map<object, { x: number; z: number; side: number }>()
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private up = new THREE.Vector3(0, 1, 0)

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CircleGeometry(1, 8)
    geo.rotateX(-Math.PI / 2)
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x9aa6b4, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }),
      MAX,
    )
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  /** Call every frame for each walker: a print every `stride` metres while on snow. */
  walk(garden: Garden, who: object, x: number, z: number, size: number, stride = 0.3) {
    const prev = this.last.get(who)
    if (!prev) {
      this.last.set(who, { x, z, side: 1 })
      return
    }
    const d = Math.hypot(x - prev.x, z - prev.z)
    if (d < stride) return
    if (d < 3 && garden.ground.snowAt(x, z) > 0.3) {
      const a = Math.atan2(x - prev.x, z - prev.z)
      // Left, right, left: a little to each side of the line of travel.
      const ox = Math.cos(a) * size * 1.4 * prev.side
      const oz = -Math.sin(a) * size * 1.4 * prev.side
      this.prints[this.next] = { x: x + ox, z: z + oz, a, s: size, age: 0 }
      this.next = (this.next + 1) % MAX
      prev.side = -prev.side
    }
    prev.x = x
    prev.z = z
  }

  update(garden: Garden, dt: number) {
    let n = 0
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    for (const p of this.prints) {
      if (!p) continue
      p.age += dt
      if (p.age > 300 || garden.ground.snowAt(p.x, p.z) < 0.15) continue
      this.q.setFromAxisAngle(this.up, p.a)
      this.m.compose(v.set(p.x, 0.035, p.z), this.q, s.set(p.s, 1, p.s * 1.5))
      this.mesh.setMatrixAt(n++, this.m)
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
