/**
 * Every number the game runs on. Distances are metres, times are seconds,
 * and moisture, light and growth all run from 0 to 1.
 */

export type KindName = 'tomato' | 'lettuce' | 'lavender' | 'sunflower' | 'fern' | 'moonflower' | 'apple'

export interface Kind {
  label: string
  /** What the player is told when they point at one. */
  likes: string
  /** Comfortable range for light averaged over the last few seconds. */
  light: [number, number]
  /** Comfortable range for soil moisture. */
  moisture: [number, number]
  /** Growth speed relative to a tomato. */
  pace?: number
  /** Grows only at night, and opens its flowers in the dark. */
  night?: boolean
  /** Once in flower it needs moving air on its blossom to set fruit. */
  pollen?: boolean
  /** How far from its centre it counts as "this plant" when pointed at. */
  reach?: number
}

export interface Planting {
  kind: KindName
  x: number
  z: number
}

/** An axis-aligned patch of ground, in metres. */
export interface Patch {
  x0: number
  x1: number
  z0: number
  z1: number
}

export const T = {
  bed: { width: 7.8, depth: 3.6, height: 0.35 },

  /** Raised-bed grid, row by row. Neighbours deliberately want different weather. */
  layout: [
    ['tomato', 'lettuce', 'lavender', 'tomato'],
    ['lettuce', 'lavender', 'tomato', 'lettuce'],
    ['lavender', 'tomato', 'lettuce', 'lavender'],
  ] as KindName[][],
  spacing: { x: 1.85, z: 1.1 },

  /** Everything planted outside the raised bed. */
  plantings: [
    // Sunflowers along the back fence.
    { kind: 'sunflower', x: -4, z: -11.2 },
    { kind: 'sunflower', x: -1.5, z: -11.4 },
    { kind: 'sunflower', x: 1, z: -11.2 },
    { kind: 'sunflower', x: 3.5, z: -11.4 },
    { kind: 'sunflower', x: 6, z: -11.2 },
    // The orchard.
    { kind: 'apple', x: 9, z: -7 },
    { kind: 'apple', x: 14, z: -7.5 },
    { kind: 'apple', x: 9.5, z: -2.5 },
    { kind: 'apple', x: 14.5, z: -2 },
    // Ferns in the oak's shade, which falls north-west of the trunk at midday.
    { kind: 'fern', x: 10.3, z: 4.6 },
    { kind: 'fern', x: 12.4, z: 3.9 },
    { kind: 'fern', x: 11.2, z: 6.2 },
    // Moonflowers round the pond.
    { kind: 'moonflower', x: -8.5, z: 3.6 },
    { kind: 'moonflower', x: -6.6, z: 7.1 },
    { kind: 'moonflower', x: -3.5, z: 5.8 },
  ] as Planting[],

  pond: { x: -6, z: 4.5, radius: 1.6 },

  /** A big oak whose shade the ferns live in. Its shade follows the sun. */
  oak: { x: 12.5, z: 6.5, crownHeight: 4.5, crownRadius: 2.6, shadeLight: 0.35 },

  /** Ground that isn't lawn, so nothing wild seeds into it. */
  hardGround: [
    { x0: -17, x1: -7, z0: -13, z1: -6 }, // house
    { x0: -16, x1: -8, z0: -6, z1: -3 }, // patio
    { x0: 15, x1: 18.5, z0: -12.5, z1: -9 }, // shed
  ] as Patch[],

  /** Where the cloud may go: the whole garden, inside the fence. */
  yard: { x0: -19, x1: 19, z0: -12.5, z1: 10.5 },

  /** One day and night. The game starts in the morning. */
  day: { length: 180, night: 60, twilight: 12, start: 0.1 },
  /** Dew at dawn brings dry soil up by this much, never past what a plant likes. */
  dew: 0.12,

  fog: {
    /** Fog spreads this much wider than the cloud would. */
    scale: 1.8,
    light: 0.6,
    /** Fog damps soil towards this, and never past it. */
    target: 0.55,
    rate: 0.03,
    use: 0.015,
  },

  lightning: {
    /** The cloud must hold this much, and be gathered at least this tight. */
    minWater: 0.6,
    maxSpread: 0.4,
    cost: 0.4,
    cooldown: 3,
    /** Soil it strikes stays rich this long, and rich soil grows this much faster. */
    richFor: 150,
    richBoost: 1,
    /** Wildflower seed it scatters on bare lawn. */
    seeds: 10,
  },

  rainbow: {
    /** A shower at least this long, in daylight, leaves a rainbow behind. */
    minShower: 2.5,
    minDaylight: 0.7,
    lasts: 18,
  },

  cloud: {
    size: {
      /** Radius when gathered tight. */
      gathered: 0.75,
      /** Radius when spread wide, for a new cloud... */
      spreadBase: 1.3,
      /** ...and how much wider it can spread per extra unit it holds. */
      spreadPerCapacity: 0.35,
      /** A nearly empty cloud is this much smaller. */
      emptyShrink: 0.25,
      /** Radius at which rain falls at `soil.rainRate`; wider is gentler. */
      reference: 0.9,
    },
    /** Width of the soft edge at the reference size; scales with the cloud. */
    softEdge: 0.5,
    startSpread: 0.25,
    /** How briskly it gathers or spreads (1/s). */
    spreadRate: 4,
    height: 2.5,
    /** How briskly it drifts to the pointer (1/s). */
    followRate: 3,
    startWater: 0.8,
    /** Water spent per second of rain. A new cloud rains for ~12 s. */
    rainUse: 0.08,
    /** Water needed to start raining again after running dry. */
    minToRain: 0.06,
    /** It refills slowly on its own anywhere... */
    passiveRefill: 0.02,
    /** ...and quickly while resting over the pond in the sun. */
    pondRefill: 0.35,
    /** Each plant that blooms lets the cloud hold this much more. */
    capacityPerBloom: 0.2,
    maxCapacity: 2.8,
    /** Light that reaches the ground under the cloud. */
    shadeLight: 0.2,
  },

  soil: {
    start: 0.35,
    /** Moisture added per second under the middle of a raining cloud. */
    rainRate: 0.22,
    /** Moisture lost per second in full sun... */
    sunDry: 0.0025,
    /** ...and in any light at all. A good soak lasts well over a minute. */
    baseDry: 0.001,
  },

  wind: {
    /** How far past the cloud's edge the breeze reaches. */
    reach: 1.2,
    /** How quickly the breeze swings round to the cloud's new heading (s). */
    turnLag: 0.25,
    minSpeedToTurn: 0.3,
    /** Extra growth for flowers in the breeze: 2 means three times as fast. */
    pollinateBoost: 2,
    /** Growth of a blossom that needs a breeze and isn't getting one. */
    withoutPollen: 0.15,
    /** Seconds between seeds from a bloomed plant in the breeze, on average. */
    seedEvery: 0.35,
    seedSpeed: 2.2,
    /** Sideways spread of seed, as a fraction of its speed. */
    seedScatter: 0.35,
    seedFlight: [1.2, 3.2] as [number, number],
    maxSeedsInAir: 80,
  },

  wild: {
    /** Keep this far clear of the bed and the pond. */
    margin: 0.3,
    max: 900,
    /** No closer than this to another wildflower. */
    spacing: 0.22,
    secondsToGrow: 20,
    /** Rain makes them grow this much faster again. */
    rainBoost: 3,
  },

  /** Plants respond to light averaged over this many seconds, not to a flicker. */
  lightMemory: 25,
  /** How far outside its range a need can drift before growth stops. */
  comfortFalloff: 0.4,
  /** Seconds to grow from seed to full bloom when perfectly content. */
  secondsToBloom: 90,
  /** How quickly a plant's posture follows its comfort (s). */
  moodLag: 1.5,
  /** Below this comfort a plant shows what it wants. */
  showNeedBelow: 0.5,

  /** Growth at which each stage begins. */
  stages: { sprout: 0.12, leafy: 0.4, flowering: 0.72, bloom: 1 },

  kinds: {
    tomato: {
      label: 'Tomato',
      likes: 'full sun and steady water',
      light: [0.7, 1],
      moisture: [0.45, 0.8],
    },
    lettuce: {
      label: 'Lettuce',
      likes: 'damp soil and a little shade',
      light: [0.2, 0.85],
      moisture: [0.55, 0.92],
    },
    lavender: {
      label: 'Lavender',
      likes: 'full sun and dry feet',
      light: [0.7, 1],
      moisture: [0.08, 0.45],
    },
    sunflower: {
      label: 'Sunflower',
      likes: 'all the sun there is and plenty to drink',
      light: [0.8, 1],
      moisture: [0.5, 0.85],
      pace: 0.8,
      reach: 0.6,
    },
    fern: {
      label: 'Fern',
      likes: 'shade and damp, and fog most of all',
      light: [0.1, 0.62],
      moisture: [0.5, 0.95],
      reach: 0.7,
    },
    moonflower: {
      label: 'Moonflower',
      likes: 'moist soil, and only grows and flowers at night',
      light: [0, 1],
      moisture: [0.4, 0.8],
      pace: 2.4,
      night: true,
      reach: 0.6,
    },
    apple: {
      label: 'Apple tree',
      likes: 'sun and a deep drink; its blossom needs a breeze to set fruit',
      light: [0.6, 1],
      moisture: [0.35, 0.8],
      pace: 0.6,
      pollen: true,
      reach: 1.4,
    },
  } as Record<KindName, Kind>,

  camera: {
    /** Ground width across the screen, and where the view starts. */
    viewWidth: 24,
    startX: -2,
    startZ: 1,
    /** Pan speed (m/s) from keys or from the pointer at the screen's edge. */
    panSpeed: 9,
    edge: 0.06,
  },

  input: {
    /** Spread change per pixel of scroll, and per key press. */
    spreadPerPixel: 0.0015,
    spreadPerKey: 0.15,
  },

  render: {
    /** How dark the cloud's shade looks, as a brightness multiplier. */
    shadeDarkness: 0.55,
    rainDrops: 500,
    rainSpeed: 7,
    beesPerPlant: 2,
    butterflies: 24,
    fireflies: 140,
    windWisps: 60,
  },

  audio: { rainGain: 0.22, windGain: 0.35, rainFade: 0.6, thunderGain: 0.5 },
}
