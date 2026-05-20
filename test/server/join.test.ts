import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'

function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE boards (id TEXT PRIMARY KEY, admin_token TEXT NOT NULL, blur_enabled INTEGER NOT NULL DEFAULT 1, format TEXT NOT NULL, last_activity_at INTEGER NOT NULL, timer_expires_at INTEGER, timer_paused_at INTEGER, timer_label TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE participants (board_id TEXT NOT NULL, participant_token TEXT NOT NULL, color TEXT NOT NULL, animal TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (board_id, participant_token));
  `)
  return db
}

function makeJoinTx(db: Database.Database) {
  const countParticipants = db.prepare<[string]>('SELECT COUNT(*) as count FROM participants WHERE board_id = ?')
  const getParticipant = db.prepare<[string, string]>('SELECT * FROM participants WHERE board_id = ? AND participant_token = ?')
  const getUsedIdentities = db.prepare<[string]>('SELECT color, animal FROM participants WHERE board_id = ?')
  const insertParticipant = db.prepare('INSERT INTO participants (board_id, participant_token, color, animal, joined_at) VALUES (?, ?, ?, ?, ?)')

  return db.transaction((boardId: string, token: string, pool: Array<{ color: string; animal: string }>, now: number) => {
    const { count } = countParticipants.get(boardId) as { count: number }
    if (count >= 100) return { error: 'CAPACITY' as const }

    const existing = getParticipant.get(boardId, token)
    if (existing) return { identity: existing as { color: string; animal: string } }

    const used = getUsedIdentities.all(boardId) as Array<{ color: string; animal: string }>
    const usedSet = new Set(used.map(u => `${u.color}:${u.animal}`))
    const available = pool.filter(p => !usedSet.has(`${p.color}:${p.animal}`))
    if (available.length === 0) return { error: 'CAPACITY' as const }

    const identity = available[Math.floor(Math.random() * available.length)]
    insertParticipant.run(boardId, token, identity.color, identity.animal, now)
    return { identity }
  })
}

const POOL = [
  { color: 'Teal', animal: 'Axolotl' },
  { color: 'Rose', animal: 'Bear' },
  { color: 'Indigo', animal: 'Crane' },
]

describe('join transaction', () => {
  let db: Database.Database
  const boardId = 'board1'
  let joinTx: ReturnType<typeof makeJoinTx>

  beforeEach(() => {
    db = createTestDb()
    const now = Math.floor(Date.now() / 1000)
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, NULL, NULL, NULL, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    joinTx = makeJoinTx(db)
  })

  it('assigns an identity from the pool', () => {
    const result = joinTx(boardId, 'tok1', POOL, Date.now())
    expect(result.error).toBeUndefined()
    expect(result.identity).toBeDefined()
    const { color, animal } = result.identity!
    expect(POOL.some(p => p.color === color && p.animal === animal)).toBe(true)
  })

  it('returning with the same token re-uses existing identity', () => {
    const first = joinTx(boardId, 'tok1', POOL, Date.now())
    const second = joinTx(boardId, 'tok1', POOL, Date.now())
    expect(second.identity).toMatchObject(first.identity!)
    expect(db.prepare('SELECT COUNT(*) as count FROM participants').get()).toMatchObject({ count: 1 })
  })

  it('two users get different identities', () => {
    const r1 = joinTx(boardId, 'tok1', POOL, Date.now())
    const r2 = joinTx(boardId, 'tok2', POOL, Date.now())
    const key = (i: { color: string; animal: string }) => `${i.color}:${i.animal}`
    expect(key(r1.identity!)).not.toBe(key(r2.identity!))
  })

  it('returns CAPACITY error when pool is exhausted', () => {
    const tinyPool = [{ color: 'Teal', animal: 'Axolotl' }]
    joinTx(boardId, 'tok1', tinyPool, Date.now())
    const result = joinTx(boardId, 'tok2', tinyPool, Date.now())
    expect(result.error).toBe('CAPACITY')
  })

  it('returns CAPACITY error when participant count hits 100', () => {
    // Fill to capacity
    const bigPool = Array.from({ length: 101 }, (_, i) => ({ color: `C${i}`, animal: `A${i}` }))
    for (let i = 0; i < 100; i++) {
      const r = joinTx(boardId, `tok${i}`, bigPool, Date.now())
      expect(r.error).toBeUndefined()
    }
    const result = joinTx(boardId, 'tok100', bigPool, Date.now())
    expect(result.error).toBe('CAPACITY')
  })
})
