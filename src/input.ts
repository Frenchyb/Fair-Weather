import { T } from './tuning'

/**
 * Where the pointer is, whether the player wants rain or a breeze, and how
 * spread out they want the cloud.
 */
export class Input {
  /** Pointer position in CSS pixels, or null before it has moved. */
  pointer: { x: number; y: number } | null = null
  /** Desired spread, 0 gathered to 1 wide. */
  spread = T.cloud.startSpread
  /** Set on the first press, so audio can start inside a user gesture. */
  onFirstPress?: () => void
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
    })
    target.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        // Scroll up to spread the cloud wide, down to gather it in.
        const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        this.nudgeSpread(-pixels * T.input.spreadPerPixel)
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
      } else if (e.code === 'KeyE' || e.code === 'Equal') {
        this.nudgeSpread(T.input.spreadPerKey)
      } else if (e.code === 'KeyQ' || e.code === 'Minus') {
        this.nudgeSpread(-T.input.spreadPerKey)
      }
    })
    window.addEventListener('keyup', (e) => {
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
