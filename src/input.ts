/** Where the pointer is and whether the player is asking for rain. */
export class Input {
  /** Pointer position in CSS pixels, or null before it has moved. */
  pointer: { x: number; y: number } | null = null
  private mouseHeld = false
  private keyHeld = false
  /** Set on the first press, so audio can start inside a user gesture. */
  onFirstPress?: () => void
  private pressed = false

  constructor(target: HTMLElement) {
    target.addEventListener('pointermove', (e) => this.move(e))
    target.addEventListener('pointerdown', (e) => {
      this.move(e)
      this.mouseHeld = true
      this.press()
      target.setPointerCapture?.(e.pointerId)
    })
    const release = () => (this.mouseHeld = false)
    target.addEventListener('pointerup', release)
    target.addEventListener('pointercancel', release)
    window.addEventListener('blur', () => {
      this.mouseHeld = false
      this.keyHeld = false
    })
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      this.keyHeld = true
      this.press()
    })
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.keyHeld = false
    })
    target.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  get rain() {
    return this.mouseHeld || this.keyHeld
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
