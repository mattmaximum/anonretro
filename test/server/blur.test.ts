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

function buildCard(row: CardRow, viewerToken: string, blurEnabled: boolean) {
  const isOwn = row.creator_token === viewerToken
  const blur = blurEnabled && !isOwn
  return {
    id:        row.id,
    column_id: row.column_id,
    content:   blur ? null : row.content,
    blur,
    votes:     row.votes,
    author:    blur ? null : [row._color, row._animal].filter(Boolean).join(' ') || null,
    is_own:    isOwn,
    created_at: row.created_at,
  }
}

const CARD: CardRow = {
  id: 'c1', column_id: 'Mad', content: 'This is secret', creator_token: 'creator',
  votes: 0, created_at: 1000, _color: 'Teal', _animal: 'Axolotl',
}

describe('buildCard — server-side blur', () => {
  it('owner sees content when blur is enabled', () => {
    const card = buildCard(CARD, 'creator', true)
    expect(card.content).toBe('This is secret')
    expect(card.blur).toBe(false)
    expect(card.is_own).toBe(true)
    expect(card.author).toBe('Teal Axolotl')
  })

  it('non-owner receives content=null when blur enabled (server-side exclusion)', () => {
    const card = buildCard(CARD, 'other-user', true)
    expect(card.content).toBeNull()
    expect(card.author).toBeNull()
    expect(card.blur).toBe(true)
    expect(card.is_own).toBe(false)
  })

  it('non-owner sees content when blur is disabled (after reveal)', () => {
    const card = buildCard(CARD, 'other-user', false)
    expect(card.content).toBe('This is secret')
    expect(card.author).toBe('Teal Axolotl')
    expect(card.blur).toBe(false)
  })

  it('owner sees content even when blur is disabled', () => {
    const card = buildCard(CARD, 'creator', false)
    expect(card.content).toBe('This is secret')
    expect(card.blur).toBe(false)
  })

  it('votes are always visible regardless of blur state', () => {
    const withVotes = { ...CARD, votes: 5 }
    const blurred = buildCard(withVotes, 'other-user', true)
    const revealed = buildCard(withVotes, 'other-user', false)
    expect(blurred.votes).toBe(5)
    expect(revealed.votes).toBe(5)
  })

  it('no content length leakage — blur always returns null, not a placeholder', () => {
    const longCard = { ...CARD, content: 'A'.repeat(500) }
    const blurred = buildCard(longCard, 'other-user', true)
    expect(blurred.content).toBeNull() // not truncated, not padded — strictly null
  })
})
