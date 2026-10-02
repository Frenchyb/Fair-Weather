/**
 * Every number the game runs on. Distances are metres, times are seconds,
 * and moisture, light and growth all run from 0 to 1.
 */

export type KindName = 'tomato' | 'lettuce' | 'lavender'

export interface Kind {
  label: string
  /** What the player is told when they point at one. */
  likes: string
  /** Comfortable range for light averaged over the last few seconds. */
  light: [number, number]
  /** Comfortable range for soil moisture. */
  moisture: [number, number]
}

export const T = {
  bed: { width: 6, depth: 3.6, height: 0.35 },

  /** Plant grid, row by row. Neighbours deliberately want different weather. */
  layout: [
    ['tomato', 'lettuce', 'lavender'],
    ['lettuce', 'lavender', 'tomato'],
    ['lavender', 'tomato', 'lettuce'],
  ] as KindName[][],
  spacing: { x: 1.85, z: 1.1 },

  pond: { x: -4.7, z: 1.9, radius: 1.3 },

  /** How far the cloud may wander from the bed's centre. */
  yard: { halfWidth: 7, halfDepth: 4.5 },

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
    halfWidth: 12,
    halfDepth: 5.8,
    max: 400,
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
  } as Record<KindName, Kind>,

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
    windWisps: 60,
  },

  audio: { rainGain: 0.22, windGain: 0.35, rainFade: 0.6 },
}
