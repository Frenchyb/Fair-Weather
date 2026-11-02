/**
 * Rose's and Walter's bodies, built offline from a real human base by
 * tools/people/fit.py and stored in people-mesh.ts, decoded into one geometry
 * per joint. Their clothes are painted on as vertex colours.
 */
import * as THREE from 'three'
import { roseData, roseParts, walterData, walterParts, type PartTable } from './people-mesh'
import { shaded } from './shade'

function bytes(b64: string) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out.buffer
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function decode(table: PartTable, data: string) {
  const buf = bytes(data)
  const parts = new Map<string, THREE.BufferGeometry>()
  for (const [name, e] of Object.entries(table)) {
    const p = new Int16Array(buf, e.p[0], e.p[1])
    const c = new Uint8Array(buf, e.c[0], e.c[1])
    const i = new Uint16Array(buf, e.i[0], e.i[1])
    const pos = new Float32Array(p.length)
    for (let k = 0; k < p.length; k++) pos[k] = p[k] / 8192
    const col = new Float32Array(c.length)
    for (let k = 0; k < c.length; k++) col[k] = toLinear(c[k] / 255)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(i), 1))
    g.computeVertexNormals()
    smoothNormals(g)
    parts.set(name, g)
  }
  return parts
}

/** Average the normals of vertices that share a place, so the cloth's seams and layers shade as one surface. */
function smoothNormals(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const sum = new Map<string, THREE.Vector3>()
  const key = (i: number) => `${Math.round(p.getX(i) * 200)},${Math.round(p.getY(i) * 200)},${Math.round(p.getZ(i) * 200)}`
  for (let i = 0; i < p.count; i++) {
    const k = key(i)
    const v = sum.get(k) ?? new THREE.Vector3()
    v.x += n.getX(i)
    v.y += n.getY(i)
    v.z += n.getZ(i)
    sum.set(k, v)
  }
  for (let i = 0; i < p.count; i++) {
    const v = sum.get(key(i))!.clone().normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
}

let cache: { rose: Map<string, THREE.BufferGeometry>; walter: Map<string, THREE.BufferGeometry> } | null = null

/** The body part meshes for one of them, keyed by joint (hips, head, legL, kneeL, armL, elbowL, handL and the R side). */
export function bodyParts(rose: boolean) {
  cache ??= { rose: decode(roseParts, roseData), walter: decode(walterParts, walterData) }
  const material = shaded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 'creature')
  const out = new Map<string, THREE.Mesh>()
  for (const [name, g] of cache[rose ? 'rose' : 'walter']) {
    const m = new THREE.Mesh(g, material)
    m.castShadow = true
    out.set(name, m)
  }
  return out
}
