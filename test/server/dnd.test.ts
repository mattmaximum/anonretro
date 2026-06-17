import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE boards (id TEXT PRIMARY KEY, admin_token TEXT NOT NULL, blur_enabled INTEGER NOT NULL DEFAULT 1, format TEXT NOT NULL, last_activity_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, creator_token TEXT NOT NULL, column_id TEXT NOT NULL, content TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0, position REAL, group_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE card_groups (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, column_id TEXT NOT NULL, position REAL NOT NULL, created_at INTEGER NOT NULL);
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
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c1', boardId, 'tok', col, 'Card 1', 1, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c2', boardId, 'tok', col, 'Card 2', 2, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c3', boardId, 'tok', col, 'Card 3', 3, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c4', boardId, 'tok', col, 'Card 4', 4, now, now)
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
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c5', boardId, 'tok', 'col-sad', 'Other col', 1, now, now)
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
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('solo', 'b2', 'tok', col, 'Alone', 1, now, now)
    const reorder = makeReorderTx(db)
    const ok = reorder('b2', 'solo', col, 0)
    expect(ok).toBe(true)
    const rows = getPositions(db, 'b2', col)
    expect(rows[0].position).toBe(1)
  })

  it('does not affect cards in other columns', () => {
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('other', boardId, 'tok', 'col-sad', 'Sad card', 5, now, now)
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

// ── Phase 2 helpers ───────────────────────────────────────────────────────────

function makeGroupTxs(db: Database.Database) {
  const insertCardGroup = db.prepare('INSERT INTO card_groups (id, board_id, column_id, position, created_at) VALUES (?, ?, ?, ?, ?)')
  const getCardGroup = db.prepare<[string]>('SELECT * FROM card_groups WHERE id = ?')
  const getCardsByGroup = db.prepare<[string]>('SELECT * FROM cards WHERE group_id = ? ORDER BY position ASC, created_at ASC')
  const setCardGroup = db.prepare<[string | null, string]>('UPDATE cards SET group_id = ? WHERE id = ?')
  const updateCardPosition = db.prepare<[number, string]>('UPDATE cards SET position = ? WHERE id = ?')
  const updateCardGroupPosition = db.prepare<[number, string]>('UPDATE card_groups SET position = ? WHERE id = ?')
  const deleteCardGroup = db.prepare<[string]>('DELETE FROM card_groups WHERE id = ?')
  const getMaxPositionInColumn = db.prepare<[string, string]>('SELECT COALESCE(MAX(position), 0) as max_pos FROM cards WHERE board_id = ? AND column_id = ?')
  const getMaxGroupPositionInColumn = db.prepare<[string, string]>('SELECT COALESCE(MAX(position), 0) as max_pos FROM card_groups WHERE board_id = ? AND column_id = ?')

  const renormalizeColumn = db.transaction((boardId: string, columnId: string) => {
    type PosRow = { id: string; position: number; kind: 'card' | 'group' }
    const ungroupedCards = db.prepare<[string, string]>(
      "SELECT id, position, 'card' as kind FROM cards WHERE board_id = ? AND column_id = ? AND group_id IS NULL ORDER BY position ASC"
    ).all(boardId, columnId) as PosRow[]
    const groups = db.prepare<[string, string]>(
      "SELECT id, position, 'group' as kind FROM card_groups WHERE board_id = ? AND column_id = ? ORDER BY position ASC"
    ).all(boardId, columnId) as PosRow[]
    const all = [...ungroupedCards, ...groups].sort((a, b) => a.position - b.position)
    for (let i = 0; i < all.length; i++) {
      if (all[i].kind === 'card') updateCardPosition.run(i + 1, all[i].id)
      else updateCardGroupPosition.run(i + 1, all[i].id)
    }
  })

  const createGroup = db.transaction((groupId: string, boardId: string, columnId: string, cardId1: string, cardId2: string, now: number) => {
    const card2 = db.prepare<[string]>('SELECT position FROM cards WHERE id = ?').get(cardId2) as { position: number } | undefined
    const position = card2?.position ?? 1
    insertCardGroup.run(groupId, boardId, columnId, position, now)
    setCardGroup.run(groupId, cardId1)
    updateCardPosition.run(2, cardId1)
    setCardGroup.run(groupId, cardId2)
    updateCardPosition.run(1, cardId2)
    return true
  })

  const addToGroup = db.transaction((cardId: string, groupId: string) => {
    const group = getCardGroup.get(groupId) as any
    if (!group) return false
    const children = getCardsByGroup.all(groupId) as any[]
    setCardGroup.run(groupId, cardId)
    updateCardPosition.run(children.length + 1, cardId)
    return true
  })

  const unstackCard = db.transaction((cardId: string, groupId: string, boardId: string) => {
    const group = getCardGroup.get(groupId) as any
    if (!group) return { ok: false, dissolved: false }
    setCardGroup.run(null, cardId)
    const remaining = getCardsByGroup.all(groupId) as { id: string }[]
    if (remaining.length <= 1) {
      if (remaining.length === 1) {
        setCardGroup.run(null, remaining[0].id)
        updateCardPosition.run(group.position, remaining[0].id)
      }
      deleteCardGroup.run(groupId)
      updateCardPosition.run(group.position + 0.5, cardId)
      renormalizeColumn(boardId, group.column_id)
      return { ok: true, dissolved: true }
    }
    for (let i = 0; i < remaining.length; i++) updateCardPosition.run(i + 1, remaining[i].id)
    updateCardPosition.run(group.position + 0.5, cardId)
    renormalizeColumn(boardId, group.column_id)
    return { ok: true, dissolved: false }
  })

  const moveGroup = db.transaction((groupId: string, targetColumnId: string, boardId: string, now: number) => {
    const group = getCardGroup.get(groupId) as any
    if (!group) return false
    const { max_pos: maxCardPos } = getMaxPositionInColumn.get(boardId, targetColumnId) as { max_pos: number }
    const { max_pos: maxGroupPos } = getMaxGroupPositionInColumn.get(boardId, targetColumnId) as { max_pos: number }
    const newPos = Math.max(maxCardPos, maxGroupPos) + 1
    db.prepare<[string, number, string]>('UPDATE card_groups SET column_id = ?, position = ? WHERE id = ?').run(targetColumnId, newPos, groupId)
    const children = getCardsByGroup.all(groupId) as { id: string }[]
    for (const child of children) {
      db.prepare<[string, number, string]>('UPDATE cards SET column_id = ?, updated_at = ? WHERE id = ?').run(targetColumnId, now, child.id)
    }
    return true
  })

  return { createGroup, addToGroup, unstackCard, moveGroup }
}

describe('admin:card_group_create', () => {
  let db: Database.Database
  const boardId = 'board1'
  const col = 'col-mad'
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c1', boardId, 'tok', col, 'Card 1', 1, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c2', boardId, 'tok', col, 'Card 2', 2, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c3', boardId, 'tok', col, 'Card 3', 3, now, now)
  })

  it('creates a group and sets group_id on both cards', () => {
    const { createGroup } = makeGroupTxs(db)
    createGroup('g1', boardId, col, 'c1', 'c2', now)
    const c1 = db.prepare('SELECT group_id FROM cards WHERE id = ?').get('c1') as { group_id: string }
    const c2 = db.prepare('SELECT group_id FROM cards WHERE id = ?').get('c2') as { group_id: string }
    expect(c1.group_id).toBe('g1')
    expect(c2.group_id).toBe('g1')
  })

  it('group takes position of the target card (c2)', () => {
    const { createGroup } = makeGroupTxs(db)
    createGroup('g1', boardId, col, 'c1', 'c2', now)
    const group = db.prepare('SELECT position FROM card_groups WHERE id = ?').get('g1') as { position: number }
    expect(group.position).toBe(2) // c2 was at position 2
  })

  it('card_groups table has one entry', () => {
    const { createGroup } = makeGroupTxs(db)
    createGroup('g1', boardId, col, 'c1', 'c2', now)
    const count = (db.prepare('SELECT COUNT(*) as n FROM card_groups').get() as { n: number }).n
    expect(count).toBe(1)
  })
})

describe('admin:card_group_add', () => {
  let db: Database.Database
  const boardId = 'board1'
  const col = 'col-mad'
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c1', boardId, 'tok', col, 'Card 1', 1, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c2', boardId, 'tok', col, 'Card 2', 2, now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c3', boardId, 'tok', col, 'Card 3', 3, now, now)
    db.prepare('INSERT INTO card_groups VALUES (?, ?, ?, ?, ?)').run('g1', boardId, col, 2, now)
    db.prepare("UPDATE cards SET group_id = 'g1' WHERE id = 'c1'").run()
    db.prepare("UPDATE cards SET group_id = 'g1' WHERE id = 'c2'").run()
  })

  it('adds a third card to an existing group', () => {
    const { addToGroup } = makeGroupTxs(db)
    const ok = addToGroup('c3', 'g1')
    expect(ok).toBe(true)
    const c3 = db.prepare('SELECT group_id FROM cards WHERE id = ?').get('c3') as { group_id: string }
    expect(c3.group_id).toBe('g1')
  })

  it('returns false for non-existent group', () => {
    const { addToGroup } = makeGroupTxs(db)
    const ok = addToGroup('c3', 'nonexistent')
    expect(ok).toBe(false)
  })
})

describe('admin:card_unstack', () => {
  let db: Database.Database
  const boardId = 'board1'
  const col = 'col-mad'
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    db.prepare('INSERT INTO card_groups VALUES (?, ?, ?, ?, ?)').run('g1', boardId, col, 2, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('c1', boardId, 'tok', col, 'Card 1', 1, 'g1', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('c2', boardId, 'tok', col, 'Card 2', 2, 'g1', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('c3', boardId, 'tok', col, 'Card 3', 3, 'g1', now, now)
    // Also one ungrouped card at position 4
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('c4', boardId, 'tok', col, 'Card 4', 4, now, now)
  })

  it('removes card from group and group survives with 2+ remaining', () => {
    const { unstackCard } = makeGroupTxs(db)
    const result = unstackCard('c1', 'g1', boardId)
    expect(result.ok).toBe(true)
    expect(result.dissolved).toBe(false)
    const c1 = db.prepare('SELECT group_id FROM cards WHERE id = ?').get('c1') as { group_id: string | null }
    expect(c1.group_id).toBeNull()
    const group = db.prepare('SELECT id FROM card_groups WHERE id = ?').get('g1')
    expect(group).toBeTruthy()
  })

  it('dissolves group when last child is removed (1 left)', () => {
    const db2 = createTestDb()
    db2.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    db2.prepare('INSERT INTO card_groups VALUES (?, ?, ?, ?, ?)').run('g2', boardId, col, 2, now)
    db2.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('a', boardId, 'tok', col, 'A', 1, 'g2', now, now)
    db2.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('b', boardId, 'tok', col, 'B', 2, 'g2', now, now)
    const { unstackCard } = makeGroupTxs(db2)
    const result = unstackCard('a', 'g2', boardId)
    expect(result.ok).toBe(true)
    expect(result.dissolved).toBe(true)
    // Group must be deleted
    const group = db2.prepare('SELECT id FROM card_groups WHERE id = ?').get('g2')
    expect(group).toBeFalsy()
    // Remaining card b must have group_id = null
    const b = db2.prepare('SELECT group_id FROM cards WHERE id = ?').get('b') as { group_id: string | null }
    expect(b.group_id).toBeNull()
  })


  it('renormalizes all column items (cards + groups) to sequential integers', () => {
    const { unstackCard } = makeGroupTxs(db)
    unstackCard('c1', 'g1', boardId)
    // All items in the column (ungrouped cards + groups) should have sequential 1-based positions
    const ungrouped = db.prepare(
      'SELECT position FROM cards WHERE board_id = ? AND column_id = ? AND group_id IS NULL ORDER BY position ASC'
    ).all(boardId, col) as { position: number }[]
    const groupRows = db.prepare(
      'SELECT position FROM card_groups WHERE board_id = ? AND column_id = ? ORDER BY position ASC'
    ).all(boardId, col) as { position: number }[]
    const all = [...ungrouped.map(r => r.position), ...groupRows.map(r => r.position)].sort((a, b) => a - b)
    expect(all.every(p => Number.isInteger(p))).toBe(true)
    for (let i = 0; i < all.length; i++) expect(all[i]).toBe(i + 1)
  })

  it('returns ok=false for non-existent group', () => {
    const { unstackCard } = makeGroupTxs(db)
    const result = unstackCard('c1', 'nonexistent', boardId)
    expect(result.ok).toBe(false)
  })
})

describe('admin:card_group_move', () => {
  let db: Database.Database
  const boardId = 'board1'
  const col1 = 'col-mad'
  const col2 = 'col-sad'
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    db.prepare('INSERT INTO card_groups VALUES (?, ?, ?, ?, ?)').run('g1', boardId, col1, 1, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('c1', boardId, 'tok', col1, 'Card 1', 1, 'g1', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').run('c2', boardId, 'tok', col1, 'Card 2', 2, 'g1', now, now)
  })

  it('moves group and all child cards to target column', () => {
    const { moveGroup } = makeGroupTxs(db)
    moveGroup('g1', col2, boardId, now)
    const group = db.prepare('SELECT column_id FROM card_groups WHERE id = ?').get('g1') as { column_id: string }
    expect(group.column_id).toBe(col2)
    const c1 = db.prepare('SELECT column_id FROM cards WHERE id = ?').get('c1') as { column_id: string }
    const c2 = db.prepare('SELECT column_id FROM cards WHERE id = ?').get('c2') as { column_id: string }
    expect(c1.column_id).toBe(col2)
    expect(c2.column_id).toBe(col2)
  })

  it('returns false for non-existent group', () => {
    const { moveGroup } = makeGroupTxs(db)
    const ok = moveGroup('nonexistent', col2, boardId, now)
    expect(ok).toBe(false)
  })

  it('appends group after existing items in target column', () => {
    // Add an existing card in col2 at position 5
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)').run('existing', boardId, 'tok', col2, 'Existing', 5, now, now)
    const { moveGroup } = makeGroupTxs(db)
    moveGroup('g1', col2, boardId, now)
    const group = db.prepare('SELECT position FROM card_groups WHERE id = ?').get('g1') as { position: number }
    expect(group.position).toBeGreaterThan(5)
  })
})

describe('position migration — rowid uniqueness', () => {
  it('initializing position = rowid gives unique positions across all cards', () => {
    const db = createTestDb()
    const boardId = 'b'
    const now = Math.floor(Date.now() / 1000)
    db.prepare('INSERT INTO boards VALUES (?, ?, 1, ?, ?, ?)').run(boardId, 'adm', 'mad-sad-glad', now, now)
    // Insert two cards with the same created_at (same second — would collide on created_at)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)').run('x1', boardId, 'tok', 'col', 'A', now, now)
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)').run('x2', boardId, 'tok', 'col', 'B', now, now)
    // Run migration
    db.prepare('UPDATE cards SET position = rowid WHERE position IS NULL').run()
    const rows = db.prepare('SELECT position FROM cards WHERE board_id = ? ORDER BY position ASC').all(boardId) as { position: number }[]
    const positions = rows.map(r => r.position)
    // All positions must be unique
    expect(new Set(positions).size).toBe(positions.length)
  })
})
