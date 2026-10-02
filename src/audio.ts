/**
 * Rain on leaves, and a soft chime when a plant comes into bloom.
 * Browsers only allow sound after a click or key press, so `start()` is
 * called from the first one.
 */
import { T } from './tuning'

export class Sound {
  private ctx?: AudioContext
  private rain?: GainNode

  start() {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx

    // Two seconds of noise, looped, softened into rain: no resonant filters.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 2600
    low.Q.value = 0.5
    const high = ctx.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = 350
    high.Q.value = 0.5
    this.rain = ctx.createGain()
    this.rain.gain.value = 0
    src.connect(low).connect(high).connect(this.rain).connect(ctx.destination)
    src.start()
  }

  setRaining(on: boolean) {
    if (!this.ctx || !this.rain) return
    this.rain.gain.setTargetAtTime(on ? T.audio.rainGain : 0, this.ctx.currentTime, T.audio.rainFade / 3)
  }

  bloom() {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    // A rising fifth, like a small bell.
    ;[660, 990].forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = ctx.createGain()
      const t = now + i * 0.12
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.08, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 1.7)
    })
  }
}
