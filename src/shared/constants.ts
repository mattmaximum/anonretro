export const BOARD_CAPACITY = 100
export const CARD_MAX_LENGTH = 500
export const BOARD_EXPIRY_SECONDS = 86400
export const EVICTION_LIMIT = 5000

export const COLORS = [
  { name: 'Teal',    hex: '#0D9488' },
  { name: 'Indigo',  hex: '#6366F1' },
  { name: 'Rose',    hex: '#F43F5E' },
  { name: 'Amber',   hex: '#F59E0B' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Violet',  hex: '#8B5CF6' },
  { name: 'Sky',     hex: '#0EA5E9' },
  { name: 'Orange',  hex: '#F97316' },
  { name: 'Pink',    hex: '#EC4899' },
  { name: 'Lime',    hex: '#84CC16' },
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
