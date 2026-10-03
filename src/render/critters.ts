/**
 * The garden's animals and their homes, built from simple shapes. What
 * matters at this distance is the silhouette and what the animal is doing,
 * not detail.
 */
import * as THREE from 'three'
import { T } from '../tuning'
import { foliage } from './world'
import { shaded } from './shade'

export type Made = { root: THREE.Group; parts: Record<string, THREE.Object3D> }

export const std = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough })

export function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  return m
}

export const ball = new THREE.SphereGeometry(1, 12, 9)
export const cone = new THREE.ConeGeometry(1, 1, 8)
cone.rotateX(Math.PI / 2)
export const block = new THREE.BoxGeometry(1, 1, 1)
export const leg = new THREE.CylinderGeometry(1, 0.8, 1, 6)
leg.translate(0, -0.5, 0)

/** A songbird facing +z: a robin, a blackbird or a sparrow. */
export function songbird(i: number) {
  const g = new THREE.Group()
  const kinds = [
    { body: 0x6b4a32, breast: 0xc8582a }, // robin
    { body: 0x1c1a18, breast: 0x1c1a18 }, // blackbird
    { body: 0x7d6347, breast: 0xbfae94 }, // sparrow
  ]
  const k = kinds[i % 3]
  const body = std(k.body)
  const s = 0.06
  g.add(part(ball, body, 0, s * 1.2, 0, s * 0.9, s * 0.85, s * 1.3))
  g.add(part(ball, std(k.breast), 0, s * 1.05, s * 0.55, s * 0.7, s * 0.7, s * 0.6))
  const head = new THREE.Group()
  head.position.set(0, s * 2, s * 0.9)
  head.add(part(ball, body, 0, 0, 0, s * 0.6, s * 0.6, s * 0.6))
  head.add(part(cone, std(i % 3 === 1 ? 0xe0a020 : 0x3a2c20), 0, 0, s * 0.75, s * 0.18, s * 0.18, s * 0.5))
  g.add(head)
  g.add(part(block, body, 0, s * 1.3, -s * 1.5, s * 0.6, s * 0.12, s * 1.1))
  const wingL = part(block, body, s * 0.85, s * 1.4, 0, s * 1.6, s * 0.08, s * 1.0)
  const wingR = part(block, body, -s * 0.85, s * 1.4, 0, s * 1.6, s * 0.08, s * 1.0)
  g.add(wingL, wingR)
  return { root: g, parts: { head, wingL, wingR } }
}

export function rabbit() {
  const g = new THREE.Group()
  const fur = std(0x8b7660)
  g.add(part(ball, fur, 0, 0.13, 0, 0.11, 0.1, 0.16))
  const head = new THREE.Group()
  head.position.set(0, 0.21, 0.13)
  head.add(part(ball, fur, 0, 0, 0, 0.07, 0.065, 0.08))
  const earL = part(ball, fur, 0.03, 0.09, -0.02, 0.018, 0.075, 0.03)
  const earR = part(ball, fur, -0.03, 0.09, -0.02, 0.018, 0.075, 0.03)
  head.add(earL, earR)
  head.add(part(ball, std(0x1a1410), 0.045, 0.015, 0.045, 0.012, 0.012, 0.012))
  head.add(part(ball, std(0x1a1410), -0.045, 0.015, 0.045, 0.012, 0.012, 0.012))
  g.add(head)
  g.add(part(ball, std(0xf2eee6), 0, 0.15, -0.16, 0.04, 0.04, 0.04))
  return { root: g, parts: { head, earL, earR } }
}

export function frog() {
  const g = new THREE.Group()
  const skin = std(0x4f7a2c, 0.5)
  g.add(part(ball, skin, 0, 0.04, 0, 0.06, 0.04, 0.075))
  g.add(part(ball, skin, 0.03, 0.075, 0.04, 0.018, 0.018, 0.018))
  g.add(part(ball, skin, -0.03, 0.075, 0.04, 0.018, 0.018, 0.018))
  g.add(part(ball, std(0x101008), 0.034, 0.082, 0.05, 0.008, 0.008, 0.008))
  g.add(part(ball, std(0x101008), -0.034, 0.082, 0.05, 0.008, 0.008, 0.008))
  const throat = part(ball, std(0xd8d0a0, 0.5), 0, 0.03, 0.05, 0.035, 0.025, 0.03)
  g.add(throat)
  g.add(part(ball, skin, 0.06, 0.02, -0.04, 0.03, 0.015, 0.05))
  g.add(part(ball, skin, -0.06, 0.02, -0.04, 0.03, 0.015, 0.05))
  return { root: g, parts: { throat } }
}

export function duck(drake: boolean) {
  const g = new THREE.Group()
  const body = std(drake ? 0xb8b0a4 : 0x7a5a3c)
  g.add(part(ball, body, 0, 0.07, 0, 0.11, 0.08, 0.18))
  g.add(part(block, std(drake ? 0x2a2018 : 0x5e4430), 0, 0.12, -0.14, 0.08, 0.03, 0.08))
  const head = new THREE.Group()
  head.position.set(0, 0.2, 0.13)
  head.add(part(ball, std(drake ? 0x1e5a32 : 0x6b4c32, 0.4), 0, 0, 0, 0.055, 0.055, 0.065))
  head.add(part(block, std(drake ? 0xe0b030 : 0xc07a30), 0, -0.01, 0.075, 0.035, 0.015, 0.06))
  g.add(head)
  if (drake) g.add(part(ball, std(0xffffff), 0, 0.15, 0.12, 0.05, 0.012, 0.05))
  return { root: g, parts: { head } }
}

export function deer() {
  const g = new THREE.Group()
  const coat = std(0x8a5e3a)
  g.add(part(ball, coat, 0, 0.95, 0, 0.22, 0.24, 0.5))
  const neck = new THREE.Group()
  neck.position.set(0, 1.1, 0.4)
  neck.add(part(block, coat, 0, 0.18, 0.06, 0.12, 0.42, 0.14))
  const head = new THREE.Group()
  head.position.set(0, 0.42, 0.12)
  head.add(part(ball, coat, 0, 0, 0.06, 0.08, 0.08, 0.15))
  head.add(part(ball, coat, 0.08, 0.08, -0.02, 0.025, 0.07, 0.04))
  head.add(part(ball, coat, -0.08, 0.08, -0.02, 0.025, 0.07, 0.04))
  head.add(part(ball, std(0x1a1410), 0, -0.01, 0.2, 0.025, 0.02, 0.02))
  const antlers = new THREE.Group()
  const bone = std(0xd8c8a8)
  for (const side of [1, -1]) {
    antlers.add(part(leg, bone, side * 0.05, 0.3, 0, 0.012, 0.22, 0.012))
    const tine = part(leg, bone, side * 0.1, 0.24, 0.05, 0.01, 0.12, 0.01)
    tine.rotation.z = side * 0.6
    antlers.add(tine)
  }
  antlers.rotation.x = Math.PI
  antlers.position.y = 0.02
  antlers.visible = false
  head.add(antlers)
  neck.add(head)
  neck.rotation.x = -0.15
  g.add(neck)
  g.add(part(ball, std(0xf2eee6), 0, 1.0, -0.5, 0.06, 0.08, 0.04))
  const legs: THREE.Object3D[] = []
  for (const [x, z] of [
    [0.12, 0.35],
    [-0.12, 0.35],
    [0.12, -0.35],
    [-0.12, -0.35],
  ]) {
    const l = part(leg, std(0x6e4a2e), x, 0.82, z, 0.035, 0.82, 0.035)
    legs.push(l)
    g.add(l)
  }
  return { root: g, parts: { neck, antlers, l0: legs[0], l1: legs[1], l2: legs[2], l3: legs[3] } }
}

export function goose() {
  const g = new THREE.Group()
  const grey = std(0x8a8478)
  g.add(part(ball, grey, 0, 0, 0, 0.18, 0.15, 0.4))
  g.add(part(block, std(0x1c1a18), 0, 0.06, 0.48, 0.07, 0.07, 0.36))
  g.add(part(ball, std(0x1c1a18), 0, 0.08, 0.7, 0.07, 0.07, 0.1))
  const wingL = new THREE.Group()
  wingL.add(part(block, grey, 0.45, 0, 0, 0.9, 0.03, 0.3))
  const wingR = new THREE.Group()
  wingR.add(part(block, grey, -0.45, 0, 0, 0.9, 0.03, 0.3))
  g.add(wingL, wingR)
  return { root: g, parts: { wingL, wingR } }
}


export function hedgehog(): Made {
  const g = new THREE.Group()
  const spines = std(0x5a4632, 1)
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), spines)
  body.scale.set(0.11, 0.08, 0.15)
  body.position.y = 0.08
  body.castShadow = true
  g.add(body)
  const face = std(0xb39674)
  const snout = new THREE.Group()
  snout.position.set(0, 0.06, 0.13)
  snout.add(part(cone, face, 0, 0, 0.03, 0.045, 0.04, 0.09))
  snout.add(part(ball, std(0x101008), 0, 0, 0.08, 0.012, 0.012, 0.012))
  g.add(snout)
  return { root: g, parts: { snout } }
}

export function squirrel(): Made {
  const g = new THREE.Group()
  const fur = std(0x9a4e22)
  g.add(part(ball, fur, 0, 0.09, 0, 0.06, 0.07, 0.09))
  const head = new THREE.Group()
  head.position.set(0, 0.15, 0.08)
  head.add(part(ball, fur, 0, 0, 0, 0.045, 0.045, 0.05))
  head.add(part(cone, fur, 0.025, 0.045, -0.01, 0.012, 0.012, 0.03))
  head.add(part(cone, fur, -0.025, 0.045, -0.01, 0.012, 0.012, 0.03))
  g.add(head)
  const tail = part(ball, fur, 0, 0.17, -0.1, 0.05, 0.13, 0.05)
  tail.rotation.x = -0.35
  g.add(tail)
  return { root: g, parts: { head, tail } }
}

export function bee(): THREE.Object3D {
  const g = new THREE.Group()
  g.add(part(ball, std(0xe6b422), 0, 0, 0, 0.045, 0.04, 0.06))
  g.add(part(ball, std(0x2a2018), 0, 0, -0.01, 0.047, 0.042, 0.02))
  const wing = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
  g.add(part(ball, wing, 0, 0.04, 0, 0.06, 0.008, 0.03))
  return g
}

/** The homes and their lasting signs. */
export function burrow() {
  const g = new THREE.Group()
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), shaded(std(0x6b4f35, 1)))
  mound.scale.set(0.7, 0.22, 0.55)
  mound.receiveShadow = true
  g.add(mound)
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0x120c08 }))
  hole.position.set(-0.45, 0.1, 0)
  hole.rotation.y = -Math.PI / 2
  hole.rotation.x = -0.3
  g.add(hole)
  return g
}

export function nest() {
  const g = new THREE.Group()
  const bowl = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.07, 6, 14), std(0x6e5434, 1))
  bowl.rotation.x = Math.PI / 2
  bowl.castShadow = true
  g.add(bowl)
  g.add(part(ball, std(0x5a4428, 1), 0, -0.04, 0, 0.16, 0.05, 0.16))
  const eggs = new THREE.Group()
  for (let i = 0; i < 3; i++) eggs.add(part(ball, std(0x9fd0d8, 0.4), Math.cos(i * 2.1) * 0.06, 0.02, Math.sin(i * 2.1) * 0.06, 0.03, 0.025, 0.035))
  const chicks: THREE.Object3D[] = []
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Group()
    c.position.set(Math.cos(i * 2.1) * 0.06, 0.03, Math.sin(i * 2.1) * 0.06)
    c.add(part(ball, std(0x8a8072, 1), 0, 0, 0, 0.045, 0.05, 0.045))
    c.add(part(cone, std(0xf0c040), 0, 0.05, 0.03, 0.018, 0.018, 0.04))
    chicks.push(c)
    g.add(c)
  }
  g.add(eggs)
  return { root: g, eggs, chicks }
}

export function hive() {
  const g = new THREE.Group()
  const wood = std(0xd8c49a, 0.9)
  for (let i = 0; i < 3; i++) g.add(part(block, wood, 0, 0.45 + i * 0.22, 0, 0.5, 0.2, 0.42))
  g.add(part(block, std(0x7a6a58), 0, 1.16, 0, 0.62, 0.08, 0.54))
  for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) g.add(part(block, std(0x5a4a38), x, 0.18, z, 0.05, 0.36, 0.05))
  g.add(part(block, std(0x1a1410), 0, 0.38, 0.22, 0.16, 0.03, 0.02))
  g.traverse((o) => (o.castShadow = true))
  return g
}

/** A slatted compost bin and the leaf pile beside it where the hedgehog lives. */
export function leafPile() {
  const g = new THREE.Group()
  const slat = std(0x7a5a3a)
  for (let i = 0; i < 4; i++) {
    g.add(part(block, slat, 0.6, 0.12 + i * 0.18, 0, 0.9, 0.1, 0.04).translateZ(0.45))
    g.add(part(block, slat, 0.6, 0.12 + i * 0.18, 0, 0.9, 0.1, 0.04).translateZ(-0.45))
    g.add(part(block, slat, 1.05, 0.12 + i * 0.18, 0, 0.04, 0.1, 0.9))
  }
  const pile = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shaded(std(0x8a5a2a, 1), 'foliage'))
  pile.scale.set(0.75, 0.32, 0.6)
  pile.position.set(-0.4, 0.12, 0)
  pile.castShadow = pile.receiveShadow = true
  g.add(pile)
  return g
}

export function feeder() {
  const g = new THREE.Group()
  const wood = std(0x6e5434)
  g.add(part(leg, wood, 0, 1.5, 0, 0.035, 1.5, 0.035))
  g.add(part(block, wood, 0, 1.5, 0, 0.5, 0.04, 0.5))
  const roof = part(cone, std(0x5a3e2a), 0, 1.85, 0, 0.42, 0.42, 0.25)
  roof.rotation.x = -Math.PI / 2
  roof.rotation.z = Math.PI / 4
  g.add(roof)
  for (const [x, z] of [[-0.2, -0.2], [0.2, 0.2]]) g.add(part(leg, wood, x, 1.82, z, 0.015, 0.3, 0.015))
  const seed = part(ball, std(0xc8a868, 1), 0, 1.53, 0, 0.17, 0.03, 0.17)
  g.add(seed)
  g.traverse((o) => (o.castShadow = true))
  return { root: g, seed }
}

/** Grass the deer have flattened where they lie. */
export function deerBed() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshStandardMaterial({ color: 0x8a8050, roughness: 1, transparent: true, opacity: 0.85 }))
  m.rotation.x = -Math.PI / 2
  m.scale.set(1.6, 1.0, 1)
  m.receiveShadow = true
  return m
}

/** A squirrel's drey: a ball of twigs and leaves. */
export function drey() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), std(0x5e4630, 1))
  m.scale.set(1, 0.8, 1)
  m.castShadow = true
  return m
}

const saplingLeaves = foliage(9)
export function sapling() {
  const g = new THREE.Group()
  const trunk = part(leg, std(0x5c4330), 0, 1, 0, 0.05, 1, 0.05)
  g.add(trunk)
  const crown = new THREE.Mesh(saplingLeaves, shaded(new THREE.MeshStandardMaterial({ color: 0x5b8a3a, vertexColors: true, roughness: 0.85 }), 'foliage'))
  crown.position.y = 1.1
  crown.scale.setScalar(0.45)
  crown.castShadow = true
  g.add(crown)
  return g
}

void T
