/**
 * Static batching: weld every mesh under a group that never moves or changes
 * on its own into one mesh per look, so the scenery costs a handful of draw
 * calls instead of hundreds. Each mesh's colour goes into vertex colours and
 * its texture placement into its UVs, so meshes that differ only in tint or
 * in which part of a photo they show still weld together.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Std = THREE.MeshStandardMaterial

/** Everything about a material that the weld cannot bake into the geometry. */
function signature(m: Std, mesh: THREE.Mesh) {
  const tex = (t: THREE.Texture | null) => (t ? t.source.uuid : '-')
  return [
    m.type,
    m.customProgramCacheKey?.() ?? '',
    m.side,
    m.transparent,
    m.opacity,
    m.roughness.toFixed(3),
    m.metalness.toFixed(3),
    m.emissive.getHexString(),
    m.emissiveIntensity,
    tex(m.map),
    tex(m.normalMap),
    m.normalScale.x.toFixed(2),
    tex(m.roughnessMap),
    m.fog,
    m.depthWrite,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.renderOrder,
  ].join('|')
}

/** The geometry ready to weld: in `root`'s space, coloured, with UVs already placed on its texture. */
function baked(mesh: THREE.Mesh, toRoot: THREE.Matrix4, tint = true) {
  const m = mesh.material as Std
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name)
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld))
  const n = g.attributes.position.count
  // Colour: the material's tint, times the vertex colours if it used them.
  const c = new Float32Array(n * 3)
  const own = m.vertexColors ? g.attributes.color : null
  const t = tint ? m.color : new THREE.Color(1, 1, 1)
  for (let i = 0; i < n; i++) {
    c[i * 3] = t.r * (own ? own.getX(i) : 1)
    c[i * 3 + 1] = t.g * (own ? own.getY(i) : 1)
    c[i * 3 + 2] = t.b * (own ? own.getZ(i) : 1)
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  // UVs: bake the texture's repeat and offset in, so every piece can share one texture.
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined
  const placed = m.map ?? m.normalMap ?? m.roughnessMap
  if (placed && uv) {
    placed.updateMatrix()
    const v = new THREE.Vector2()
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(uv, i).applyMatrix3(placed.matrix)
      uv.setXY(i, v.x, v.y)
    }
  }
  if (!uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g
}

/** A texture showing the whole photo once per UV unit, sharing the original's image. */
function plain(t: THREE.Texture | null) {
  if (!t) return null
  const c = t.clone()
  c.repeat.set(1, 1)
  c.offset.set(0, 0)
  c.rotation = 0
  return c
}

/**
 * Weld the plain standard meshes under `root` (except those `keep` names,
 * which go on changing at runtime) into one mesh per look. `root` itself and
 * anything kept stay where they are.
 */
export function weld(root: THREE.Object3D, keep: (m: THREE.Mesh) => boolean = () => false, shallow = false) {
  root.updateMatrixWorld(true)
  const toRoot = root.matrixWorld.clone().invert()
  const groups = new Map<string, THREE.Mesh[]>()
  const visit = (f: (o: THREE.Object3D) => void) => (shallow ? [...root.children].forEach(f) : root.traverse(f))
  visit((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || !mesh.visible || keep(mesh)) return
    const m = mesh.material as Std
    if (Array.isArray(m) || !m.isMeshStandardMaterial) return
    const key = signature(m, mesh)
    const list = groups.get(key) ?? []
    list.push(mesh)
    groups.set(key, list)
  })
  let before = 0
  let after = 0
  for (const list of groups.values()) {
    before += list.length
    if (list.length < 2) {
      after++
      continue
    }
    const first = list[0]
    const src = first.material as Std
    // All one material already: keep it, so whoever changes it at runtime still reaches the weld.
    const same = list.every((m) => m.material === src)
    const keepSrc = same && !src.map && !src.normalMap && !src.roughnessMap
    // A kept material still applies its own tint, so the vertex colours must not carry it as well.
    const geo = mergeGeometries(list.map((m) => baked(m, toRoot, !keepSrc)), false)
    const mat = keepSrc ? src : src.clone()
    // `clone` does not carry the shader patches; the program key keeps them apart.
    if (mat !== src) {
      mat.onBeforeCompile = src.onBeforeCompile
      mat.customProgramCacheKey = src.customProgramCacheKey
      mat.color.setRGB(1, 1, 1)
      mat.vertexColors = true
      mat.map = plain(src.map)
      mat.normalMap = plain(src.normalMap)
      mat.roughnessMap = plain(src.roughnessMap)
    } else if (!src.vertexColors) {
      // The baked colour is the material's own; with vertex colours off it is simply ignored.
      geo.deleteAttribute('color')
    }
    const merged = new THREE.Mesh(geo, mat)
    merged.castShadow = first.castShadow
    merged.receiveShadow = first.receiveShadow
    merged.renderOrder = first.renderOrder
    for (const m of list) m.removeFromParent()
    root.add(merged)
    after++
  }
  // Groups left with nothing in them can go too.
  const empty: THREE.Object3D[] = []
  if (!shallow) root.traverse((o) => o !== root && o.type === 'Group' && o.children.length === 0 && empty.push(o))
  for (const o of empty) o.removeFromParent()
  return { before, after }
}

/**
 * For something that moves in parts (an animal, a person): weld the meshes
 * that ride on each moving part together, leaving every part, and anything
 * named in `keep`, free to move.
 */
export function weldParts(root: THREE.Object3D, keep: Iterable<THREE.Object3D> = []) {
  const kept = new Set(keep)
  const joints: THREE.Object3D[] = []
  root.traverse((o) => !(o as THREE.Mesh).isMesh && joints.push(o))
  for (const j of joints) weld(j, (m) => kept.has(m), true)
}
