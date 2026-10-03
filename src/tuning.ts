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

  /** The couple who live in the house, Rose and Walter, and where things are. */
  people: {
    walk: 1.1,
    run: 2.6,
    door: { x: -11.2, z: -5.85 },
    seats: [
      { x: -11.85, z: -4.5 },
      { x: -10.15, z: -4.5 },
    ],
    porch: [
      { x: -11.8, z: -5.5 },
      { x: -10.6, z: -5.5 },
    ],
    feeder: { x: -13.8, z: -1.6 },
    snowman: { x: -13.5, z: 3.6 },
    /** Rose shovels this path through the snow: door, patio, stepping stones to the bed. */
    shovelPath: [
      { x: -11.2, z: -5.5 },
      { x: -9, z: -2.6 },
      { x: -6, z: -1.6 },
      { x: -4.4, z: -0.6 },
    ],
    /** A slow loop with a lantern on a foggy day. */
    lanternLoop: [
      { x: -8, z: -1 },
      { x: -3, z: 3 },
      { x: 2, z: 5.5 },
      { x: 6, z: 3 },
      { x: 5, z: -3 },
      { x: -2, z: -3.2 },
      { x: -8.6, z: -2.6 },
    ],
    /** Seconds before a picked plant has more to give. */
    regrow: 90,
    teaEvery: 140,
    teaFor: 25,
    vase: 7,
    /** Light rain on someone (from the cloud or the sky); above `downpour` everyone goes in. */
    drizzle: 0.05,
    downpour: 0.6,
    nightBelow: 0.2,
  },

  /** The washing line in the side yard. Fresh wash is wet; sun and breeze dry it. */
  wash: {
    x0: -17.6,
    x1: -11.8,
    z: 0.6,
    height: 1.85,
    items: 5,
    sunDry: 0.012,
    breezeDry: 0.05,
    /** How long Rose keeps unpegging in the rain before she gives up and runs in. */
    rescueFor: 10,
    pegTime: 1.1,
  },

  /** The animals that live in the garden, and how the habitat grows. */
  habitat: {
    burrow: { x: 18, z: 1.5 },
    deerBed: { x: 4, z: -16.4 },
    hive: { x: 13.2, z: -11.6 },
    leafPile: { x: 17.4, z: -7.4 },
    drey: { x: 9, z: -7 },
    tick: 1,
    growUp: 200,
    nestStage: 45,
    spawnRain: 25,
    spawnStage: 50,
    secondHive: 10,
    saplingGrow: 600,
    caps: { rabbits: 6, birds: 10, deer: 4, frogs: 10, saplings: 3, caches: 12 },
    buryEvery: 15,
    digEvery: 25,
  },

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
    /** Wildflower seed it scatters in a ring round the strike. */
    seeds: 10,
    ring: 1.5,
    /** It greens the grass round it once the scorch has faded. */
    greenRadius: 3,
    green: 0.85,
    /** Seconds until the scorch has a fairy ring of mushrooms. */
    ringAfter: 30,
    /** Scorch marks remembered; the oldest go first. */
    marks: 40,
  },

  /** The lawn: rain greens it for good, and leaves it wet for a while. */
  ground: {
    /** Grid cell size, metres. */
    cell: 0.5,
    /** The lawn starts parched and patchy. */
    startGreen: 0.14,
    greenNoise: 0.16,
    /** Green added per second under the middle of a reference-sized shower. */
    greenRate: 0.4,
    /** Green grass creeps into drier neighbours: fraction of the gap per second. */
    creep: 0.02,
    creepEvery: 0.5,
    /** A plant coming into bloom greens the grass round it. */
    bloomGreen: { radius: 2.4, amount: 0.75 },
    /** Surface water added per second under the middle of a reference shower. */
    wetRate: 0.25,
    maxWet: 1.6,
    /** Above this the water stands in puddles. */
    puddleAt: 1,
    /** Surface water lost per second, in any light and in full sun. */
    dryBase: 0.003,
    drySun: 0.008,
    /** Seconds for laid-over grass to stand most of the way back up. */
    bendFade: 25,
    /** How quickly the breeze lays the grass over (1/s). */
    bendRate: 3,
  },

  /** The big one: charged by a greener, bloomier garden, called with G. */
  storm: {
    /** Charge at the start, so the first storm isn't far off. */
    start: 0.6,
    perBloom: 0.2,
    /** Charge per square metre of lawn the player greens (the storm's own doesn't count). */
    perGreen: 1 / 80,
    lasts: 22,
    radius: 6.5,
    softEdge: 3,
    /** Rain per unit area, relative to a reference-sized cloud. */
    rain: 0.6,
    /** Plant moisture added per second, never past what each plant likes. */
    soak: 0.04,
    strikes: 4,
    /** It blows as it rains, laying the grass over. */
    gust: 0.9,
  },

  /** The weather over the whole garden, and the seasons. */
  climate: {
    /** Seconds for one weather to blend into the next. */
    blend: 10,
    /** On its own the weather changes every so often (seconds, min and max). */
    changeEvery: [80, 150] as [number, number],
    /** Sunlight let through by each kind of day. */
    light: { clear: 1, overcast: 0.66, rain: 0.58, fog: 0.62, snow: 0.6 },
    /** A rainy day waters every plant this much per second, never past what it likes. */
    rainSoak: 0.006,
    /** ...wets the ground and slowly greens the lawn. */
    rainWet: 0.02,
    rainGreen: 0.004,
    /** Fog damps every plant towards `T.fog.target` at this rate. */
    fogDamp: 0.006,
    /** Which weather each season tends to, when left to itself. */
    tends: {
      spring: { clear: 0.35, overcast: 0.25, rain: 0.3, fog: 0.1, snow: 0 },
      summer: { clear: 0.6, overcast: 0.15, rain: 0.2, fog: 0.05, snow: 0 },
      autumn: { clear: 0.3, overcast: 0.3, rain: 0.25, fog: 0.15, snow: 0 },
      winter: { clear: 0.3, overcast: 0.25, rain: 0, fog: 0.1, snow: 0.35 },
    },
    /** Drifting clouds: how many for each kind of day, and how fast they go (m/s). */
    clouds: { clear: 5, overcast: 8, rain: 8, fog: 0, snow: 7, speed: 1.4, height: [15, 21] as [number, number] },
    /** How much a drifting cloud dims the ground under it on a clear day. */
    cloudShade: 0.5,
  },

  seasons: {
    /** Seconds each season lasts on its own: one day and night. */
    length: 240,
    /** Seconds for one season's look to blend into the next. */
    blend: 25,
    /** Growth speed in each season. Winter is a rest: nothing grows, nothing is lost. */
    growth: { spring: 1.15, summer: 1, autumn: 0.6, winter: 0 },
    /** Soil dries this much faster or slower than the base rate. */
    drying: { spring: 0.9, summer: 1, autumn: 0.7, winter: 0.3 },
  },

  /** Snow and fallen leaves, which settle on the ground and go in their own time. */
  cover: {
    /** Snow depth added per second of snowy weather, 0 bare to 1 deep. */
    snowRate: 0.01,
    /** ...and how fast it melts: in winter sunshine, and in any other season. */
    meltWinter: 0.002,
    meltWarm: 0.02,
    /** Leaf fall per second near trees in autumn. */
    leafFall: 0.006,
    leafReach: 3.5,
    /** Leaves rot down out of autumn at this rate. */
    leafRot: 0.002,
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
    /** Height the cloud floats at: above the oak and the roof. */
    height: 9,
    /** Drawn this much wider than the rain it drops: a cloud is bigger than its shower. */
    look: 2.3,
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
    viewWidth: 26,
    startX: -2,
    startZ: 1,
    /** Looking down at this angle (degrees above the horizon). */
    pitch: 32,
    /** Zoom limits as a multiple of the starting distance, and per scroll pixel. */
    zoom: [0.45, 1.7] as [number, number],
    zoomPerPixel: 0.0012,
    /** Turn speed with Q / E (radians per second). */
    turnSpeed: 1.4,
    /** Pan speed (m/s) from keys or from the pointer at the screen's edge. */
    panSpeed: 9,
    edge: 0.06,
  },

  input: {
    /** Spread change per key press. */
    spreadPerKey: 0.15,
  },

  render: {
    /** How dark the cloud's shade looks, as a brightness multiplier. */
    shadeDarkness: 0.55,
    rainDrops: 3000,
    rainSpeed: 16,
    grassClumps: 45000,
    fogBanks: 40,
    /** Seconds a fog bank lingers after it settles. */
    fogLingers: 60,
    /** Weather over the whole garden, drawn round the view. */
    precip: { rain: 2500, rainRate: 2200, snow: 3500, snowRate: 900, cloudSnowRate: 500, leaves: 220, leafRate: 14, reach: 22, height: 18 },
    /** Drifting clouds overhead, and how many puffs each. */
    skyPuffs: 9,
    /** Visitors drawn larger than life, so they read from the usual height. */
    critterSize: { bird: 2.2, rabbit: 1.5, frog: 2, duck: 1.4 },
    beesPerPlant: 2,
    butterflies: 24,
    fireflies: 140,
    windWisps: 60,
  },

  audio: {
    rainGain: 0.22,
    windGain: 0.35,
    rainFade: 0.6,
    thunderGain: 0.5,
    /** Songs a second per bird about, crickets on a warm night, frog croaks a second per frog. */
    songRate: 0.06,
    songGain: 0.035,
    cricketGain: 0.012,
    croakRate: 0.25,
    croakGain: 0.05,
    honkGain: 0.04,
  },
}
