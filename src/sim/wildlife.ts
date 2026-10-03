/**
 * Who comes to visit, and when. The garden draws its own wildlife as it gets
 * greener and wetter: birds on a green lawn (more after rain, for the worms),
 * rabbits once there is grass worth grazing, frogs at the pond in the rain,
 * ducks whenever the pond isn't frozen, deer at the fence at dawn and dusk,
 * and geese going over in autumn.
 *
 * This only says how many of each; the renderer decides where they wander.
 * Pure maths, no three.js.
 */
import type { Climate } from './climate'
import { dayProgress } from './sky'

export interface Visitors {
  birds: number
  rabbits: number
  frogs: number
  ducks: number
  deer: number
  geese: boolean
}

export interface Conditions {
  time: number
  daylight: number
  climate: Climate
  greenShare: number
  /** Average surface water over the lawn, 0 to 1. */
  wetness: number
  snowCover: number
  storming: boolean
  /** True while the player's cloud is raining on or beside the pond. */
  rainOnPond: boolean
}

export function visitors(c: Conditions): Visitors {
  const { daylight: day, climate } = c
  const rain = climate.rainfall
  const winter = climate.dormant
  const calm = !c.storming
  const p = dayProgress(c.time)
  const twilight = day > 0.02 && (p < 0.16 || p > 0.84)
  return {
    birds:
      day > 0.5 && rain < 0.5 && calm ? Math.round((2 + 6 * c.greenShare + (c.wetness > 0.1 ? 2 : 0)) * (winter ? 0.5 : 1)) : 0,
    rabbits:
      day > 0.35 && c.greenShare > 0.12 && rain < 0.3 && c.snowCover < 0.3 && calm
        ? Math.min(4, 1 + Math.floor(c.greenShare * 5))
        : 0,
    frogs: !winter && (rain > 0.3 || c.rainOnPond || (day < 0.3 && climate.look.summer > 0.5)) ? 4 : 0,
    ducks: !winter && day > 0.3 ? 2 : 0,
    deer: twilight && calm ? 2 : 0,
    geese: climate.look.autumn > 0.5 && day > 0.5,
  }
}
