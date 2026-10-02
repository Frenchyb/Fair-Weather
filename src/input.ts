import { T } from './tuning'

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

/**
 * Where the pointer is, whether the player wants rain or a breeze, and how
 * spread out they want the cloud.
 */
export class Input {
  /** Pointer position in CSS pixels, or null before it has moved. */
  pointer: { x: number; y: number } | null = null
  /** Desired spread, 0 gathered to 1 wide. */
  spread = T.cloud.startSpread
  /** Fog stays on until toggled off again. */
  fog = false
  /** Camera zoom asked for since last read, as a multiplier. */
  private zoomBy = 1
  /** Set on the first press, so audio can start inside a user gesture. */
  onFirstPress?: () => void
  onToggleJournal?: () => void
  private strikeAsked = false
  private stormAsked = false
  private keys = new Set<string>()
  private rainMouse = false
  private rainKey = false
  private breezeMouse = false
  private breezeKey = false
  private pressed = false

  constructor(target: HTMLElement) {
    target.addEventListener('pointermove', (e) => this.move(e))
    target.addEventListener('pointerdown', (e) => {
      this.move(e)
      // Right button (or a two-finger click on a trackpad) is the breeze.
      if (e.button === 2) this.breezeMouse = true
      else this.rainMouse = true
      this.press()
      target.setPointerCapture?.(e.pointerId)
    })
    target.addEventListener('dblclick', () => (this.strikeAsked = true))
    // Off the canvas, stop steering and stop edge-panning.
    target.addEventListener('pointerleave', () => (this.pointer = null))
    target.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.breezeMouse = false
      else this.rainMouse = false
    })
    target.addEventListener('pointercancel', () => {
      this.rainMouse = false
      this.breezeMouse = false
    })
    window.addEventListener('blur', () => {
      this.rainMouse = this.rainKey = this.breezeMouse = this.breezeKey = false
      this.keys.clear()
    })
    target.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        // Scroll (or pinch, which arrives as a wheel with ctrl held) to zoom.
        const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        this.zoomBy *= Math.exp(pixels * T.camera.zoomPerPixel * (e.ctrlKey ? 4 : 1))
      },
      { passive: false },
    )
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        this.rainKey = true
        this.press()
      } else if (e.key === 'Shift') {
        this.breezeKey = true
        this.press()
      } else if (e.code === 'KeyX' || e.code === 'Equal') {
        this.nudgeSpread(T.input.spreadPerKey)
      } else if (e.code === 'KeyZ' || e.code === 'Minus') {
        this.nudgeSpread(-T.input.spreadPerKey)
      } else if (e.code === 'KeyG' && !e.repeat) {
        this.stormAsked = true
        this.press()
      } else if (e.code === 'KeyF' && !e.repeat) {
        this.fog = !this.fog
        this.press()
      } else if (e.code === 'KeyL' && !e.repeat) {
        this.strikeAsked = true
        this.press()
      } else if (e.code === 'KeyJ' && !e.repeat) {
        this.onToggleJournal?.()
      } else if (PAN_KEYS[e.code] || e.code === 'KeyQ' || e.code === 'KeyE') {
        e.preventDefault()
        this.keys.add(e.code)
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      if (e.code === 'Space') this.rainKey = false
      if (e.key === 'Shift') this.breezeKey = false
    })
    target.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  get rain() {
    return this.rainMouse || this.rainKey
  }

  get breeze() {
    return this.breezeMouse || this.breezeKey
  }

  /** True once per request for a storm. */
  takeStorm() {
    const s = this.stormAsked
    this.stormAsked = false
    return s
  }

  /** Zoom asked for since the last call, as a distance multiplier. */
  takeZoom() {
    const z = this.zoomBy
    this.zoomBy = 1
    return z
  }

  /** -1 to turn the view left (Q), 1 to turn it right (E). */
  get turn() {
    return (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0)
  }

  /** True once per request for lightning. */
  takeStrike() {
    const s = this.strikeAsked
    this.strikeAsked = false
    return s
  }

  /**
   * Which way to pan, from the keys or from the pointer resting near a screen
   * edge. Returns -1..1 on each axis; z is towards the viewer.
   */
  panDirection(view: DOMRect) {
    let x = 0
    let z = 0
    for (const k of this.keys) {
      if (!PAN_KEYS[k]) continue
      x += PAN_KEYS[k][0]
      z += PAN_KEYS[k][1]
    }
    const p = this.pointer
    if (p) {
      const e = T.camera.edge
      const u = (p.x - view.left) / view.width
      const v = (p.y - view.top) / view.height
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        if (u < e) x -= 1 - u / e
        if (u > 1 - e) x += 1 - (1 - u) / e
        if (v < e) z -= 1 - v / e
        if (v > 1 - e) z += 1 - (1 - v) / e
      }
    }
    return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) }
  }

  private nudgeSpread(by: number) {
    this.spread = Math.min(1, Math.max(0, this.spread + by))
  }

  private move(e: PointerEvent) {
    this.pointer = { x: e.clientX, y: e.clientY }
  }

  private press() {
    if (this.pressed) return
    this.pressed = true
    this.onFirstPress?.()
  }
}
