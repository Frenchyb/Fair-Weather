/**
 * Everything beyond the fence: a sky with a sun in it, fair-weather clouds
 * drifting high over, and a patchwork of fields, hedgerows and woods rolling
 * away into hills, with a windmill turning on one of them. It is what makes
 * the garden feel like a place in the countryside rather than a tile.
 */
import * as THREE from 'three'
import { T } from '../tuning'
import { rng } from './world'

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`

const SKY_FS = `
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
uniform float uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.55));
  c = mix(c, uGround, smoothstep(0.0, -0.08, up));
  float s = max(0.0, dot(d, normalize(uSunDir)));
  c += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35) * uSun;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Fields in a rotated grid, each its own crop, with hedgerows between. */
const PATCHWORK = `
float hwHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
vec3 patchwork(vec2 xz) {
  float a = 0.35;
  vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * xz;
  vec2 size = vec2(34.0, 26.0);
  vec2 cell = floor(p / size);
  vec2 f = fract(p / size);
  float h = hwHash(cell);
  vec3 c;
  float rows = 0.0;
  if (h < 0.25) { c = vec3(0.60, 0.50, 0.22); rows = 1.0; }        // ripe wheat
  else if (h < 0.5) { c = vec3(0.20, 0.36, 0.10); }                // pasture
  else if (h < 0.65) { c = vec3(0.30, 0.42, 0.12); rows = 1.0; }   // young crop
  else if (h < 0.78) { c = vec3(0.36, 0.26, 0.16); rows = 1.0; }   // ploughed
  else if (h < 0.9) { c = vec3(0.45, 0.48, 0.18); }                // hay meadow
  else { c = vec3(0.38, 0.30, 0.45); }                             // lavender
  float dir = hwHash(cell + 3.0) > 0.5 ? f.x : f.y;
  c *= 1.0 - rows * 0.12 * smoothstep(0.3, 0.7, abs(fract(dir * 18.0) - 0.5) * 2.0);
  c *= 0.9 + 0.2 * hwHash(floor(p * 0.5));
  // Hedgerows round every field.
  vec2 e = min(f, 1.0 - f) * size;
  float hedge = 1.0 - smoothstep(0.6, 1.4, min(e.x, e.y));
  return mix(c, vec3(0.10, 0.20, 0.07), hedge);
}`

export class Horizon {
  readonly root = new THREE.Group()
  readonly sky: THREE.ShaderMaterial
  private sails = new THREE.Group()
  private clouds: THREE.Group[] = []

  constructor() {
    this.sky = new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x3d7cc9) },
        uHorizon: { value: new THREE.Color(0xcfe2ee) },
        uGround: { value: new THREE.Color(0x8a9a80) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xfff2d8) },
        uSun: { value: 1 },
      },
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.sky)
    dome.renderOrder = -10
    dome.frustumCulled = false
    this.root.add(dome)

    this.land()
    this.woods()
    this.windmill()
    this.farm()
    this.highClouds()
  }

  /** How far the land lies below the lawn at a point: flat round the garden, rolling further out. */
  static height(x: number, z: number) {
    const cx = (T.yard.x0 + T.yard.x1) / 2
    const cz = (T.yard.z0 + T.yard.z1) / 2
    const dx = Math.max(0, Math.abs(x - cx) - 30)
    const dz = Math.max(0, Math.abs(z - cz) - 24)
    const away = Math.hypot(dx, dz)
    const roll = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 7 + Math.sin(x * 0.007 + z * 0.011) * 14 + 6
    const back = Math.max(0, -(z + 120)) * 0.12
    return -0.06 + Math.min(1, away / 60) * (roll + back) * Math.min(1, away / 25)
  }

  private land() {
    const geo = new THREE.PlaneGeometry(1400, 1400, 220, 220)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setY(i, Horizon.height(pos.getX(i), pos.getZ(i)))
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vLandXZ;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvLandXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec2 vLandXZ;\n${PATCHWORK}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Next door's lawns and the lane blend into the open fields.
          float near = smoothstep(55.0, 90.0, length(vLandXZ * vec2(1.0, 1.3)));
          diffuseColor.rgb = mix(vec3(0.17, 0.30, 0.08), patchwork(vLandXZ), near);`,
        )
    }
    mat.customProgramCacheKey = () => 'fw-land'
    const land = new THREE.Mesh(geo, mat)
    land.receiveShadow = true
    this.root.add(land)
  }

  /** Woods and hedgerow trees, as instanced crowns and trunks. */
  private woods() {
    const r = rng(77)
    const n = 1600
    const crown = new THREE.IcosahedronGeometry(1, 1)
    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1, 5)
    trunk.translate(0, 0.5, 0)
    const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), n)
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3626 }), n)
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const cx = (T.yard.x0 + T.yard.x1) / 2
    const cz = (T.yard.z0 + T.yard.z1) / 2
    let i = 0
    const plant = (x: number, z: number, size: number) => {
      if (i >= n) return
      if (Math.abs(x - cx) < 27 && Math.abs(z - cz) < 20) return
      const y = Horizon.height(x, z)
      const h = size * (2.5 + r() * 1.5)
      this.m4(m, v.set(x, y, z), q, s.set(size * 0.6, h, size * 0.6))
      trunks.setMatrixAt(i, m)
      this.m4(m, v.set(x, y + h + size * 0.9, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), s.set(size * 2, size * 1.8, size * 2))
      crowns.setMatrixAt(i, m)
      crowns.setColorAt(i, c.setHSL(0.24 + r() * 0.07, 0.35 + r() * 0.15, 0.17 + r() * 0.1))
      i++
    }
    // Woods: clumps out in the fields.
    for (let w = 0; w < 26; w++) {
      const a = r() * Math.PI * 2
      const d = 70 + r() * 420
      const wx = cx + Math.cos(a) * d
      const wz = cz + Math.sin(a) * d * 0.9 - 40
      const k = 14 + Math.floor(r() * 40)
      for (let j = 0; j < k; j++) plant(wx + (r() - 0.5) * 50, wz + (r() - 0.5) * 30, 1.6 + r() * 1.4)
    }
    // Hedgerow trees along the same field grid the land is painted with.
    const a = 0.35
    for (let j = 0; j < 700; j++) {
      const gx = Math.floor((r() - 0.5) * 30)
      const gz = Math.floor((r() - 0.5) * 30)
      const along = r()
      const onX = r() > 0.5
      const px = (onX ? gx + along : gx) * 34
      const pz = (onX ? gz : gz + along) * 26
      // Undo the patchwork's rotation to find the world point.
      const x = Math.cos(a) * px + Math.sin(a) * pz
      const z = -Math.sin(a) * px + Math.cos(a) * pz
      if (Math.hypot(x - cx, z - cz) > 60) plant(x, z, 1.4 + r() * 1.2)
    }
    // A screen of tall trees just beyond the back hedge.
    for (let x = T.yard.x0 - 30; x < T.yard.x1 + 30; x += 3 + r() * 4) plant(x, T.yard.z0 - 14 - r() * 10, 2 + r() * 1.2)
    crowns.count = trunks.count = i
    crowns.castShadow = trunks.castShadow = true
    this.root.add(crowns, trunks)
  }

  private m4(m: THREE.Matrix4, p: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3) {
    m.compose(p, q, s)
  }

  private windmill() {
    const g = new THREE.Group()
    const white = new THREE.MeshStandardMaterial({ color: 0xece6da })
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 13, 10), white)
    tower.position.y = 6.5
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3, 10), new THREE.MeshStandardMaterial({ color: 0x5a463a }))
    cap.position.y = 14.4
    g.add(tower, cap)
    this.sails.position.set(0, 13, 2.6)
    const sail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 0.12), new THREE.MeshStandardMaterial({ color: 0xd9d2c4 }))
    sail.position.y = 4.5
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group()
      arm.add(sail.clone())
      arm.rotation.z = (i * Math.PI) / 2
      this.sails.add(arm)
    }
    g.add(this.sails)
    const x = -95
    const z = -150
    g.position.set(x, Horizon.height(x, z), z)
    g.rotation.y = 0.5
    g.traverse((o) => (o.castShadow = true))
    this.root.add(g)
  }

  private farm() {
    // A farmhouse and a red barn across the fields.
    const house = new THREE.Group()
    const wall = new THREE.MeshStandardMaterial({ color: 0xe8dcc4 })
    const roof = new THREE.MeshStandardMaterial({ color: 0x6b4a3a })
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 7), wall)
    body.position.y = 3
    const top = new THREE.Mesh(new THREE.ConeGeometry(7.2, 4, 4), roof)
    top.position.y = 8
    top.rotation.y = Math.PI / 4
    top.scale.set(1, 1, 0.75)
    house.add(body, top)
    const barn = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 9), new THREE.MeshStandardMaterial({ color: 0x9c3a2c }))
    barn.position.set(16, 4, 3)
    const barnRoof = new THREE.Mesh(new THREE.ConeGeometry(10, 5, 4), new THREE.MeshStandardMaterial({ color: 0x4a4a4a }))
    barnRoof.position.set(16, 10.5, 3)
    barnRoof.rotation.y = Math.PI / 4
    barnRoof.scale.set(1, 1, 0.7)
    house.add(barn, barnRoof)
    const x = 120
    const z = -110
    house.position.set(x, Horizon.height(x, z), z)
    house.rotation.y = -0.4
    house.traverse((o) => (o.castShadow = true))
    this.root.add(house)
  }

  /** Fair-weather cumulus high overhead and far off, drifting slowly. */
  private highClouds() {
    const r = rng(5)
    const puff = new THREE.IcosahedronGeometry(1, 2)
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8796a8, roughness: 1, fog: false })
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group()
      const k = 5 + Math.floor(r() * 6)
      for (let j = 0; j < k; j++) {
        const p = new THREE.Mesh(puff, mat)
        const s = 6 + r() * 8
        p.position.set((r() - 0.5) * 30, r() * 5, (r() - 0.5) * 12)
        p.scale.set(s * 1.3, s * 0.8, s)
        g.add(p)
      }
      const a = -Math.PI * 0.95 + r() * Math.PI * 0.9
      const d = 220 + r() * 380
      g.position.set(Math.cos(a) * d, 60 + r() * 50, Math.sin(a) * d)
      g.userData.speed = 1 + r() * 1.5
      this.clouds.push(g)
      this.root.add(g)
    }
  }

  update(time: number, dt: number) {
    this.sails.rotation.z -= dt * 0.35
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > 650) c.position.x -= 1300
    }
    void time
  }
}
