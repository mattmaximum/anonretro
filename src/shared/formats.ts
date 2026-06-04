export interface RetroColumn {
  id: string
  label: string
}

export interface RetroFormat {
  id: string
  name: string
  columns: RetroColumn[]
}

export const FORMATS: RetroFormat[] = [
  {
    id: 'well-unwell-actions',
    name: 'What went well / Unwell / Actions',
    columns: [
      { id: 'went-well',     label: '✅ What went well' },
      { id: 'didnt-go-well', label: "❌ What didn't go well" },
      { id: 'actions',       label: '🎯 Action items' },
    ],
  },
  {
    id: 'mad-sad-glad',
    name: 'Mad / Sad / Glad',
    columns: [
      { id: 'mad',  label: '😤 Mad' },
      { id: 'sad',  label: '😔 Sad' },
      { id: 'glad', label: '😊 Glad' },
    ],
  },
  {
    id: '4ls',
    name: '4Ls',
    columns: [
      { id: 'liked',      label: '👍 Liked' },
      { id: 'learned',    label: '🧠 Learned' },
      { id: 'lacked',     label: '🚫 Lacked' },
      { id: 'longed-for', label: '💭 Longed For' },
    ],
  },
  {
    id: 'start-stop-continue',
    name: 'Start / Stop / Continue',
    columns: [
      { id: 'start',    label: '🚀 Start' },
      { id: 'stop',     label: '🛑 Stop' },
      { id: 'continue', label: '♻️ Continue' },
    ],
  },
  {
    id: 'sailboat',
    name: 'Sailboat',
    columns: [
      { id: 'wind-sails', label: '⛵ Wind/Sails' },
      { id: 'anchors',    label: '⚓ Anchors' },
      { id: 'rocks',      label: '🪨 Rocks' },
      { id: 'sun-island', label: '☀️ Sun/Island' },
    ],
  },
  {
    id: 'rose-bud-thorn',
    name: 'Rose, Bud, Thorn',
    columns: [
      { id: 'rose',  label: '🌹 Rose' },
      { id: 'bud',   label: '🌱 Bud' },
      { id: 'thorn', label: '🌵 Thorn' },
    ],
  },
]

export const DEFAULT_FORMAT = FORMATS[0]

export function getFormat(id: string): RetroFormat {
  return FORMATS.find(f => f.id === id) ?? DEFAULT_FORMAT
}
