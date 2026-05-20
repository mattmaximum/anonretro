export interface RetroFormat {
  id: string
  name: string
  columns: string[]
}

export const FORMATS: RetroFormat[] = [
  { id: 'mad-sad-glad',       name: 'Mad / Sad / Glad',       columns: ['Mad', 'Sad', 'Glad'] },
  { id: '4ls',                name: '4Ls',                    columns: ['Liked', 'Learned', 'Lacked', 'Longed For'] },
  { id: 'start-stop-continue',name: 'Start / Stop / Continue',columns: ['Start', 'Stop', 'Continue'] },
  { id: 'well-unwell-actions', name: 'Well / Unwell / Actions', columns: ['What went well', "What didn't go well", 'Action items'] },
]

export const DEFAULT_FORMAT = FORMATS[0]

export function getFormat(id: string): RetroFormat {
  return FORMATS.find(f => f.id === id) ?? DEFAULT_FORMAT
}
