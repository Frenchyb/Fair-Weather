/**
 * Little thought-bubbles a plant shows when it wants something: water, less
 * water, more sun, or some shade. Drawn on a canvas, so the page stays ASCII
 * and needs no image files.
 */
import * as THREE from 'three'
import type { Need } from '../sim/garden'

const SIZE = 128

function bubble(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(255, 252, 240, 0.92)'
  g.strokeStyle = 'rgba(60, 70, 50, 0.25)'
  g.lineWidth = 4
  g.beginPath()
  g.arc(64, 64, 56, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  draw(g)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function drop(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  g.fillStyle = fill
  g.beginPath()
  g.moveTo(x, y - 30 * s)
  g.bezierCurveTo(x + 6 * s, y - 14 * s, x + 20 * s, y - 2 * s, x + 20 * s, y + 10 * s)
  g.arc(x, y + 10 * s, 20 * s, 0, Math.PI)
  g.bezierCurveTo(x - 20 * s, y - 2 * s, x - 6 * s, y - 14 * s, x, y - 30 * s)
  g.fill()
}

function cloud(g: CanvasRenderingContext2D, fill: string) {
  g.fillStyle = fill
  g.beginPath()
  g.arc(48, 70, 18, 0, Math.PI * 2)
  g.arc(68, 58, 22, 0, Math.PI * 2)
  g.arc(86, 72, 15, 0, Math.PI * 2)
  g.fill()
  g.fillRect(48, 70, 38, 17)
}

export function needIcons(): Record<Need, THREE.Texture> {
  return {
    thirsty: bubble((g) => drop(g, 64, 62, 1.2, '#4a8fd6')),
    soggy: bubble((g) => {
      drop(g, 50, 60, 0.8, '#4a8fd6')
      drop(g, 78, 70, 0.8, '#4a8fd6')
      g.strokeStyle = '#c0533a'
      g.lineWidth = 9
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(32, 96)
      g.lineTo(96, 32)
      g.stroke()
    }),
    'wants-sun': bubble((g) => {
      g.fillStyle = '#f2b632'
      g.strokeStyle = '#f2b632'
      g.lineWidth = 7
      g.lineCap = 'round'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        g.beginPath()
        g.moveTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28)
        g.lineTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40)
        g.stroke()
      }
      g.beginPath()
      g.arc(64, 64, 19, 0, Math.PI * 2)
      g.fill()
    }),
    'wants-shade': bubble((g) => cloud(g, '#8a97a3')),
  }
}
