/**
 * Things to try. Each one teaches a part of the weather, and the text says how,
 * so the journal doubles as the instructions.
 */
export const WISHES = [
  { id: 'first-bloom', text: 'Bring a plant into bloom.' },
  { id: 'three-at-once', text: 'Water three plants at once. Scroll to spread the cloud wide.' },
  { id: 'wildflower', text: 'Blow seed into the lawn: hold Shift beside something in bloom.' },
  { id: 'rainbow', text: 'Make a rainbow: a good long shower while the sun is out.' },
  { id: 'fog', text: 'Wrap the ferns under the oak in fog. Press F.' },
  { id: 'lightning', text: 'Call down lightning: gather a full cloud tight, then press L or double-click.' },
  { id: 'apples', text: 'Grow apples. The blossom needs a breeze to set fruit.' },
  { id: 'sunflower', text: 'Grow a sunflower taller than the fence.' },
  { id: 'moonflower', text: 'Watch a moonflower open at night.' },
  { id: 'fireflies', text: 'Stay up after dark with ten wildflowers in the lawn.' },
  { id: 'meadow', text: 'Fill the lawn with sixty wildflowers.' },
  { id: 'all', text: 'Bring every plant in the garden into bloom.' },
] as const

export type WishId = (typeof WISHES)[number]['id']
