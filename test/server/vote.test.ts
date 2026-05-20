import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'

function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE boards (id TEXT PRIMARY KEY, admin_token TEXT NOT NULL, blur_enabled INTEGER NOT NULL DEFAULT 1, format TEXT NOT NULL, last_activity_at INTEGER NOT NULL, timer_expires_at INTEGER, timer_paused_at INTEGER, timer_label TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE participants (board_id TEXT NOT NULL, participant_token TEXT NOT NULL, color TEXT NOT NULL, animal TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (board_id, participant_token));
    CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, creator_token TEXT NOT NULL, column_id TEXT NOT NULL, content TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE votes (card_id TEXT NOT NULL, participant_token TEXT NOT NULL, PRIMARY KEY (card_id, participant_token));
    CREATE INDEX idx_votes_card ON votes(card_id);
  `)
  return db
}

function makeVoteToggleTx(db: Database.Database) {
  const getVote = db.prepare<[string, string]>('SELECT 1 FROM votes WHERE card_id = ? AND participant_token = ?')
  const insertVote = db.prepare('INSERT OR IGNORE INTO votes (card_id, participant_token) VALUES (?, ?)')
  const deleteVote = db.prepare<[string, string]>('DELETE FROM votes WHERE card_id = ? AND participant_token = ?')
  const getVoteCount = db.prepare<[string]>('SELECT COUNT(*) as count FROM votes WHERE card_id = ?')
  const updateCardVotes = db.prepare<[number, string]>('UPDATE cards SET votes = ? WHERE id = ?')

  return db.transaction((cardId: string, token: string) => {
    const existing = getVote.get(cardId, token)
    if (existing) {
      deleteVote.run(cardId, token)
    } else {
      insertVote.run(cardId, token)
    }
    const { count } = getVoteCount.get(cardId) as { count: number }
    updateCardVotes.run(count, cardId)
    return { count, voted: !existing }
  })
}

describe('vote toggle', () => {
  let db: Database.Database
  const boardId = 'board1'
  const cardId = 'card1'
  const token1 = 'tok1'
  const token2 = 'tok2'

  beforeEach(() => {
    db = createTestDb()
    const now = Math.floor(Date.now() / 1000)
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, NULL, NULL, NULL, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(cardId, boardId, token1, 'Mad', 'test', now, now)
  })

  it('adds a vote and returns count=1', () => {
    const toggle = makeVoteToggleTx(db)
    const result = toggle(cardId, token1)
    expect(result.count).toBe(1)
    expect(result.voted).toBe(true)
  })

  it('removes vote on second call (toggle off)', () => {
    const toggle = makeVoteToggleTx(db)
    toggle(cardId, token1)
    const result = toggle(cardId, token1)
    expect(result.count).toBe(0)
    expect(result.voted).toBe(false)
  })

  it('two users voting gives count=2', () => {
    const toggle = makeVoteToggleTx(db)
    toggle(cardId, token1)
    const result = toggle(cardId, token2)
    expect(result.count).toBe(2)
  })

  it('votes column on cards table is READ-VERIFIED (authoritative count)', () => {
    const toggle = makeVoteToggleTx(db)
    toggle(cardId, token1)
    toggle(cardId, token2)
    toggle(cardId, token1) // token1 removes their vote

    // READ-VERIFIED: count comes from COUNT(*) in votes table, not incremented field
    const card = db.prepare('SELECT votes FROM cards WHERE id = ?').get(cardId) as { votes: number }
    expect(card.votes).toBe(1) // only token2 remains
  })

  it('double-vote is idempotent (INSERT OR IGNORE)', () => {
    const toggle = makeVoteToggleTx(db)
    toggle(cardId, token1)
    // Simulate a concurrent duplicate by calling the raw insert directly
    db.prepare('INSERT OR IGNORE INTO votes (card_id, participant_token) VALUES (?, ?)').run(cardId, token1)
    const { count } = db.prepare('SELECT COUNT(*) as count FROM votes WHERE card_id = ?').get(cardId) as { count: number }
    expect(count).toBe(1) // still 1, not 2
  })
})
