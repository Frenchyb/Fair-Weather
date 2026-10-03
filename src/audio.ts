/**
 * Rain on leaves, a breeze, and a soft chime when a plant comes into bloom.
 * Round that, the garden's own life: birdsong by day, crickets on a warm
 * night, frogs at the pond, geese going over.
 * Browsers only allow sound after a click or key press, so `start()` is
 * called from the first one.
 */
import { T } from './tuning'

export class Sound {
  private ctx?: AudioContext
  private rain?: GainNode
  private wind?: GainNode
  private crickets?: GainNode
  private noise?: AudioBuffer

  start() {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx
    this.startCrickets(ctx)

    // Two seconds of noise, looped, softened into rain: no resonant filters.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    this.noise = buf
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

    // The same noise, much darker, is the breeze.
    const windSrc = ctx.createBufferSource()
    windSrc.buffer = buf
    windSrc.loop = true
    windSrc.playbackRate.value = 0.7
    const windLow = ctx.createBiquadFilter()
    windLow.type = 'lowpass'
    windLow.frequency.value = 520
    windLow.Q.value = 0.6
    this.wind = ctx.createGain()
    this.wind.gain.value = 0
    windSrc.connect(windLow).connect(this.wind).connect(ctx.destination)
    windSrc.start()
  }

  setBreeze(on: boolean) {
    if (!this.ctx || !this.wind) return
    this.wind.gain.setTargetAtTime(on ? T.audio.windGain : 0, this.ctx.currentTime, T.audio.rainFade / 3)
  }

  /** 0 to 1: the cloud's shower counts as 1, a rainy day as much as it is raining. */
  setRaining(level: number) {
    if (!this.ctx || !this.rain) return
    this.rain.gain.setTargetAtTime(level * T.audio.rainGain, this.ctx.currentTime, T.audio.rainFade / 3)
  }

  /**
   * Called every frame with who is about. Songs and croaks are scheduled at
   * random, at a rate set by how many birds and frogs there are.
   */
  ambience(dt: number, birds: number, frogs: number, crickets: number) {
    const ctx = this.ctx
    if (!ctx) return
    const A = T.audio
    if (Math.random() < birds * A.songRate * dt) this.song()
    if (Math.random() < frogs * A.croakRate * dt) this.croak()
    this.crickets?.gain.setTargetAtTime(crickets * A.cricketGain, ctx.currentTime, 1.5)
  }

  /** A short phrase of quick whistled notes, each its own little slide. */
  private song() {
    const ctx = this.ctx!
    const now = ctx.currentTime
    const notes = 3 + Math.floor(Math.random() * 5)
    const base = 2400 + Math.random() * 1600
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    pan.connect(ctx.destination)
    let t = now
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f = base * (0.8 + Math.random() * 0.5)
      const len = 0.05 + Math.random() * 0.09
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.3 : 0.75), t + len)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(T.audio.songGain, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + len)
      o.connect(g).connect(pan)
      o.start(t)
      o.stop(t + len + 0.02)
      t += len + 0.03 + Math.random() * 0.07
    }
  }

  /** A frog: two low, buzzy pulses. */
  private croak() {
    const ctx = this.ctx!
    const now = ctx.currentTime
    const f = 110 + Math.random() * 60
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.16
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f, t)
      const band = ctx.createBiquadFilter()
      band.type = 'lowpass'
      band.frequency.value = 900
      band.Q.value = 0.7
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(T.audio.croakGain, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      o.connect(band).connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.14)
    }
  }

  /** Geese, far off: a couple of nasal honks. */
  honk() {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.28 + Math.random() * 0.1
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(330 + Math.random() * 60, t)
      o.frequency.linearRampToValueAtTime(290, t + 0.18)
      const low = ctx.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = 1200
      low.Q.value = 0.6
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(T.audio.honkGain, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      o.connect(low).connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.25)
    }
  }

  /** Wings: a soft burst of noise. */
  flutter() {
    const ctx = this.ctx
    if (!ctx || !this.noise) return
    const now = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1400
    band.Q.value = 0.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.05, now + 0.02)
    // Quick wingbeats.
    for (let i = 1; i < 6; i++) g.gain.setValueAtTime(i % 2 ? 0.015 : 0.05, now + i * 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
    src.connect(band).connect(g).connect(ctx.destination)
    src.start(now, Math.random())
    src.stop(now + 0.45)
  }

  /** Crickets: a high tone chopped into chirps, always running, faded in on warm nights. */
  private startCrickets(ctx: AudioContext) {
    const o = ctx.createOscillator()
    o.frequency.value = 4400
    const chop = ctx.createGain()
    chop.gain.value = 0.5
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 28
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.5
    lfo.connect(lfoGain).connect(chop.gain)
    // Chirp, chirp, pause: a slower gate on top.
    const gate = ctx.createGain()
    gate.gain.value = 0.5
    const slow = ctx.createOscillator()
    slow.type = 'square'
    slow.frequency.value = 1.6
    const slowGain = ctx.createGain()
    slowGain.gain.value = 0.5
    slow.connect(slowGain).connect(gate.gain)
    this.crickets = ctx.createGain()
    this.crickets.gain.value = 0
    o.connect(chop).connect(gate).connect(this.crickets).connect(ctx.destination)
    for (const n of [o, lfo, slow]) n.start()
  }

  /** Thunder: a crack, then a long low roll. Noise only, nothing pitched. */
  thunder() {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const len = 3.5
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate)
    const d = buf.getChannelData(0)
    // Brownish noise with slow lumps in it, so it rolls rather than hisses.
    let v = 0
    for (let i = 0; i < d.length; i++) {
      v = v * 0.985 + (Math.random() * 2 - 1) * 0.15
      const t = i / ctx.sampleRate
      const lump = 0.6 + 0.4 * Math.sin(t * 7 + Math.sin(t * 2.3) * 3)
      d[i] = v * lump
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 380
    low.Q.value = 0.5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(T.audio.thunderGain, now + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, now + len)
    src.connect(low).connect(g).connect(ctx.destination)
    src.start(now)
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
