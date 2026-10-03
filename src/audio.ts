/**
 * Rain on leaves, on the shed roof and on the pond, the wind, and a soft
 * chime when a plant comes into bloom. Round that, the garden's own life:
 * birdsong by day and a dawn chorus, crickets on a warm night, frogs, bees,
 * a rabbit's thump, a deer's snort, squirrels chattering, chicks in the nest,
 * and Rose and Walter about the place: the back door, teacups, the shovel,
 * pegs on the line, sheets snapping in the breeze. No music.
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
  private roof?: GainNode
  private hum?: GainNode
  private pondRain = 0
  private weatherWind = 0

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

    // Rain on the shed and house roofs: the same noise, duller and slower, drumming.
    const roofSrc = ctx.createBufferSource()
    roofSrc.buffer = buf
    roofSrc.loop = true
    roofSrc.playbackRate.value = 0.55
    const roofLow = ctx.createBiquadFilter()
    roofLow.type = 'lowpass'
    roofLow.frequency.value = 900
    roofLow.Q.value = 0.5
    this.roof = ctx.createGain()
    this.roof.gain.value = 0
    roofSrc.connect(roofLow).connect(this.roof).connect(ctx.destination)
    roofSrc.start()

    // Bees: a low buzz, faded in while they are working the flowers.
    const bee = ctx.createOscillator()
    bee.type = 'sawtooth'
    bee.frequency.value = 205
    const wob = ctx.createOscillator()
    wob.frequency.value = 0.3
    const wobGain = ctx.createGain()
    wobGain.gain.value = 6
    wob.connect(wobGain).connect(bee.frequency)
    const beeLow = ctx.createBiquadFilter()
    beeLow.type = 'lowpass'
    beeLow.frequency.value = 700
    beeLow.Q.value = 0.5
    this.hum = ctx.createGain()
    this.hum.gain.value = 0
    bee.connect(beeLow).connect(this.hum).connect(ctx.destination)
    bee.start()
    wob.start()
  }

  /** The player's breeze, plus how windy the day is (0 to 1: a storm is 1). */
  setBreeze(on: boolean, weather = this.weatherWind) {
    this.weatherWind = weather
    if (!this.ctx || !this.wind) return
    const level = Math.max(on ? 1 : 0, weather)
    this.wind.gain.setTargetAtTime(level * T.audio.windGain, this.ctx.currentTime, T.audio.rainFade / 3)
  }

  /**
   * 0 to 1: the cloud's shower counts as 1, a rainy day as much as it is raining.
   * `roof` and `pond` are how much of it falls on the roofs and on the pond.
   */
  setRaining(level: number, roof = level, pond = 0) {
    if (!this.ctx || !this.rain) return
    const now = this.ctx.currentTime
    this.rain.gain.setTargetAtTime(level * T.audio.rainGain, now, T.audio.rainFade / 3)
    this.roof?.gain.setTargetAtTime(roof * T.audio.roofGain, now, T.audio.rainFade / 3)
    this.pondRain = pond
  }

  /** 0 to 1: how many bees are busy in the flowers. */
  setBees(level: number) {
    if (!this.ctx || !this.hum) return
    this.hum.gain.setTargetAtTime(level * T.audio.beeGain, this.ctx.currentTime, 1)
  }

  /**
   * Called every frame with who is about. Songs and croaks are scheduled at
   * random, at a rate set by how many birds and frogs there are.
   */
  ambience(dt: number, birds: number, frogs: number, crickets: number, dawn = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const A = T.audio
    // At dawn every bird sings at once.
    if (Math.random() < birds * A.songRate * (1 + dawn * A.dawnChorus) * dt) this.song()
    // Drops on the pond: little plips.
    if (Math.random() < this.pondRain * A.plipRate * dt) this.plip()
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

  /** A burst of filtered noise: the building block of most small sounds here. */
  private burst(at: number, type: BiquadFilterType, freq: number, gain: number, len: number, attack = 0.005, q = 0.7) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.2 - 0.6
    src.connect(f).connect(g).connect(pan).connect(ctx.destination)
    src.start(at, Math.random() * 1.5)
    src.stop(at + len + 0.05)
  }

  /** A short tone. */
  private blip(at: number, type: OscillatorType, from: number, to: number, gain: number, len: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(from, at)
    o.frequency.exponentialRampToValueAtTime(to, at + len)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    o.connect(g).connect(ctx.destination)
    o.start(at)
    o.stop(at + len + 0.02)
  }

  private plip() {
    const now = this.ctx!.currentTime
    const f = 900 + Math.random() * 900
    this.blip(now, 'sine', f, f * 1.8, T.audio.plipGain, 0.06)
  }

  /** The animals and the people: one call per thing that happens. */
  play(name: string) {
    const ctx = this.ctx
    if (!ctx || !this.noise) return
    const now = ctx.currentTime
    const A = T.audio
    switch (name) {
      case 'thump': // A rabbit stamps a warning as it goes in.
        this.burst(now, 'lowpass', 160, A.thumpGain, 0.12, 0.002)
        this.burst(now + 0.18, 'lowpass', 160, A.thumpGain * 0.8, 0.12, 0.002)
        break
      case 'snort': // A deer blows through its nose.
        this.burst(now, 'bandpass', 700, A.snortGain, 0.35, 0.02)
        break
      case 'chatter': // Squirrels scolding: quick dry clicks.
        for (let i = 0; i < 7; i++) this.burst(now + i * 0.055, 'bandpass', 3200, A.chatterGain, 0.035, 0.002, 1)
        break
      case 'snuffle': // The hedgehog.
        for (let i = 0; i < 4; i++) this.burst(now + i * 0.13 + Math.random() * 0.04, 'bandpass', 1100, A.snuffleGain, 0.08, 0.01)
        break
      case 'cheep': // Chicks in the nest.
        for (let i = 0; i < 3; i++) this.blip(now + i * 0.1, 'sine', 4200, 5200, A.cheepGain, 0.05)
        break
      case 'quack':
        for (let i = 0; i < 2; i++) {
          const t = now + i * 0.22
          this.blip(t, 'sawtooth', 380, 300, A.quackGain, 0.14)
          this.burst(t, 'bandpass', 1100, A.quackGain * 0.4, 0.12)
        }
        break
      case 'honk':
        this.honk()
        break
      case 'flutter':
        this.flutter()
        break
      case 'door': // The back door: a latch, then the door against its frame.
        this.burst(now, 'bandpass', 2400, A.doorGain * 0.6, 0.04, 0.002, 1)
        this.burst(now + 0.5, 'lowpass', 300, A.doorGain, 0.2, 0.004)
        break
      case 'cup': // Cup on saucer.
        this.blip(now, 'sine', 2900, 2850, A.cupGain, 0.25)
        this.blip(now, 'sine', 4700, 4600, A.cupGain * 0.5, 0.15)
        break
      case 'shovel': // Scrape, and snow thrown aside.
        this.burst(now, 'bandpass', 1800, A.shovelGain, 0.35, 0.05, 0.5)
        this.burst(now + 0.45, 'lowpass', 600, A.shovelGain * 0.6, 0.25, 0.03)
        break
      case 'peg':
      case 'unpeg': // A wooden peg's click.
        this.burst(now, 'bandpass', 2600, A.pegGain, 0.03, 0.001, 1)
        break
      case 'snap': // A sheet cracking in the wind.
        this.burst(now, 'bandpass', 900, A.snapGain, 0.12, 0.004, 0.5)
        break
      case 'footsteps':
        for (let i = 0; i < 4; i++) this.burst(now + i * 0.42, 'lowpass', 500, A.stepGain, 0.08, 0.005)
        break
      case 'pat': // Patting the snowman into shape.
        this.burst(now, 'lowpass', 700, A.stepGain * 1.4, 0.1, 0.004)
        break
    }
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
