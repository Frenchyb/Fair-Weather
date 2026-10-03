/**
 * The clouds drifting over the garden on the prevailing wind: a few white
 * ones on a fine day casting moving shade, a low grey crowd on a dull one.
 * They are the climate's clouds, so their shade on the ground is the shade
 * the plants feel. Reads the garden only.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { T } from '../tuning'
import { lumpy } from './cloud'
import { SKY_CLOUDS, seasonUniforms } from './shade'
import { rng } from './world'

export class DriftView {
  private groups: THREE.Group[] = []
  private mats: THREE.MeshStandardMaterial[] = []

  constructor(scene: THREE.Scene) {
    const r = rng(31)
    const geos = [lumpy(2, 4), lumpy(2, 5.5), lumpy(2, 7.1)]
    for (let i = 0; i < SKY_CLOUDS; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8a96a4, roughness: 1, transparent: true, opacity: 0 })
      const g = new THREE.Group()
      for (let j = 0; j < T.render.skyPuffs; j++) {
        const p = new THREE.Mesh(geos[j % 3], mat)
        const a = r() * Math.PI * 2
        const d = j === 0 ? 0 : Math.sqrt(r()) * 0.8
        const s = (0.55 - d * 0.25) * (0.8 + r() * 0.4)
        p.position.set(Math.cos(a) * d, s * 0.4 + (1 - d) * 0.15, Math.sin(a) * d * 0.7)
        p.scale.set(s * 1.2, s * 0.75, s)
        g.add(p)
      }
      g.visible = false
      scene.add(g)
      this.groups.push(g)
      this.mats.push(mat)
    }
  }

  update(garden: Garden, camera: THREE.Camera) {
    const cl = garden.climate
    const day = garden.daylight
    const shade = T.climate.cloudShade * cl.mix.clear * day
    const uni = seasonUniforms.uSkyClouds.value
    for (let i = 0; i < SKY_CLOUDS; i++) {
      const c = cl.clouds[i]
      const g = this.groups[i]
      g.visible = !!c && c.fade > 0.01
      if (!c) {
        uni[i].set(0, 0, 1, 0)
        continue
      }
      g.position.set(c.x, c.y, c.z)
      g.scale.set(c.r * 1.5, c.r * 0.55, c.r * 1.5)
      const m = this.mats[i]
      // Thin out a cloud the camera is up among, so it never blinds the view.
      const near = THREE.MathUtils.smoothstep(camera.position.distanceTo(g.position), c.r * 1.3, c.r * 3)
      m.opacity = c.fade * 0.8 * near
      g.visible = g.visible && m.opacity > 0.01
      m.color.setScalar(1 - c.dark * 0.55)
      m.emissive.setHex(0x8a96a4).multiplyScalar((1 - c.dark * 0.6) * (0.08 + 0.92 * day))
      uni[i].set(c.x, c.z, c.r, c.fade * shade)
    }
  }
}
