import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'anonretro.db')
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    clerk_user_id   TEXT UNIQUE NOT NULL,
    is_pro          INTEGER NOT NULL DEFAULT 0,
    lemonsqueezy_order_id TEXT,
    email           TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    id              TEXT PRIMARY KEY,
    admin_token     TEXT NOT NULL,
    blur_enabled    INTEGER NOT NULL DEFAULT 1,
    format          TEXT NOT NULL,
    last_activity_at INTEGER NOT NULL,
    timer_expires_at INTEGER,
    timer_paused_at  INTEGER,
    timer_label      TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    board_id          TEXT NOT NULL,
    participant_token TEXT NOT NULL,
    color             TEXT NOT NULL,
    animal            TEXT NOT NULL,
    joined_at         INTEGER NOT NULL,
    PRIMARY KEY (board_id, participant_token)
  );

  CREATE TABLE IF NOT EXISTS cards (
    id            TEXT PRIMARY KEY,
    board_id      TEXT NOT NULL,
    creator_token TEXT NOT NULL,
    column_id     TEXT NOT NULL,
    content       TEXT NOT NULL,
    votes         INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS votes (
    card_id           TEXT NOT NULL,
    participant_token TEXT NOT NULL,
    PRIMARY KEY (card_id, participant_token)
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    date                TEXT PRIMARY KEY,
    boards_created      INTEGER NOT NULL DEFAULT 0,
    participants_joined INTEGER NOT NULL DEFAULT 0,
    cards_created       INTEGER NOT NULL DEFAULT 0,
    timers_started      INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id);
  CREATE INDEX IF NOT EXISTS idx_participants_board ON participants(board_id);
  CREATE INDEX IF NOT EXISTS idx_votes_card ON votes(card_id);
  CREATE INDEX IF NOT EXISTS idx_boards_activity ON boards(last_activity_at);
`)

// Migrations for columns added after initial schema
try { db.exec("ALTER TABLE boards ADD COLUMN title TEXT NOT NULL DEFAULT ''") } catch { /* already exists */ }
try { db.exec("ALTER TABLE boards ADD COLUMN locked INTEGER NOT NULL DEFAULT 0") } catch { /* already exists */ }
try { db.exec("ALTER TABLE boards ADD COLUMN last_write_at INTEGER") } catch { /* already exists */ }
try { db.exec("CREATE INDEX IF NOT EXISTS idx_boards_write ON boards(last_write_at)") } catch { /* already exists */ }
try { db.exec("ALTER TABLE boards ADD COLUMN owner_id TEXT") } catch { /* already exists */ }
try { db.exec("ALTER TABLE boards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0") } catch { /* already exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN is_lifetime INTEGER NOT NULL DEFAULT 0") } catch { /* already exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN lemonsqueezy_variant_id TEXT") } catch { /* already exists */ }

// ── Prepared statements ──────────────────────────────────────────────────────

export const getBoard = db.prepare<[string]>(
  'SELECT * FROM boards WHERE id = ?'
)

export const insertBoard = db.prepare(
  'INSERT INTO boards (id, admin_token, blur_enabled, format, title, last_activity_at, created_at, owner_id) VALUES (?, ?, 1, ?, ?, ?, ?, ?)'
)

export const getUserByClerkId = db.prepare<[string]>(
  'SELECT * FROM users WHERE clerk_user_id = ?'
)

export const insertUser = db.prepare(
  'INSERT INTO users (clerk_user_id, created_at) VALUES (?, ?)'
)

export const countActiveBoardsByOwner = db.prepare<[string]>(
  'SELECT COUNT(*) as count FROM boards WHERE owner_id = ? AND archived = 0'
)

export const getBoardsByOwner = db.prepare<[string]>(`
  SELECT id, title, format, created_at, last_activity_at, archived
  FROM boards WHERE owner_id = ?
  ORDER BY last_activity_at DESC
`)

export const getBoardByIdAndOwner = db.prepare<[string, string]>(
  'SELECT 1 FROM boards WHERE id = ? AND owner_id = ?'
)

export const archiveBoard = db.prepare<[string, string]>(
  'UPDATE boards SET archived = 1 WHERE id = ? AND owner_id = ?'
)

export const updateBoardTitle = db.prepare<[string, string]>(
  'UPDATE boards SET title = ? WHERE id = ?'
)

export const setUserPro = db.prepare<[number, string, string]>(
  'UPDATE users SET is_pro = ?, lemonsqueezy_order_id = ? WHERE clerk_user_id = ?'
)

export const getUserByOrderId = db.prepare<[string]>(
  'SELECT * FROM users WHERE lemonsqueezy_order_id = ?'
)

export const getAllProUsers = db.prepare(
  'SELECT clerk_user_id, email, lemonsqueezy_order_id, created_at FROM users WHERE is_pro = 1'
)

export const upsertUserProByClerkId = db.prepare(
  `INSERT INTO users (clerk_user_id, is_pro, lemonsqueezy_order_id, email, created_at)
   VALUES (?, 1, ?, ?, ?)
   ON CONFLICT (clerk_user_id) DO UPDATE SET
     is_pro = 1,
     lemonsqueezy_order_id = excluded.lemonsqueezy_order_id,
     email = excluded.email`
)

export const upsertLifetimeByClerkId = db.prepare(
  `INSERT INTO users (clerk_user_id, is_pro, is_lifetime, lemonsqueezy_order_id, lemonsqueezy_variant_id, email, created_at)
   VALUES (?, 1, 1, ?, ?, ?, ?)
   ON CONFLICT (clerk_user_id) DO UPDATE SET
     is_pro = 1,
     is_lifetime = 1,
     lemonsqueezy_order_id = excluded.lemonsqueezy_order_id,
     lemonsqueezy_variant_id = excluded.lemonsqueezy_variant_id,
     email = excluded.email`
)

export const upsertAnnualByClerkId = db.prepare(
  `INSERT INTO users (clerk_user_id, is_pro, email, created_at)
   VALUES (?, 1, ?, ?)
   ON CONFLICT (clerk_user_id) DO UPDATE SET
     is_pro = 1,
     email = excluded.email`
)

export const clearLifetimeOnly = db.prepare<[string]>(
  'UPDATE users SET is_lifetime = 0 WHERE clerk_user_id = ?'
)

export const revokeFullAccess = db.prepare<[string]>(
  'UPDATE users SET is_pro = 0, is_lifetime = 0 WHERE clerk_user_id = ?'
)

export const revokeAnnualByClerkId = db.prepare<[string]>(
  'UPDATE users SET is_pro = 0 WHERE clerk_user_id = ? AND is_lifetime = 0'
)

export const updateBoardActivity = db.prepare<[number, string]>(
  'UPDATE boards SET last_activity_at = ? WHERE id = ?'
)

export const updateBoardWrite = db.prepare<[number, string]>(
  'UPDATE boards SET last_write_at = ? WHERE id = ?'
)

export const updateBoardBlur = db.prepare<[number, string]>(
  'UPDATE boards SET blur_enabled = ? WHERE id = ?'
)

export const updateBoardLock = db.prepare<[number, string]>(
  'UPDATE boards SET locked = ? WHERE id = ?'
)

export const updateTimerStart = db.prepare<[number, string, string]>(
  'UPDATE boards SET timer_expires_at = ?, timer_paused_at = NULL, timer_label = ? WHERE id = ?'
)

export const updateTimerPause = db.prepare<[number, string]>(
  'UPDATE boards SET timer_paused_at = ? WHERE id = ?'
)

export const updateTimerResume = db.prepare<[number, string]>(
  'UPDATE boards SET timer_expires_at = ?, timer_paused_at = NULL WHERE id = ?'
)

export const updateTimerClear = db.prepare<[string]>(
  'UPDATE boards SET timer_expires_at = NULL, timer_paused_at = NULL, timer_label = NULL WHERE id = ?'
)

export const getParticipant = db.prepare<[string, string]>(
  'SELECT * FROM participants WHERE board_id = ? AND participant_token = ?'
)

export const getParticipants = db.prepare<[string]>(
  'SELECT * FROM participants WHERE board_id = ?'
)

export const getUsedIdentities = db.prepare<[string]>(
  'SELECT color, animal FROM participants WHERE board_id = ?'
)

export const countParticipants = db.prepare<[string]>(
  'SELECT COUNT(*) as count FROM participants WHERE board_id = ?'
)

export const insertParticipant = db.prepare(
  'INSERT INTO participants (board_id, participant_token, color, animal, joined_at) VALUES (?, ?, ?, ?, ?)'
)

export const getCards = db.prepare<[string]>(
  'SELECT * FROM cards WHERE board_id = ? ORDER BY created_at ASC'
)

export const getCard = db.prepare<[string]>(
  'SELECT * FROM cards WHERE id = ?'
)

export const insertCard = db.prepare(
  'INSERT INTO cards (id, board_id, creator_token, column_id, content, votes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
)

export const updateCard = db.prepare<[string, number, string]>(
  'UPDATE cards SET content = ?, updated_at = ? WHERE id = ?'
)

export const moveCard = db.prepare<[string, number, string, string]>(
  'UPDATE cards SET column_id = ?, updated_at = ? WHERE id = ? AND board_id = ?'
)

export const deleteCard = db.prepare<[string]>(
  'DELETE FROM cards WHERE id = ?'
)

export const updateCardVotes = db.prepare<[number, string]>(
  'UPDATE cards SET votes = ? WHERE id = ?'
)

export const getVoteCount = db.prepare<[string]>(
  'SELECT COUNT(*) as count FROM votes WHERE card_id = ?'
)

export const getVote = db.prepare<[string, string]>(
  'SELECT 1 FROM votes WHERE card_id = ? AND participant_token = ?'
)

export const insertVote = db.prepare(
  'INSERT OR IGNORE INTO votes (card_id, participant_token) VALUES (?, ?)'
)

export const deleteVote = db.prepare<[string, string]>(
  'DELETE FROM votes WHERE card_id = ? AND participant_token = ?'
)

export const getVotesByParticipant = db.prepare<[string, string]>(
  'SELECT card_id FROM votes WHERE participant_token = ? AND card_id IN (SELECT id FROM cards WHERE board_id = ?)'
)

export const deleteBoard = db.prepare<[string]>(
  'DELETE FROM boards WHERE id = ?'
)

export const getOldestBoards = db.prepare<[number]>(`
  SELECT id FROM boards
  WHERE timer_expires_at IS NULL OR timer_paused_at IS NOT NULL
  ORDER BY last_activity_at ASC
  LIMIT ?
`)

export const countBoards = db.prepare(
  'SELECT COUNT(*) as count FROM boards'
)

export const countActiveBoards = db.prepare<[number]>(
  'SELECT COUNT(*) as count FROM boards WHERE last_activity_at >= ?'
)

export const countHotBoards = db.prepare<[number]>(
  'SELECT COUNT(*) as count FROM boards WHERE last_write_at >= ?'
)

export const deleteExpiredBoards = db.transaction((cutoff: number) => {
  db.prepare('DELETE FROM votes WHERE card_id IN (SELECT id FROM cards WHERE board_id IN (SELECT id FROM boards WHERE last_activity_at < ?))').run(cutoff)
  db.prepare('DELETE FROM cards WHERE board_id IN (SELECT id FROM boards WHERE last_activity_at < ?)').run(cutoff)
  db.prepare('DELETE FROM participants WHERE board_id IN (SELECT id FROM boards WHERE last_activity_at < ?)').run(cutoff)
  db.prepare('DELETE FROM boards WHERE last_activity_at < ?').run(cutoff)
})

export const getActiveTimers = db.prepare(`
  SELECT id, timer_expires_at FROM boards
  WHERE timer_expires_at IS NOT NULL AND timer_paused_at IS NULL
`)

// ── Transactions ─────────────────────────────────────────────────────────────

export const deleteBoardFull = db.transaction((boardId: string) => {
  // Delete in FK-safe order: votes → cards → participants → board
  db.prepare('DELETE FROM votes WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)').run(boardId)
  db.prepare('DELETE FROM cards WHERE board_id = ?').run(boardId)
  db.prepare('DELETE FROM participants WHERE board_id = ?').run(boardId)
  deleteBoard.run(boardId)
})

export const voteToggleTx = db.transaction((cardId: string, token: string) => {
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

export const joinBoardTx = db.transaction((
  boardId: string,
  token: string,
  pool: Array<{ color: string; animal: string }>,
  now: number
) => {
  const { count } = countParticipants.get(boardId) as { count: number }
  if (count >= 100) return { error: 'CAPACITY' as const }

  const existing = getParticipant.get(boardId, token)
  if (existing) return { identity: existing as { color: string; animal: string } }

  const used = getUsedIdentities.all(boardId) as Array<{ color: string; animal: string }>
  const usedSet = new Set(used.map(u => `${u.color}:${u.animal}`))
  const available = pool.filter(p => !usedSet.has(`${p.color}:${p.animal}`))
  if (available.length === 0) return { error: 'CAPACITY' as const }

  // Count usages per color, then restrict to colors at the minimum count
  // so all colors are cycled evenly before any color repeats.
  const colorCount = new Map<string, number>()
  for (const u of used) colorCount.set(u.color, (colorCount.get(u.color) ?? 0) + 1)
  const minCount = Math.min(...available.map(p => colorCount.get(p.color) ?? 0))
  const candidates = available.filter(p => (colorCount.get(p.color) ?? 0) === minCount)

  const identity = candidates[Math.floor(Math.random() * candidates.length)]
  insertParticipant.run(boardId, token, identity.color, identity.animal, now)
  return { identity }
})

// ── Daily stats ───────────────────────────────────────────────────────────────

export const recordDailyBoardCreated = db.prepare(`
  INSERT INTO daily_stats (date, boards_created) VALUES (?, 1)
  ON CONFLICT (date) DO UPDATE SET boards_created = boards_created + 1
`)

export const recordDailyParticipantJoined = db.prepare(`
  INSERT INTO daily_stats (date, participants_joined) VALUES (?, 1)
  ON CONFLICT (date) DO UPDATE SET participants_joined = participants_joined + 1
`)

export const recordDailyCardCreated = db.prepare(`
  INSERT INTO daily_stats (date, cards_created) VALUES (?, 1)
  ON CONFLICT (date) DO UPDATE SET cards_created = cards_created + 1
`)

export const recordDailyTimerStarted = db.prepare(`
  INSERT INTO daily_stats (date, timers_started) VALUES (?, 1)
  ON CONFLICT (date) DO UPDATE SET timers_started = timers_started + 1
`)

export const getDailyStats = db.prepare<[number]>(`
  SELECT date, boards_created, participants_joined, cards_created, timers_started
  FROM daily_stats
  ORDER BY date DESC
  LIMIT ?
`)

export const getFormatBreakdown = db.prepare(`
  SELECT format, COUNT(*) as count FROM boards GROUP BY format ORDER BY count DESC
`)

export const getTotalParticipants = db.prepare(
  'SELECT COUNT(*) as count FROM participants'
)

export const getTotalCards = db.prepare(
  'SELECT COUNT(*) as count FROM cards'
)

export default db
