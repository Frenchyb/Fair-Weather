/**
 * Rose and Walter, the washing line, and the things they leave about: the
 * snowman, the vase of cut flowers in the front window, the crate of produce
 * by the door, the basket waiting on a grey morning. The people are simple
 * figures; what matters at this distance is the pose (bent over the bed,
 * arms up at the line, sitting with tea, running for the door) and what they
 * carry. Reads the garden only.
 */
import * as THREE from 'three'
import type { Garden } from '../sim/garden'
import { washSpot, type Carry, type Emote, type Person } from '../sim/people'
import { T } from '../tuning'
import { ball, block, cone, leg, part, std } from './critters'

// The shared cone points along +z (a beak) and the shared leg hangs down from
// its origin; props here want them upright and centred.
const rod = new THREE.CylinderGeometry(1, 1, 1, 8)
const peak = new THREE.ConeGeometry(1, 1, 12)
import type { Tracks } from './tracks'

const BLOOM: Record<string, number> = {
  lavender: 0x9b7fd0,
  sunflower: 0xf2c230,
  moonflower: 0xf4f1e6,
  tomato: 0xd8432f,
  lettuce: 0x8cc152,
  apple: 0xc8372d,
  fern: 0x4f8a3c,
}

const HOUSE = { x: -12, front: -6.27 }

interface Figure {
  root: THREE.Group
  hips: THREE.Group
  head: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  props: Partial<Record<Exclude<Carry, null> | 'umbrellaUp' | 'produce', THREE.Object3D>>
  produce: THREE.MeshStandardMaterial
  bubble: THREE.Sprite
  light: THREE.PointLight | null
  phase: number
}

function limb(color: number, length: number, width: number, x: number, y: number) {
  const g = new THREE.Group()
  g.position.set(x, y, 0)
  const m = part(leg, std(color), 0, 0, 0, width, length, width)
  m.castShadow = true
  g.add(m)
  return g
}

function figure(rose: boolean, scene: THREE.Scene): Figure {
  const root = new THREE.Group()
  const skin = 0xe8c4a8
  const top = rose ? 0x5b7fa6 : 0x6e7b52
  const lower = rose ? 0x5b7fa6 : 0x4a4f5c
  const legL = limb(rose ? skin : lower, 0.82, 0.07, -0.09, 0.85)
  const legR = limb(rose ? skin : lower, 0.82, 0.07, 0.09, 0.85)
  for (const l of [legL, legR]) l.add(part(block, std(0x3a2e26), 0, -0.82, 0.05, 0.1, 0.07, 0.2))
  root.add(legL, legR)
  const hips = new THREE.Group()
  hips.position.y = 0.85
  root.add(hips)
  if (rose) {
    // A dress: a cone from the waist to the knee, and an apron.
    const skirt = part(peak, std(top), 0, -0.2, 0, 0.3, 0.55, 0.26)
    skirt.castShadow = true
    hips.add(skirt)
    hips.add(part(block, std(0xf1ece0), 0, -0.15, 0.17, 0.26, 0.4, 0.02))
  } else {
    hips.add(part(block, std(lower), 0, -0.04, 0, 0.3, 0.16, 0.2))
  }
  const torso = part(block, std(top), 0, 0.3, 0, rose ? 0.32 : 0.38, 0.6, 0.22)
  torso.castShadow = true
  hips.add(torso)
  const head = new THREE.Group()
  head.position.y = 0.74
  hips.add(head)
  head.add(part(ball, std(skin), 0, 0.11, 0, 0.11, 0.13, 0.11))
  if (rose) {
    // Grey hair and a bun.
    head.add(part(ball, std(0xc9c6c0), 0, 0.15, -0.02, 0.115, 0.11, 0.115))
    head.add(part(ball, std(0xc9c6c0), 0, 0.2, -0.1, 0.06, 0.06, 0.06))
  } else {
    // A flat cap.
    head.add(part(ball, std(0x6b5a44), 0, 0.19, 0, 0.12, 0.05, 0.12))
    head.add(part(block, std(0x6b5a44), 0, 0.18, 0.1, 0.16, 0.02, 0.1))
  }
  const armL = limb(top, 0.6, 0.06, -0.21, 0.56)
  const armR = limb(top, 0.6, 0.06, 0.21, 0.56)
  for (const a of [armL, armR]) a.add(part(ball, std(skin), 0, -0.62, 0, 0.05, 0.05, 0.05))
  hips.add(armL, armR)

  // Things to carry, held in the right hand (or both, for the basket).
  const hand = (o: THREE.Object3D) => {
    o.position.y = -0.62
    o.visible = false
    armR.add(o)
    return o
  }
  const wicker = std(0xb08850)
  const basket = new THREE.Group()
  basket.add(part(block, wicker, 0, -0.1, 0.12, 0.42, 0.2, 0.3))
  basket.add(part(block, std(0xf6f2ea), 0, 0.01, 0.12, 0.38, 0.05, 0.26))
  const harvest = new THREE.Group()
  harvest.add(part(block, wicker, 0, -0.08, 0.06, 0.3, 0.14, 0.22))
  const produce = std(0xd8432f, 0.5)
  for (let i = 0; i < 4; i++) harvest.add(part(ball, produce, -0.08 + i * 0.055, 0.0, 0.06 + (i % 2) * 0.05, 0.045, 0.045, 0.045))
  const umbrella = new THREE.Group()
  umbrella.add(part(rod, std(0x333333), 0, 0.5, 0, 0.012, 1.1, 0.012))
  const canopy = part(peak, std(rose ? 0xb6403a : 0x2c3e66, 0.6), 0, 1.15, 0, 0.62, 0.28, 0.62)
  canopy.castShadow = true
  umbrella.add(canopy)
  const lantern = new THREE.Group()
  lantern.add(part(block, std(0x2a2a2a), 0, -0.05, 0, 0.12, 0.02, 0.12))
  const flame = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 3 })
  lantern.add(part(block, flame, 0, -0.13, 0, 0.1, 0.14, 0.1))
  const shovel = new THREE.Group()
  shovel.add(part(rod, std(0x7a5a3a), 0, 0, 0.3, 0.02, 1.1, 0.02))
  shovel.children[0].rotation.x = 1.1
  shovel.add(part(block, std(0x8a9096, 0.4), 0, -0.25, 0.8, 0.25, 0.02, 0.3))
  const cup = part(rod, std(0xf4f1e6, 0.3), 0, -0.02, 0.04, 0.04, 0.07, 0.04)
  const flowers = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    flowers.add(part(rod, std(0x4f8a3c), (i - 2) * 0.02, 0.15, 0.04, 0.006, 0.35, 0.006))
    flowers.add(part(ball, std([0x9b7fd0, 0xf2c230, 0xf4f1e6][i % 3]), (i - 2) * 0.03, 0.33, 0.04, 0.035, 0.035, 0.035))
  }
  const carrots = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const c = part(peak, std(0xe07020), (i - 1) * 0.03, -0.05, 0.05, 0.025, 0.16, 0.025)
    c.rotation.x = Math.PI
    carrots.add(c)
  }
  const seed = part(rod, std(0x9a8a6a), 0, -0.05, 0.05, 0.06, 0.12, 0.06)
  const props: Figure['props'] = {
    basket: hand(basket),
    harvest: hand(harvest),
    umbrellaUp: hand(umbrella),
    lantern: hand(lantern),
    shovel: hand(shovel),
    cup: hand(cup),
    flowers: hand(flowers),
    carrots: hand(carrots),
    seed: hand(seed),
  }
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
  bubble.scale.setScalar(0.7)
  bubble.position.y = 2.45
  bubble.visible = false
  root.add(bubble)
  let light: THREE.PointLight | null = null
  if (rose) {
    // Always present (switching lights on and off would recompile every shader); dark unless lit.
    light = new THREE.PointLight(0xffb060, 0, 7, 1.6)
    light.position.set(0.25, 0.4, 0.2)
    root.add(light)
  }
  root.visible = false
  scene.add(root)
  return { root, hips, head, legL, legR, armL, armR, props, produce, bubble, light, phase: rose ? 0 : 1.7 }
}

/** A thought bubble: a small picture, never words. */
function emoteTexture(e: Emote) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(255, 252, 240, 0.94)'
  g.strokeStyle = 'rgba(60, 70, 50, 0.3)'
  g.lineWidth = 4
  g.beginPath()
  g.arc(64, 58, 50, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.beginPath()
  g.arc(36, 114, 8, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.lineCap = 'round'
  g.lineWidth = 7
  switch (e) {
    case 'happy':
      g.fillStyle = '#e8b830'
      g.beginPath()
      g.arc(64, 58, 30, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#6a4a20'
      g.beginPath()
      g.arc(64, 60, 17, 0.2, Math.PI - 0.2)
      g.stroke()
      g.fillStyle = '#6a4a20'
      g.fillRect(50, 44, 7, 9)
      g.fillRect(71, 44, 7, 9)
      break
    case 'tea':
      g.fillStyle = '#f4f1e6'
      g.strokeStyle = '#7a6a5a'
      g.fillRect(40, 48, 40, 32)
      g.strokeRect(40, 48, 40, 32)
      g.beginPath()
      g.arc(84, 63, 10, -Math.PI / 2, Math.PI / 2)
      g.stroke()
      g.strokeStyle = '#a0a0a0'
      g.lineWidth = 4
      for (const x of [50, 62, 74]) {
        g.beginPath()
        g.moveTo(x, 40)
        g.quadraticCurveTo(x + 6, 32, x, 24)
        g.stroke()
      }
      break
    case 'surprised':
      g.fillStyle = '#c0392b'
      g.fillRect(57, 22, 14, 44)
      g.beginPath()
      g.arc(64, 82, 8, 0, Math.PI * 2)
      g.fill()
      break
    case 'cold':
      g.strokeStyle = '#5a8ec8'
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3
        g.beginPath()
        g.moveTo(64 - Math.cos(a) * 30, 58 - Math.sin(a) * 30)
        g.lineTo(64 + Math.cos(a) * 30, 58 + Math.sin(a) * 30)
        g.stroke()
      }
      break
    case 'note':
      g.fillStyle = '#3a4a6a'
      g.strokeStyle = '#3a4a6a'
      g.beginPath()
      g.ellipse(52, 78, 12, 9, -0.4, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.moveTo(62, 76)
      g.lineTo(62, 30)
      g.lineTo(84, 38)
      g.stroke()
      break
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class PeopleView {
  private rose: Figure
  private walter: Figure
  private cloth: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; dry: THREE.Color }[] = []
  private snowman: THREE.Group
  private stems: THREE.Mesh[] = []
  private doorBasket: THREE.Group
  private crate: THREE.Mesh[] = []
  private emotes = new Map<Emote, THREE.Texture>()
  private wet = new THREE.Color(0x000000)

  constructor(
    scene: THREE.Scene,
    private tracks: Tracks,
  ) {
    this.rose = figure(true, scene)
    this.walter = figure(false, scene)
    for (const e of ['happy', 'tea', 'surprised', 'cold', 'note'] as Emote[]) this.emotes.set(e, emoteTexture(e))

    // The washing line: two posts, a line, and what hangs on it.
    const W = T.wash
    const wood = std(0x8a6a4a)
    for (const x of [W.x0, W.x1]) {
      const post = part(rod, wood, x, (W.height + 0.1) / 2, W.z, 0.05, W.height + 0.1, 0.05)
      post.castShadow = true
      scene.add(post)
      scene.add(part(block, wood, x, W.height, W.z, 0.04, 0.04, 0.4))
    }
    scene.add(part(block, std(0xe8e4dc), (W.x0 + W.x1) / 2, W.height - 0.01, W.z, W.x1 - W.x0, 0.012, 0.012))
    const colours = [0xf4f1ea, 0x8fb4d8, 0xe8d0a0, 0xd88a8a, 0xf4f1ea, 0xa0c890]
    for (let i = 0; i < W.items; i++) {
      const s = washSpot(i)
      const sheet = i % 2 === 0
      const w = sheet ? 0.85 : 0.5
      const hgt = sheet ? 0.85 : 0.55
      const geo = new THREE.PlaneGeometry(w, hgt, 6, 6)
      geo.translate(0, -hgt / 2, 0)
      const dry = new THREE.Color(colours[i % colours.length])
      const mat = new THREE.MeshStandardMaterial({ color: dry.clone(), roughness: 0.95, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(s.x, W.height, s.z)
      mesh.castShadow = true
      mesh.visible = false
      scene.add(mesh)
      this.cloth.push({ mesh, mat, dry })
    }

    // The snowman Walter builds.
    const snow = std(0xf4f6fa, 0.9)
    const sm = new THREE.Group()
    sm.add(part(ball, snow, 0, 0.4, 0, 0.42, 0.4, 0.42))
    sm.add(part(ball, snow, 0, 0.98, 0, 0.3, 0.28, 0.3))
    sm.add(part(ball, snow, 0, 1.42, 0, 0.2, 0.19, 0.2))
    sm.add(part(cone, std(0xe07020), 0, 1.43, 0.27, 0.035, 0.035, 0.18))
    for (const x of [-0.07, 0.07]) sm.add(part(ball, std(0x111111), x, 1.5, 0.17, 0.025, 0.025, 0.025))
    for (const x of [-1, 1]) {
      const arm = part(rod, std(0x5c4330), x * 0.45, 1.05, 0, 0.012, 0.5, 0.012)
      arm.rotation.z = x * 1.0
      sm.add(arm)
    }
    sm.add(part(block, std(0xb6403a), 0, 1.22, 0, 0.42, 0.06, 0.42))
    for (const m of sm.children) m.castShadow = true
    sm.visible = false
    scene.add(sm)
    this.snowman = sm

    // The vase in the front window, filled one stem at a time.
    const sill = HOUSE.front + 0.13
    const vx = HOUSE.x - 1.4
    scene.add(part(rod, new THREE.MeshStandardMaterial({ color: 0x9fc4c8, roughness: 0.1, transparent: true, opacity: 0.85 }), vx, 1.37, sill, 0.07, 0.2, 0.07))
    for (let i = 0; i < T.people.vase; i++) {
      const a = (i / T.people.vase) * Math.PI - Math.PI / 2
      const stem = new THREE.Group()
      stem.add(part(rod, std(0x4f8a3c), 0, 0.15, 0, 0.008, 0.3, 0.008))
      const head = part(ball, std(0xffffff), 0, 0.31, 0, 0.05, 0.045, 0.05)
      stem.add(head)
      stem.position.set(vx, 1.42, sill)
      stem.rotation.z = Math.sin(a) * 0.45
      stem.rotation.x = 0.15
      stem.visible = false
      scene.add(stem)
      this.stems.push(head)
    }

    // The washing basket left by the door on a grey morning.
    const basket = new THREE.Group()
    basket.add(part(block, std(0xb08850), 0, 0.12, 0, 0.5, 0.24, 0.36))
    basket.add(part(block, std(0xf6f2ea), 0, 0.25, 0, 0.44, 0.05, 0.3))
    basket.position.set(T.people.door.x + 0.9, 0, T.people.door.z + 0.3)
    basket.visible = false
    scene.add(basket)
    this.doorBasket = basket

    // A crate by the door that fills with what Walter brings in.
    const crate = part(block, std(0x9a7a50), T.people.door.x - 1.0, 0.15, T.people.door.z + 0.35, 0.6, 0.3, 0.4)
    crate.castShadow = true
    scene.add(crate)
    for (let i = 0; i < 12; i++) {
      const m = part(ball, std(0xd8432f, 0.5), crate.position.x - 0.22 + (i % 4) * 0.15, 0.32 + Math.floor(i / 8) * 0.06, crate.position.z - 0.1 + (Math.floor(i / 4) % 2) * 0.18, 0.07, 0.07, 0.07)
      m.visible = false
      scene.add(m)
      this.crate.push(m)
    }
  }

  /** How strongly the front windows should glow: someone is in watching the weather. */
  watching(garden: Garden) {
    return garden.people.all.some((p) => p.atWindow) ? 1 : 0
  }

  update(garden: Garden, dt: number) {
    const pp = garden.people
    const t = garden.time
    this.pose(this.rose, pp.rose, garden, t, dt)
    this.pose(this.walter, pp.walter, garden, t, dt)

    // The washing.
    pp.wash.items.forEach((it, i) => {
      const c = this.cloth[i]
      c.mesh.visible = it.out
      if (!it.out) return
      const s = washSpot(i)
      const breeze = garden.breezeAt(s.x, s.z) + (garden.storming ? 1 : 0.15)
      // Wet washing hangs heavy; dry washing in a breeze flaps.
      const lift = Math.min(1, breeze) * (1 - it.wet * 0.7)
      c.mesh.rotation.x = -lift * 0.9 - Math.sin(t * (3 + i) + i) * (0.05 + lift * 0.25)
      c.mesh.rotation.y = Math.sin(t * 1.3 + i * 2) * 0.1 * lift
      c.mat.color.copy(c.dry).lerp(this.wet, it.wet * 0.35)
      c.mat.roughness = 0.95 - it.wet * 0.5
    })
    this.doorBasket.visible = pp.wash.basketAtDoor

    // The snowman.
    const sz = pp.snowman.size
    this.snowman.visible = sz > 0.02
    this.snowman.position.set(pp.snowman.x, 0, pp.snowman.z)
    this.snowman.scale.setScalar(0.25 + 0.75 * Math.min(1, sz))
    const parts = this.snowman.children
    // Built from the bottom up: base, then body, then the head and the trimmings.
    parts[1].visible = sz > 0.4
    for (let i = 2; i < parts.length; i++) parts[i].visible = sz > 0.75

    // The vase.
    const vase = pp.vase.slice(-T.people.vase)
    this.stems.forEach((head, i) => {
      const k = vase[i]
      head.parent!.visible = !!k
      if (k) (head.material as THREE.MeshStandardMaterial).color.setHex(BLOOM[k] ?? 0xffffff)
    })

    // The crate.
    const total = Object.values(pp.pantry).reduce((a, b) => a + b, 0)
    const kinds = Object.keys(pp.pantry).filter((k) => pp.pantry[k] > 0)
    this.crate.forEach((m, i) => {
      m.visible = i < total
      if (m.visible && kinds.length) (m.material as THREE.MeshStandardMaterial).color.setHex(BLOOM[kinds[i % kinds.length]])
    })
  }

  private pose(f: Figure, p: Person, garden: Garden, t: number, dt: number) {
    f.root.visible = !p.inside
    if (p.inside) {
      if (f.light) f.light.intensity = 0
      return
    }
    f.root.position.set(p.x, 0, p.z)
    // Turn smoothly rather than snapping.
    // At tea they turn to face each other across the table.
    const S = T.people.seats
    let heading = p.doing === 'tea' && !p.moving ? (p.x < (S[0].x + S[1].x) / 2 ? Math.PI / 2 : -Math.PI / 2) : p.heading
    // At the line they face it.
    if ((p.doing === 'peg' || p.doing === 'unpeg') && !p.moving) heading = p.z > T.wash.z ? Math.PI : 0
    let d = heading - f.root.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    f.root.rotation.y += d * Math.min(1, dt * 8)

    // Reset to standing.
    f.hips.position.y = 0.85
    f.hips.rotation.set(0, 0, 0)
    f.head.rotation.set(0, 0, 0)
    f.legL.rotation.set(0, 0, 0)
    f.legR.rotation.set(0, 0, 0)
    f.armL.rotation.set(0, 0, 0.08)
    f.armR.rotation.set(0, 0, -0.08)
    f.legL.position.y = f.legR.position.y = 0.85

    const ph = t + f.phase
    if (p.moving) {
      const run = p.moving === 'run'
      const rate = run ? 11 : 6.5
      const swing = Math.sin(ph * rate) * (run ? 0.75 : 0.4)
      f.legL.rotation.x = swing
      f.legR.rotation.x = -swing
      f.armL.rotation.x = -swing * 0.8
      f.armR.rotation.x = swing * 0.8
      f.hips.position.y = 0.85 + Math.abs(Math.cos(ph * rate)) * (run ? 0.05 : 0.02)
      if (run) f.hips.rotation.x = 0.18
      if (p.doing === 'shovel' || p.carry === 'shovel') {
        f.hips.rotation.x = 0.4
        f.armL.rotation.x = f.armR.rotation.x = -0.8 + Math.sin(ph * 4) * 0.25
      }
      this.tracks.walk(garden, p, p.x, p.z, 0.05, 0.4)
    } else {
      switch (p.doing) {
        case 'tea': {
          // Sitting, cup up to the lips now and then.
          f.hips.position.y = 0.48
          f.legL.position.y = f.legR.position.y = 0.48
          f.legL.rotation.x = f.legR.rotation.x = -1.45
          const sip = Math.sin(ph * 0.5) > 0.6
          f.armR.rotation.x = sip ? -2.3 : -0.9
          f.armL.rotation.x = -0.5
          break
        }
        case 'pick':
        case 'cut':
        case 'tend':
        case 'carrots': {
          f.hips.rotation.x = 0.75
          f.head.rotation.x = 0.2
          const reach = Math.sin(ph * 3)
          f.armR.rotation.x = -0.9 + reach * 0.35
          f.armL.rotation.x = -0.7 - reach * 0.2
          break
        }
        case 'peg':
        case 'unpeg':
          f.armL.rotation.x = f.armR.rotation.x = -2.7 + Math.sin(ph * 4) * 0.12
          f.head.rotation.x = -0.35
          break
        case 'feeder':
          f.armR.rotation.x = -2.2
          f.armL.rotation.x = -2.0
          f.head.rotation.x = -0.4
          break
        case 'snowman': {
          f.hips.rotation.x = 0.85
          const push = Math.sin(ph * 2.5)
          f.armL.rotation.x = f.armR.rotation.x = -1.2 + push * 0.3
          f.legL.rotation.x = -0.3 + push * 0.15
          break
        }
        case 'shovel':
          f.hips.rotation.x = 0.45
          f.armL.rotation.x = f.armR.rotation.x = -0.8 + Math.sin(ph * 4) * 0.3
          break
        case 'rain-smile':
          f.head.rotation.x = -0.7
          f.armL.rotation.z = 0.7
          f.armR.rotation.z = -0.7
          break
        case 'check-sky':
          f.head.rotation.x = -0.55 + Math.sin(ph * 0.7) * 0.1
          f.head.rotation.y = Math.sin(ph * 0.5) * 0.5
          f.armR.rotation.x = -2.5
          f.armR.rotation.z = 0.5
          break
        case 'porch':
          f.head.rotation.x = -0.3 + Math.sin(ph * 0.3) * 0.15
          f.armL.rotation.x = f.armR.rotation.x = -0.3
          f.armL.rotation.z = 0.35
          f.armR.rotation.z = -0.35
          break
      }
    }

    // What they carry. Two hands on the basket.
    const carry = p.carry
    const show = (k: keyof Figure['props'], on: boolean) => {
      const o = f.props[k]
      if (o) o.visible = on
    }
    const pegging = p.doing === 'peg' || p.doing === 'unpeg'
    show('basket', carry === 'basket' && !(pegging && !p.moving))
    show('harvest', carry === 'basket' && !!p.produce && p.doing !== 'peg' && p.doing !== 'unpeg')
    if (carry === 'basket' && p.produce) show('basket', false)
    show('lantern', carry === 'lantern')
    show('shovel', carry === 'shovel' || (p.doing === 'shovel' && !carry))
    show('cup', carry === 'cup')
    show('flowers', carry === 'flowers')
    show('carrots', carry === 'carrots')
    show('seed', carry === 'seed')
    show('umbrellaUp', p.umbrella)
    if (p.produce) f.produce.color.setHex(BLOOM[p.produce] ?? 0xd8432f)
    if (carry === 'basket' && !p.moving && p.doing !== 'peg' && p.doing !== 'unpeg') f.armL.rotation.x = f.armR.rotation.x = -0.5
    if (p.umbrella) {
      // Held up over the head.
      f.armR.rotation.x = -0.6
      f.armR.rotation.z = 0.25
    }
    if (carry === 'lantern' && p.moving) f.armR.rotation.x = -0.6

    if (f.light) {
      const want = carry === 'lantern' ? 2.2 + Math.sin(t * 13) * 0.15 : 0
      f.light.intensity += (want - f.light.intensity) * Math.min(1, dt * 4)
    }

    f.bubble.visible = !!p.emote
    if (p.emote) {
      const m = f.bubble.material as THREE.SpriteMaterial
      const tex = this.emotes.get(p.emote)!
      if (m.map !== tex) {
        m.map = tex
        m.needsUpdate = true
      }
      f.bubble.position.y = 2.35 + Math.sin(t * 2) * 0.04
    }
  }
}
