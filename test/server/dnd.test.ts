import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE boards (id TEXT PRIMARY KEY, admin_token TEXT NOT NULL, blur_enabled INTEGER NOT NULL DEFAULT 1, format TEXT NOT NULL, last_activity_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, creator_token TEXT NOT NULL, column_id TEXT NOT NULL, content TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0, position REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  `)
  return db
}

function makeReorderTx(db: Database.Database) {
  const getCardsByColumn = db.prepare<[string, string]>(
    'SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position ASC, created_at ASC'
  )
  const updateCardPosition = db.prepare<[number, string]>(
    'UPDATE cards SET position = ? WHERE id = ?'
  )

  return db.transaction((boardId: string, cardId: string, columnId: string, newIndex: number) => {
    const rows = getCardsByColumn.all(boardId, columnId) as { id: string }[]
    const fromIndex = rows.findIndex(r => r.id === cardId)
    if (fromIndex === -1) return false

    const reordered = [...rows]
    reordered.splice(fromIndex, 1)
    const clampedIndex = Math.min(newIndex, reordered.length)
    reordered.splice(clampedIndex, 0, rows[fromIndex])

    for (let i = 0; i < reordered.length; i++) {
      updateCardPosition.run(i + 1, reordered[i].id)
    }
    return true
  })
}

function getPositions(db: Database.Database, boardId: string, columnId: string): { id: string; position: number }[] {
  return db.prepare(
    'SELECT id, position FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position ASC'
  ).all(boardId, columnId) as { id: string; position: number }[]
}

describe('admin:card_reorder — reorderCardTx', () => {
  let db: Database.Database
  const boardId = 'board1'
  const col = 'col-mad'
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm-token', 'mad-sad-glad', now, now)
    // Insert 4 cards with clean positions
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('c1', boardId, 'tok', col, 'Card 1', 1, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('c2', boardId, 'tok', col, 'Card 2', 2, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('c3', boardId, 'tok', col, 'Card 3', 3, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('c4', boardId, 'tok', col, 'Card 4', 4, now, now)
  })

  it('moves first card to last position', () => {
    const reorder = makeReorderTx(db)
    const ok = reorder(boardId, 'c1', col, 3)
    expect(ok).toBe(true)
    const order = getPositions(db, boardId, col).map(r => r.id)
    expect(order).toEqual(['c2', 'c3', 'c4', 'c1'])
  })

  it('moves last card to first position', () => {
    const reorder = makeReorderTx(db)
    reorder(boardId, 'c4', col, 0)
    const order = getPositions(db, boardId, col).map(r => r.id)
    expect(order).toEqual(['c4', 'c1', 'c2', 'c3'])
  })

  it('moves middle card one position down', () => {
    const reorder = makeReorderTx(db)
    reorder(boardId, 'c2', col, 2)
    const order = getPositions(db, boardId, col).map(r => r.id)
    expect(order).toEqual(['c1', 'c3', 'c2', 'c4'])
  })

  it('renormalizes positions to clean integers 1,2,3,4', () => {
    const reorder = makeReorderTx(db)
    reorder(boardId, 'c3', col, 0)
    const rows = getPositions(db, boardId, col)
    expect(rows.map(r => r.position)).toEqual([1, 2, 3, 4])
  })

  it('returns false when card not found in column', () => {
    const reorder = makeReorderTx(db)
    const ok = reorder(boardId, 'nonexistent', col, 0)
    expect(ok).toBe(false)
  })

  it('returns false when card is in a different column', () => {
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('c5', boardId, 'tok', 'col-sad', 'Other col', 1, now, now)
    const reorder = makeReorderTx(db)
    // c5 is in col-sad, not col-mad — should return false
    const ok = reorder(boardId, 'c5', col, 0)
    expect(ok).toBe(false)
  })

  it('clamps new_index beyond end of list to last position', () => {
    const reorder = makeReorderTx(db)
    reorder(boardId, 'c1', col, 99)
    const order = getPositions(db, boardId, col).map(r => r.id)
    expect(order).toEqual(['c2', 'c3', 'c4', 'c1'])
  })

  it('no-op when new_index equals current index', () => {
    const reorder = makeReorderTx(db)
    // c2 is at index 1 (0-based); moving it to index 1 should produce same order
    reorder(boardId, 'c2', col, 1)
    const order = getPositions(db, boardId, col).map(r => r.id)
    expect(order).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('single-card column always returns true and position=1', () => {
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run('b2', 'adm2', 'mad-sad-glad', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('solo', 'b2', 'tok', col, 'Alone', 1, now, now)
    const reorder = makeReorderTx(db)
    const ok = reorder('b2', 'solo', col, 0)
    expect(ok).toBe(true)
    const rows = getPositions(db, 'b2', col)
    expect(rows[0].position).toBe(1)
  })

  it('does not affect cards in other columns', () => {
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').run('other', boardId, 'tok', 'col-sad', 'Sad card', 5, now, now)
    const reorder = makeReorderTx(db)
    reorder(boardId, 'c1', col, 3)
    const otherRows = db.prepare("SELECT id FROM cards WHERE column_id = 'col-sad'").all() as { id: string }[]
    expect(otherRows.map(r => r.id)).toContain('other')
  })

  it('works correctly after irregular (float) positions from prior operations', () => {
    // Simulate positions that got messy (e.g. 1.5, 2.5, 4, 8)
    db.prepare("UPDATE cards SET position = 1.5 WHERE id = 'c1'").run()
    db.prepare("UPDATE cards SET position = 2.5 WHERE id = 'c2'").run()
    db.prepare("UPDATE cards SET position = 4 WHERE id = 'c3'").run()
    db.prepare("UPDATE cards SET position = 8 WHERE id = 'c4'").run()
    const reorder = makeReorderTx(db)
    reorder(boardId, 'c1', col, 3)
    const rows = getPositions(db, boardId, col)
    // After reorder, positions must be clean integers
    expect(rows.map(r => r.position)).toEqual([1, 2, 3, 4])
    expect(rows.map(r => r.id)).toEqual(['c2', 'c3', 'c4', 'c1'])
  })
})

describe('position migration — rowid uniqueness', () => {
  it('initializing position = rowid gives unique positions across all cards', () => {
    const db = createTestDb()
    const boardId = 'b'
    const now = Math.floor(Date.now() / 1000)
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    // Insert two cards with the same created_at (same second — would collide on created_at)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)').run('x1', boardId, 'tok', 'col', 'A', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)').run('x2', boardId, 'tok', 'col', 'B', now, now)
    // Run migration
    db.prepare('UPDATE cards SET position = rowid WHERE position IS NULL').run()
    const rows = db.prepare('SELECT position FROM cards WHERE board_id = ? ORDER BY position ASC').all(boardId) as { position: number }[]
    const positions = rows.map(r => r.position)
    // All positions must be unique
    expect(new Set(positions).size).toBe(positions.length)
  })
})
