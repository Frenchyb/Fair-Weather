/**
 * Who comes to visit, as opposed to who lives here (`habitat.ts`): ducks on
 * the pond and geese going over in autumn. This only says how many; the
 * renderer decides where they go. Pure maths, no three.js.
 */
import type { Climate } from './climate'

export interface Visitors {
  ducks: number
  geese: boolean
}

export interface Conditions {
  daylight: number
  climate: Climate
}

/** Ducks on the pond by day when it isn't frozen; geese going over in autumn. */
export function visitors(c: Conditions): Visitors {
  const { daylight: day, climate } = c
  return {
    ducks: !climate.dormant && day > 0.3 ? 2 : 0,
    geese: climate.look.autumn > 0.5 && day > 0.5,
  }
}
