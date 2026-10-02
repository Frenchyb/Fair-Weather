/**
 * The lawn as a grid: how green the grass is, how wet the ground is, and
 * which way the breeze has laid the grass over. This is what makes weather
 * leave a mark. Rain greens dry grass for good, wet ground dries slowly and
 * pools in puddles first, and a breeze leaves a trail that takes a while to
 * stand back up.
 *
 * Pure maths, no three.js. Cell (i, j) covers x0 + i*cell .. x0 + (i+1)*cell.
 */
import { T } from '../tuning'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

export class Ground {
  readonly cell = T.ground.cell
  readonly x0 = T.yard.x0
  readonly z0 = T.yard.z0
  readonly cols = Math.ceil((T.yard.x1 - T.yard.x0) / T.ground.cell)
  readonly rows = Math.ceil((T.yard.z1 - T.yard.z0) / T.ground.cell)
  /** 0 parched to 1 lush. Only ever goes up. */
  readonly green: Float32Array
  /** Surface water, 0 dry to `T.ground.maxWet`; above `puddleAt` it stands in puddles. */
  readonly wet: Float32Array
  /** Which way the grass is laid over, and how far (length up to 1). */
  readonly bendX: Float32Array
  readonly bendZ: Float32Array
  /** 1 where grass grows: not paving, the bed or the pond. */
  readonly lawn: Uint8Array
  /** 1 where water can stand on the surface (everything but the pond). */
  readonly dryLand: Uint8Array
  readonly lawnCells: number
  private creepClock = 0

  constructor(random: () => number) {
    const n = this.cols * this.rows
    this.green = new Float32Array(n)
    this.wet = new Float32Array(n)
    this.bendX = new Float32Array(n)
    this.bendZ = new Float32Array(n)
    this.lawn = new Uint8Array(n)
    this.dryLand = new Uint8Array(n)
    let lawnCells = 0
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i
        const x = this.x0 + (i + 0.5) * this.cell
        const z = this.z0 + (j + 0.5) * this.cell
        const pond = Math.hypot(x - T.pond.x, z - T.pond.z) < T.pond.radius
        const bed = Math.abs(x) < T.bed.width / 2 && Math.abs(z) < T.bed.depth / 2
        const hard = T.hardGround.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1)
        this.dryLand[k] = pond ? 0 : 1
        this.lawn[k] = pond || bed || hard ? 0 : 1
        lawnCells += this.lawn[k]
        // Patchy to begin with: some of the lawn is hanging on better than the rest.
        this.green[k] = this.lawn[k] ? clamp(T.ground.startGreen + (random() - 0.5) * T.ground.greenNoise, 0, 1) : 0
      }
    }
    this.lawnCells = lawnCells
  }

  index(x: number, z: number) {
    const i = Math.floor((x - this.x0) / this.cell)
    const j = Math.floor((z - this.z0) / this.cell)
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1
    return j * this.cols + i
  }

  greenAt(x: number, z: number) {
    const k = this.index(x, z)
    return k < 0 ? 0 : this.green[k]
  }

  wetAt(x: number, z: number) {
    const k = this.index(x, z)
    return k < 0 ? 0 : this.wet[k]
  }

  /** Share of the lawn that is properly green. */
  get greenShare() {
    let g = 0
    for (let k = 0; k < this.green.length; k++) if (this.lawn[k] && this.green[k] > 0.6) g++
    return g / this.lawnCells
  }

  /** Deepest standing water anywhere, above the puddle line. */
  get deepestPuddle() {
    let d = 0
    for (let k = 0; k < this.wet.length; k++) if (this.dryLand[k]) d = Math.max(d, this.wet[k] - T.ground.puddleAt)
    return d
  }

  /**
   * Rain over a soft-edged disc. `amount` is rain per unit area relative to a
   * reference-sized cloud, times seconds. Returns square metres of new green.
   */
  rain(cx: number, cz: number, radius: number, soft: number, amount: number) {
    const G = T.ground
    let greened = 0
    const area = this.cell * this.cell
    this.disc(cx, cz, radius + soft / 2, (k, d) => {
      const cover = 1 - smoothstep(radius - soft / 2, radius + soft / 2, d)
      if (cover <= 0) return
      if (this.dryLand[k]) this.wet[k] = Math.min(G.maxWet, this.wet[k] + G.wetRate * amount * cover)
      if (this.lawn[k] && this.green[k] < 1) {
        const before = this.green[k]
        this.green[k] = Math.min(1, before + G.greenRate * amount * cover)
        greened += (this.green[k] - before) * area
      }
    })
    return greened
  }

  /** Green the grass round a point, at least to `amount`, fading out at the edge. */
  greenDisc(cx: number, cz: number, radius: number, amount: number) {
    let greened = 0
    const area = this.cell * this.cell
    this.disc(cx, cz, radius, (k, d) => {
      if (!this.lawn[k]) return
      const want = amount * (1 - smoothstep(radius * 0.5, radius, d))
      if (want > this.green[k]) {
        greened += (want - this.green[k]) * area
        this.green[k] = want
      }
    })
    return greened
  }

  /** Lay the grass over along the wind, strongest near the middle. */
  blow(cx: number, cz: number, reach: number, wx: number, wz: number, amount: number) {
    this.disc(cx, cz, reach, (k, d) => {
      if (!this.lawn[k]) return
      const s = amount * (1 - smoothstep(reach * 0.5, reach, d))
      const bx = this.bendX[k] + (wx - this.bendX[k]) * s
      const bz = this.bendZ[k] + (wz - this.bendZ[k]) * s
      this.bendX[k] = bx
      this.bendZ[k] = bz
    })
  }

  /**
   * Time passing: surface water soaks in and dries (puddles shrink first, as
   * they are the wettest), laid-over grass stands back up, and green grass
   * creeps into its drier neighbours.
   */
  settle(dt: number, daylight: number) {
    const G = T.ground
    const dry = (G.dryBase + G.drySun * daylight) * dt
    const stand = Math.exp(-dt / G.bendFade)
    for (let k = 0; k < this.wet.length; k++) {
      if (this.wet[k] > 0) this.wet[k] = Math.max(0, this.wet[k] - dry * (this.wet[k] > G.puddleAt ? 1.5 : 1))
      this.bendX[k] *= stand
      this.bendZ[k] *= stand
    }
    this.creepClock += dt
    if (this.creepClock >= G.creepEvery) {
      this.creep(this.creepClock)
      this.creepClock = 0
    }
  }

  private creep(dt: number) {
    const { cols, rows, green, lawn } = this
    const k0 = T.ground.creep * dt
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i
        if (!lawn[k]) continue
        const best = Math.max(green[k - 1], green[k + 1], green[k - cols], green[k + cols])
        if (best > green[k] + 0.2) green[k] = Math.min(1, green[k] + (best - green[k]) * k0)
      }
    }
  }

  private disc(cx: number, cz: number, r: number, f: (k: number, d: number) => void) {
    const c = this.cell
    const i0 = Math.max(0, Math.floor((cx - r - this.x0) / c))
    const i1 = Math.min(this.cols - 1, Math.floor((cx + r - this.x0) / c))
    const j0 = Math.max(0, Math.floor((cz - r - this.z0) / c))
    const j1 = Math.min(this.rows - 1, Math.floor((cz + r - this.z0) / c))
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * c
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * c
        const d = Math.hypot(x - cx, z - cz)
        if (d <= r) f(j * this.cols + i, d)
      }
    }
  }
}
