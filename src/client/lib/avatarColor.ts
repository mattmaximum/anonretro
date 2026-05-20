// Returns '#111118' for light bg colors, '#ffffff' for dark — WCAG 4.5:1
export function avatarTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return L > 0.35 ? '#111118' : '#ffffff'
}

// Map color name → hex for avatar backgrounds
export const COLOR_HEX: Record<string, string> = {
  Teal:    '#0D9488',
  Indigo:  '#6366F1',
  Rose:    '#F43F5E',
  Amber:   '#F59E0B',
  Emerald: '#10B981',
  Violet:  '#8B5CF6',
  Sky:     '#0EA5E9',
  Orange:  '#F97316',
  Pink:    '#EC4899',
  Lime:    '#84CC16',
}
