/**
 * Four-view sheet of Rose and Walter, standing, for comparing with the
 * approved turnaround. Bundled and shot by tools/sheet.mjs.
 */
import * as THREE from 'three'
import { figure } from '../src/render/people'

const W = 1600
const H = 600
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(2)
renderer.setSize(W, H)
renderer.toneMapping = THREE.NeutralToneMapping
renderer.setScissorTest(true)
document.body.style.margin = '0'
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb8b8b4)
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.6))
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2)
sun.position.set(2, 4, 3)
scene.add(sun)
const rose = figure(true, scene)
const walter = figure(false, scene)
for (const f of [rose, walter]) {
  f.root.visible = true
  f.tool.visible = true
  f.armL.rotation.z = f.spread
  f.armR.rotation.z = -f.spread
  f.elbowL.rotation.x = f.elbowR.rotation.x = -0.35
}
rose.root.position.x = -0.6
walter.root.position.x = 0.6
const cam = new THREE.OrthographicCamera(-0.75, 0.75, 1.05, -0.05, 0.1, 20)
const views = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
views.forEach((a, i) => {
  for (const [f, x] of [[rose, -0.6], [walter, 0.6]] as const) {
    f.root.visible = true
    // each figure gets its own quarter: rotate the figures, keep the camera
    f.root.rotation.y = a
    f.root.position.x = 0
    const other = f === rose ? walter : rose
    other.root.visible = false
    const vx = (f === rose ? 0 : 4) * (W / 8) + i * (W / 8)
    cam.left = -0.36
    cam.right = 0.36
    cam.top = 1.08
    cam.bottom = -1.08
    cam.position.set(0, 1.02, 5)
    cam.lookAt(0, 1.02, 0)
    cam.updateProjectionMatrix()
    renderer.setViewport(vx, 0, W / 8, H)
    renderer.setScissor(vx, 0, W / 8, H)
    renderer.render(scene, cam)
    void x
  }
})
;(window as unknown as { done: boolean }).done = true
