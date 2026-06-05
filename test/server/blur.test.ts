import { describe, it, expect } from 'vitest'
import { buildCard, scrambleContent } from '../../src/server/ws.js'

const CARD = {
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
    expect(card.content).not.toBe('This is secret')
    expect(card.content).toBeTruthy()
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

  it('truncates to first 7 words + … for longer cards', () => {
    const longCard = { ...CARD, content: 'One two three four five six seven eight nine' }
    const card = buildCard(longCard, 'other-user', true)
    expect(card.content).toMatch(/…$/)
    const words = card.content.replace(' …', '').split(' ')
    expect(words).toHaveLength(7)
  })

  it('short cards (≤7 words) have no ellipsis', () => {
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

  it('scrambleContent produces the expected preview format for long input', () => {
    const result = scrambleContent('one two three four five six seven eight', 'test-id')
    const parts = result.split(' ')
    expect(parts[parts.length - 1]).toBe('…')
    expect(parts.length).toBe(8) // 7 words + '…'
  })
})
