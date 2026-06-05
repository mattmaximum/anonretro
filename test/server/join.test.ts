import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

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
      created_at INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      locked INTEGER NOT NULL DEFAULT 0,
      last_write_at INTEGER,
      owner_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE participants (
      board_id TEXT NOT NULL,
      participant_token TEXT NOT NULL,
      color TEXT NOT NULL,
      animal TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (board_id, participant_token)
    );
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

    // Count usages per color, restrict to colors at the minimum count
    // so all colors are cycled evenly before any color repeats.
    const colorCount = new Map<string, number>()
    for (const u of used) colorCount.set(u.color, (colorCount.get(u.color) ?? 0) + 1)
    const minCount = Math.min(...available.map(p => colorCount.get(p.color) ?? 0))
    const candidates = available.filter(p => (colorCount.get(p.color) ?? 0) === minCount)

    const identity = candidates[Math.floor(Math.random() * candidates.length)]
    insertParticipant.run(boardId, token, identity.color, identity.animal, now)
    return { identity }
  })
}

// 2 animals per color, 3 colors — lets us test color cycling
const POOL = [
  { color: 'Red', animal: 'Owl' },
  { color: 'Red', animal: 'Fox' },
  { color: 'Blue', animal: 'Cat' },
  { color: 'Blue', animal: 'Dog' },
  { color: 'Green', animal: 'Elk' },
  { color: 'Green', animal: 'Gnu' },
]

describe('join transaction', () => {
  let db: Database.Database
  const boardId = 'board1'
  let joinTx: ReturnType<typeof makeJoinTx>

  beforeEach(() => {
    db = createTestDb()
    const now = Math.floor(Date.now() / 1000)
    db.prepare(
      'INSERT INTO boards (id, admin_token, format, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(boardId, 'adm', 'mad-sad-glad', now, now)
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
    const bigPool = Array.from({ length: 101 }, (_, i) => ({ color: `C${i}`, animal: `A${i}` }))
    for (let i = 0; i < 100; i++) {
      const r = joinTx(boardId, `tok${i}`, bigPool, Date.now())
      expect(r.error).toBeUndefined()
    }
    const result = joinTx(boardId, 'tok100', bigPool, Date.now())
    expect(result.error).toBe('CAPACITY')
  })

  describe('even color distribution', () => {
    it('third participant is assigned the underrepresented color', () => {
      // Fill one Red and one Blue slot so Green has count=0 (minimum)
      const singlePool = [
        { color: 'Red', animal: 'Owl' },
        { color: 'Blue', animal: 'Cat' },
        { color: 'Green', animal: 'Elk' },
      ]
      joinTx(boardId, 'tok1', singlePool, Date.now()) // Red or Blue or Green
      joinTx(boardId, 'tok2', singlePool, Date.now()) // different one
      // Determine which color has count 0
      const used = db.prepare(
        'SELECT color FROM participants WHERE board_id = ?'
      ).all(boardId) as Array<{ color: string }>
      const usedColors = new Set(used.map(u => u.color))
      const missing = ['Red', 'Blue', 'Green'].find(c => !usedColors.has(c))!

      const r3 = joinTx(boardId, 'tok3', singlePool, Date.now())
      expect(r3.identity?.color).toBe(missing)
    })

    it('never assigns a color with higher count when lower-count colors are available', () => {
      // Give Red 2 participants before starting
      const redOnlyPool = [{ color: 'Red', animal: 'Owl' }, { color: 'Red', animal: 'Fox' }]
      joinTx(boardId, 'tok1', redOnlyPool, Date.now())
      joinTx(boardId, 'tok2', redOnlyPool, Date.now())

      // Now with full pool: Blue and Green both have count 0, Red has count 2
      const r = joinTx(boardId, 'tok3', POOL, Date.now())
      expect(r.identity?.color).not.toBe('Red')
    })

    it('allows any color once all are tied', () => {
      // One Red, one Blue, one Green — all tied at 1
      const singlePool = [
        { color: 'Red', animal: 'Owl' },
        { color: 'Blue', animal: 'Cat' },
        { color: 'Green', animal: 'Elk' },
      ]
      joinTx(boardId, 'tok1', singlePool, Date.now())
      joinTx(boardId, 'tok2', singlePool, Date.now())
      joinTx(boardId, 'tok3', singlePool, Date.now())

      // All 3 colors now at count 1; next pick can be any color
      const r = joinTx(boardId, 'tok4', POOL, Date.now())
      expect(r.error).toBeUndefined()
      expect(['Red', 'Blue', 'Green']).toContain(r.identity?.color)
    })
  })
})
