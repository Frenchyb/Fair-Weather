/**
 * The sun's day: how bright it is, and where the sun sits, at any moment.
 * Pure maths, shared by the simulation (light, shade under the oak) and the
 * renderer (lighting, shadows), so what plants feel matches what you see.
 */
import { T } from '../tuning'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Seconds into the current day-and-night cycle. */
export function cycleTime(time: number) {
  const { length, night, start } = T.day
  const cycle = length + night
  return (((time + start * length) % cycle) + cycle) % cycle
}

/** 1 in full day, 0 at night, easing through dawn and dusk. */
export function daylight(time: number) {
  const t = cycleTime(time)
  const { length, twilight } = T.day
  if (t >= length) return 0
  return smooth(clamp01(t / twilight)) * smooth(clamp01((length - t) / twilight))
}

/** 0 at sunrise, 1 at sunset; meaningless at night. */
export function dayProgress(time: number) {
  return clamp01(cycleTime(time) / T.day.length)
}

/**
 * Direction towards the sun (not normalised). It rises in the east (+x), climbs
 * over the south (+z, behind the viewer) and sets in the west, so shadows fall
 * away from the viewer at midday.
 */
export function sunDirection(time: number) {
  const a = Math.PI * dayProgress(time)
  return { x: Math.cos(a) * 0.9, y: 0.25 + Math.sin(a) * 0.9, z: 0.55 }
}

/** Where a shadow cast from `height` above (x, z) lands on the ground. */
export function shadowOf(x: number, z: number, height: number, time: number) {
  const s = sunDirection(time)
  return { x: x - (s.x / s.y) * height, z: z - (s.z / s.y) * height }
}
