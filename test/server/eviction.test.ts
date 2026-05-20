import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'

// Stand-alone eviction logic mirrored from routes/boards.ts
// We test the logic directly against an in-memory DB to avoid Fastify wiring.

function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE boards (
      id TEXT PRIMARY KEY,
      admin_token TEXT NOT NULL,
      blur_enabled INTEGER NOT NULL DEFAULT 1,
      format TEXT NOT NULL,
      last_activity_at INTEGER NOT NULL,
      timer_expires_at INTEGER,
      timer_paused_at INTEGER,
      timer_label TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE participants (
      board_id TEXT NOT NULL,
      participant_token TEXT NOT NULL,
      color TEXT NOT NULL,
      animal TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (board_id, participant_token)
    );
    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      creator_token TEXT NOT NULL,
      column_id TEXT NOT NULL,
      content TEXT NOT NULL,
      votes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE votes (
      card_id TEXT NOT NULL,
      participant_token TEXT NOT NULL,
      PRIMARY KEY (card_id, participant_token)
    );
  `)
  return db
}

function insertBoard(db: Database.Database, opts: {
  id?: string
  timerExpiresAt?: number | null
  timerPausedAt?: number | null
  lastActivityAt?: number
} = {}) {
  const id = opts.id ?? nanoid(12)
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO boards (id, admin_token, format, last_activity_at, timer_expires_at, timer_paused_at, created_at)
    VALUES (?, ?, 'mad-sad-glad', ?, ?, ?, ?)
  `).run(id, nanoid(8), opts.lastActivityAt ?? now, opts.timerExpiresAt ?? null, opts.timerPausedAt ?? null, now)
  return id
}

// Eviction: delete oldest boards (by last_activity_at) skipping timer-active ones.
function runEviction(db: Database.Database, limit: number, batchSize = 50) {
  const count = (db.prepare('SELECT COUNT(*) as count FROM boards').get() as { count: number }).count
  if (count <= limit) return { deleted: 0, skipped: 0 }

  const toDelete = count - limit
  const candidates = db.prepare(`
    SELECT id FROM boards
    WHERE timer_expires_at IS NULL OR timer_paused_at IS NOT NULL
    ORDER BY last_activity_at ASC
    LIMIT ?
  `).all(Math.min(toDelete, batchSize)) as Array<{ id: string }>

  const deleteBoard = db.prepare('DELETE FROM boards WHERE id = ?')
  let deleted = 0
  for (const { id } of candidates) {
    deleteBoard.run(id)
    deleted++
  }
  return { deleted, skipped: toDelete - deleted }
}

describe('eviction', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('does not evict when count is at limit', () => {
    for (let i = 0; i < 5; i++) insertBoard(db)
    const result = runEviction(db, 5)
    expect(result.deleted).toBe(0)
    expect(db.prepare('SELECT COUNT(*) as count FROM boards').get()).toMatchObject({ count: 5 })
  })

  it('evicts oldest boards when over limit', () => {
    const old1 = insertBoard(db, { lastActivityAt: 1000 })
    const old2 = insertBoard(db, { lastActivityAt: 2000 })
    const recent = insertBoard(db, { lastActivityAt: 9000 })

    runEviction(db, 2)

    const remaining = (db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>).map(r => r.id)
    expect(remaining).toContain(recent)
    // old boards deleted (oldest first)
    expect(remaining).not.toContain(old1)
  })

  it('CRITICAL: does NOT evict boards with active running timer', () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 300
    const timerActive = insertBoard(db, {
      timerExpiresAt: futureExpiry,
      timerPausedAt: null,
      lastActivityAt: 100, // oldest activity — would normally be evicted first
    })
    // Fill with newer boards to push count over limit
    for (let i = 0; i < 5; i++) insertBoard(db, { lastActivityAt: 9000 + i })

    runEviction(db, 5)

    const remaining = (db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>).map(r => r.id)
    expect(remaining).toContain(timerActive)
  })

  it('evicts boards with PAUSED timer (not active)', () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 100
    const timerPaused = insertBoard(db, {
      timerExpiresAt: pastExpiry,
      timerPausedAt: pastExpiry - 60, // paused before expiry
      lastActivityAt: 100,
    })
    for (let i = 0; i < 5; i++) insertBoard(db, { lastActivityAt: 9000 + i })

    runEviction(db, 5)

    const remaining = (db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>).map(r => r.id)
    expect(remaining).not.toContain(timerPaused)
  })

  it('protects boards with un-cleared expired timer (timer_expires_at set, paused_at null)', () => {
    // An expired timer that hasn't been cleared by the timer service yet still has
    // timer_expires_at set and paused_at IS NULL. The eviction query looks for:
    //   timer_expires_at IS NULL OR timer_paused_at IS NOT NULL
    // An un-cleared expired timer matches NEITHER condition, so it is treated the same
    // as a running timer and NOT evicted. This is intentional — the timer service
    // (handleExpired → updateTimerClear) clears it shortly after, at which point
    // eviction is free to reclaim it.
    const pastExpiry = Math.floor(Date.now() / 1000) - 600
    const timerExpiredUncleaned = insertBoard(db, {
      timerExpiresAt: pastExpiry,
      timerPausedAt: null,
      lastActivityAt: 100,
    })
    for (let i = 0; i < 5; i++) insertBoard(db, { lastActivityAt: 9000 + i })

    runEviction(db, 5)
    const remaining = (db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>).map(r => r.id)
    // Un-cleared expired timer → NOT evicted (correct behavior — timer svc will clear it)
    expect(remaining).toContain(timerExpiredUncleaned)
  })
})
