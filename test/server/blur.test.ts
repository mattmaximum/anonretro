import { describe, it, expect } from 'vitest'

// buildCard logic extracted for unit testing (mirrors ws.ts buildCard)
interface CardRow {
  id: string
  column_id: string
  content: string
  creator_token: string
  votes: number
  created_at: number
  _color?: string
  _animal?: string
}

function idSeed(id: string): number {
  let h = 0
  for (const c of id) h = Math.imul(31, h) + c.charCodeAt(0) | 0
  return Math.abs(h)
}

function scrambleWord(word: string, seed: number): string {
  const arr = word.split('')
  let s = seed
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

function scrambleContent(content: string, cardId: string): string {
  const seed = idSeed(cardId)
  const words = content.trim().split(/\s+/)
  const preview = words.slice(0, 3).map((w, i) => scrambleWord(w, seed + i))
  return words.length > 3 ? preview.join(' ') + ' …' : preview.join(' ')
}

function buildCard(row: CardRow, viewerToken: string, blurEnabled: boolean) {
  const isOwn = row.creator_token === viewerToken
  const blur = blurEnabled && !isOwn
  const author = [row._color, row._animal].filter(Boolean).join(' ') || null
  return {
    id:         row.id,
    column_id:  row.column_id,
    content:    blur ? scrambleContent(row.content, row.id) : row.content,
    blur,
    votes:      row.votes,
    author,
    is_own:     isOwn,
    created_at: row.created_at,
  }
}

const CARD: CardRow = {
  id: 'c1', column_id: 'Mad', content: 'This is secret', creator_token: 'creator',
  votes: 0, created_at: 1000, _color: 'Teal', _animal: 'Axolotl',
}

describe('buildCard — server-side blur', () => {
  it('owner sees real content when blur is enabled', () => {
    const card = buildCard(CARD, 'creator', true)
    expect(card.content).toBe('This is secret')
    expect(card.blur).toBe(false)
    expect(card.is_own).toBe(true)
    expect(card.author).toBe('Teal Axolotl')
  })

  it('non-owner receives scrambled content (not null, not real) when blurred', () => {
    const card = buildCard(CARD, 'other-user', true)
    expect(card.content).not.toBe('This is secret') // not the real content
    expect(card.content).toBeTruthy()               // not null/empty
    expect(card.blur).toBe(true)
    expect(card.is_own).toBe(false)
  })

  it('author is always sent regardless of blur state', () => {
    const blurred = buildCard(CARD, 'other-user', true)
    const revealed = buildCard(CARD, 'other-user', false)
    expect(blurred.author).toBe('Teal Axolotl')
    expect(revealed.author).toBe('Teal Axolotl')
  })

  it('non-owner sees real content after reveal', () => {
    const card = buildCard(CARD, 'other-user', false)
    expect(card.content).toBe('This is secret')
    expect(card.blur).toBe(false)
  })

  it('scramble is stable — same card ID always produces the same scramble', () => {
    const a = buildCard(CARD, 'other-user', true)
    const b = buildCard(CARD, 'other-user', true)
    expect(a.content).toBe(b.content)
  })

  it('scramble is consistent across viewers — all non-owners see the same scrambled text', () => {
    const viewer1 = buildCard(CARD, 'viewer-1', true)
    const viewer2 = buildCard(CARD, 'viewer-2', true)
    expect(viewer1.content).toBe(viewer2.content)
  })

  it('truncates to first 3 words + … for longer cards', () => {
    const longCard = { ...CARD, content: 'One two three four five' }
    const card = buildCard(longCard, 'other-user', true)
    expect(card.content).toMatch(/…$/)
    // Only 3 words before the ellipsis
    const words = card.content.replace(' …', '').split(' ')
    expect(words).toHaveLength(3)
  })

  it('short cards (≤3 words) have no ellipsis', () => {
    const shortCard = { ...CARD, content: 'Too slow' }
    const card = buildCard(shortCard, 'other-user', true)
    expect(card.content).not.toContain('…')
  })

  it('votes are always visible regardless of blur state', () => {
    const withVotes = { ...CARD, votes: 5 }
    const blurred = buildCard(withVotes, 'other-user', true)
    const revealed = buildCard(withVotes, 'other-user', false)
    expect(blurred.votes).toBe(5)
    expect(revealed.votes).toBe(5)
  })
})
