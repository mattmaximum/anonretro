export const BOARD_CAPACITY = 100
export const CARD_MAX_LENGTH = 500
export const BOARD_EXPIRY_SECONDS = 604800
export const EVICTION_LIMIT = 100_000

export const COLORS = [
  { name: 'Red',    hex: '#EF4444' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Green',  hex: '#22C55E' },
  { name: 'Blue',   hex: '#3B82F6' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Pink',   hex: '#EC4899' },
]

export const ANIMALS = [
  'Owl', 'Fox', 'Cat', 'Dog', 'Elk', 'Gnu', 'Yak', 'Koi', 'Emu', 'Ram',
  'Bee', 'Jay', 'Bat', 'Hen', 'Rat', 'Pig', 'Ape', 'Cow', 'Ant', 'Cub',
  'Otter', 'Raven', 'Snake', 'Crane', 'Skunk', 'Llama', 'Moose', 'Hippo',
  'Rhino', 'Bison', 'Koala', 'Panda', 'Heron', 'Eagle', 'Robin', 'Finch',
  'Stork', 'Gecko', 'Viper', 'Hyena', 'Dingo', 'Lemur', 'Tapir', 'Sloth',
  'Mink', 'Wolf', 'Bear', 'Lynx', 'Swan', 'Dove', 'Ibis', 'Hare', 'Mole',
  'Toad', 'Frog', 'Wren', 'Loon', 'Newt', 'Ibex', 'Quail',
]

// All (color, animal) combinations
export const IDENTITY_POOL: Array<{ color: string; animal: string }> = []
for (const c of COLORS) {
  for (const a of ANIMALS) {
    IDENTITY_POOL.push({ color: c.name, animal: a })
  }
}
