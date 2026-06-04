export interface RetroFormat {
  id: string
  name: string
  columns: string[]
}

export const FORMATS: RetroFormat[] = [
  { id: 'well-unwell-actions', name: 'What went well / Unwell / Actions', columns: ['What went well', "What didn't go well", 'Action items'] },
  { id: 'mad-sad-glad',        name: 'Mad / Sad / Glad',        columns: ['Mad', 'Sad', 'Glad'] },
  { id: '4ls',                 name: '4Ls',                     columns: ['Liked', 'Learned', 'Lacked', 'Longed For'] },
  { id: 'start-stop-continue', name: 'Start / Stop / Continue', columns: ['Start', 'Stop', 'Continue'] },
  { id: 'sailboat',            name: 'Sailboat',                columns: ['⛵ Wind/Sails', '⚓ Anchors', '🪨 Rocks', '☀️ Sun/Island'] },
  { id: 'rose-bud-thorn',      name: 'Rose, Bud, Thorn',        columns: ['🌹 Rose', '🌱 Bud', '🌵 Thorn'] },
]

export const DEFAULT_FORMAT = FORMATS[0]

export function getFormat(id: string): RetroFormat {
  return FORMATS.find(f => f.id === id) ?? DEFAULT_FORMAT
}
