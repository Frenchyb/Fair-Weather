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
    /** Radius of the shade and rain it puts on the ground. */
    radius: 0.9,
    /** Width of the soft edge, centred on `radius`. */
    softEdge: 0.5,
    height: 2.5,
    /** How briskly it drifts to the pointer (1/s). */
    followRate: 3,
    startWater: 0.7,
    /** Water spent per second of rain. A full cloud rains for ~8 s. */
    rainUse: 0.12,
    /** Water needed to start raining again after running dry. */
    minToRain: 0.06,
    /** It refills slowly on its own anywhere... */
    passiveRefill: 0.03,
    /** ...and quickly while resting over the pond in the sun. */
    pondRefill: 0.35,
    /** Light that reaches the ground under the cloud. */
    shadeLight: 0.2,
  },

  soil: {
    start: 0.35,
    /** Moisture added per second under the middle of a raining cloud. */
    rainRate: 0.22,
    /** Moisture lost per second in full sun... */
    sunDry: 0.006,
    /** ...and in any light at all. */
    baseDry: 0.002,
  },

  /** Plants respond to light averaged over this many seconds, not to a flicker. */
  lightMemory: 8,
  /** How far outside its range a need can drift before growth stops. */
  comfortFalloff: 0.3,
  /** Seconds to grow from seed to full bloom when perfectly content. */
  secondsToBloom: 80,
  /** How quickly a plant's posture follows its comfort (s). */
  moodLag: 1.5,
  /** Below this comfort a plant shows what it wants. */
  showNeedBelow: 0.65,

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
      likes: 'shade for part of the day and damp soil',
      light: [0.2, 0.65],
      moisture: [0.55, 0.92],
    },
    lavender: {
      label: 'Lavender',
      likes: 'full sun and dry feet',
      light: [0.7, 1],
      moisture: [0.08, 0.45],
    },
  } as Record<KindName, Kind>,

  render: {
    /** How dark the cloud's shade looks, as a brightness multiplier. */
    shadeDarkness: 0.55,
    rainDrops: 500,
    rainSpeed: 7,
    beesPerPlant: 2,
  },

  audio: { rainGain: 0.22, rainFade: 0.6 },
}
