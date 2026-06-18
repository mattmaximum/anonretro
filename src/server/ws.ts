import type { WebSocket } from 'ws'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  getBoard, getCards, getCard, getParticipant, getParticipants, getUserByClerkId,
  insertCard, updateCard, moveCard, deleteCard, voteToggleTx,
  updateBoardBlur, updateBoardLock, updateBoardActivity, updateBoardWrite, updateBoardTitle, updateTimerStart,
  updateTimerPause, updateTimerResume, updateTimerClear,
  getVotesByParticipant, recordDailyCardCreated, recordDailyTimerStarted,
  getMaxPositionInColumn, updateCardPosition, reorderCardTx,
  getCardGroupsByBoard, getCardsByGroup,
  createCardGroupTx, addCardToGroupTx, unstackCardTx, moveCardGroupTx,
  getCardGroup, getMaxGroupPositionInColumn, updateCardGroupPosition,
} from './db.js'
import db from './db.js'
import { nanoid } from 'nanoid'
import { InboundSchema } from '../shared/messages.js'
import type { OutboundMessage, CardData, GroupData, ParticipantData } from '../shared/messages.js'
import { getFormat } from '../shared/formats.js'
import { CARD_MAX_LENGTH, BOARD_EXPIRY_SECONDS } from '../shared/constants.js'
import { armTimer, disarmTimer } from './timer.js'
import { utcDate } from './lib/utils.js'

// ── Registries ────────────────────────────────────────────────────────────────

// participant_token → WebSocket (replace-on-reconnect)
export const participantSockets = new Map<string, WebSocket>()

export function getConnectedCount(): number {
  return participantSockets.size
}

// boardId → Set<WebSocket>
export const boardSockets = new Map<string, Set<WebSocket>>()

function addToBoard(boardId: string, ws: WebSocket) {
  let set = boardSockets.get(boardId)
  if (!set) { set = new Set(); boardSockets.set(boardId, set) }
  set.add(ws)
}

function removeFromBoard(boardId: string, ws: WebSocket) {
  const set = boardSockets.get(boardId)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) boardSockets.delete(boardId)
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export function broadcast(boardId: string, msg: OutboundMessage) {
  const set = boardSockets.get(boardId)
  if (!set) return
  const payload = JSON.stringify(msg)
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(payload)
  }
}

function send(ws: WebSocket, msg: OutboundMessage) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

// ── Scramble helpers ──────────────────────────────────────────────────────────

export function idSeed(id: string): number {
  let h = 0
  for (const c of id) h = Math.imul(31, h) + c.charCodeAt(0) | 0
  return Math.abs(h)
}

export function scrambleWord(word: string, seed: number): string {
  const arr = word.split('')
  let s = seed
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

export function scrambleContent(content: string, cardId: string): string {
  const seed = idSeed(cardId)
  const words = content.trim().split(/\s+/)
  const preview = words.slice(0, 7).map((w, i) => scrambleWord(w, seed + i))
  return words.length > 7 ? preview.join(' ') + ' …' : preview.join(' ')
}

// ── Per-recipient card shape ──────────────────────────────────────────────────

export function buildCard(
  row: { id: string; column_id: string; content: string; creator_token: string; votes: number; created_at: number; position?: number | null; group_id?: string | null; _color?: string; _animal?: string },
  viewerToken: string,
  blurEnabled: boolean,
): CardData {
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
    position:   row.position ?? row.created_at,
    group_id:   row.group_id ?? null,
  }
}

function buildGroups(boardId: string, iMap: Map<string, { color: string; animal: string }>, viewerToken: string, blurEnabled: boolean): GroupData[] {
  const groups = getCardGroupsByBoard.all(boardId) as any[]
  return groups.map(g => {
    const children = (getCardsByGroup.all(g.id) as any[]).map(c => {
      const row = { ...c, _color: iMap.get(c.creator_token)?.color, _animal: iMap.get(c.creator_token)?.animal }
      return buildCard(row, viewerToken, blurEnabled)
    })
    return { id: g.id, column_id: g.column_id, position: g.position, child_cards: children } as GroupData
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildIdentityMap(boardId: string): Map<string, { color: string; animal: string }> {
  const participants = getParticipants.all(boardId) as Array<{ participant_token: string; color: string; animal: string }>
  const map = new Map<string, { color: string; animal: string }>()
  for (const p of participants) map.set(p.participant_token, { color: p.color, animal: p.animal })
  return map
}

function verifyAdmin(board: { admin_token: string }, token: string): boolean {
  return board.admin_token === token
}

function validateColumn(boardFormat: string, columnId: string): boolean {
  return getFormat(boardFormat).columns.some(c => c.id === columnId)
}

function broadcastPresence(boardId: string) {
  const iMap = buildIdentityMap(boardId)
  const sockets = boardSockets.get(boardId)
  if (!sockets) return

  const present: ParticipantData[] = []
  for (const [tok, identity] of iMap) {
    const ws = participantSockets.get(tok)
    if (ws && sockets.has(ws)) {
      present.push({ color: identity.color, animal: identity.animal })
    }
  }
  broadcast(boardId, { type: 'presence', participants: present })
}

function broadcastCardUpdate(boardId: string, cardRow: ReturnType<typeof buildCard> extends CardData ? any : any, blurEnabled: boolean) {
  const sockets = boardSockets.get(boardId)
  if (!sockets) return

  const tokenBySocket = new Map<WebSocket, string>()
  for (const [tok, ws] of participantSockets) {
    if (sockets.has(ws)) tokenBySocket.set(ws, tok)
  }

  for (const [ws, viewerToken] of tokenBySocket) {
    send(ws, { type: 'card_update', card: buildCard(cardRow, viewerToken, blurEnabled) })
  }
}

function broadcastAllCardsToEach(boardId: string, cards: any[], iMap: Map<string, { color: string; animal: string }>, blurEnabled: boolean) {
  const sockets = boardSockets.get(boardId)
  if (!sockets) return

  const tokenBySocket = new Map<WebSocket, string>()
  for (const [tok, ws] of participantSockets) {
    if (sockets.has(ws)) tokenBySocket.set(ws, tok)
  }

  for (const [ws, viewerToken] of tokenBySocket) {
    for (const c of cards) {
      const row = { ...c, _color: iMap.get(c.creator_token)?.color, _animal: iMap.get(c.creator_token)?.animal }
      send(ws, { type: 'card_update', card: buildCard(row, viewerToken, blurEnabled) })
    }
  }
}

function broadcastCardsReordered(boardId: string, blurEnabled: boolean) {
  const iMap = buildIdentityMap(boardId)
  const allCards = getCards.all(boardId) as any[]
  const sockets = boardSockets.get(boardId)
  if (!sockets) return
  const tokenBySocket = new Map<WebSocket, string>()
  for (const [tok, sockWs] of participantSockets) {
    if (sockets.has(sockWs)) tokenBySocket.set(sockWs, tok)
  }
  for (const [sockWs, viewerToken] of tokenBySocket) {
    const perViewerCards = allCards
      .filter((c: any) => !c.group_id)
      .map((c: any) => buildCard({ ...c, _color: iMap.get(c.creator_token)?.color, _animal: iMap.get(c.creator_token)?.animal }, viewerToken, blurEnabled))
    const perViewerGroups = buildGroups(boardId, iMap, viewerToken, blurEnabled)
    send(sockWs, { type: 'cards_reordered', cards: perViewerCards, groups: perViewerGroups })
  }
}

function sendCardsReorderedToSocket(ws: WebSocket, boardId: string, viewerToken: string, blurEnabled: boolean) {
  const iMap = buildIdentityMap(boardId)
  const allCards = getCards.all(boardId) as any[]
  const perViewerCards = allCards
    .filter((c: any) => !c.group_id)
    .map((c: any) => buildCard({ ...c, _color: iMap.get(c.creator_token)?.color, _animal: iMap.get(c.creator_token)?.animal }, viewerToken, blurEnabled))
  const perViewerGroups = buildGroups(boardId, iMap, viewerToken, blurEnabled)
  send(ws, { type: 'cards_reordered', cards: perViewerCards, groups: perViewerGroups })
}

function reorderGroupInColumnTx(boardId: string, groupId: string, columnId: string, newIndex: number) {
  type PosRow = { id: string; position: number; kind: 'card' | 'group' }
  const ungroupedCards = db.prepare<[string, string]>(
    "SELECT id, position, 'card' as kind FROM cards WHERE board_id = ? AND column_id = ? AND group_id IS NULL ORDER BY position ASC"
  ).all(boardId, columnId) as PosRow[]
  const groups = db.prepare<[string, string]>(
    "SELECT id, position, 'group' as kind FROM card_groups WHERE board_id = ? AND column_id = ? ORDER BY position ASC"
  ).all(boardId, columnId) as PosRow[]

  const all = [...ungroupedCards, ...groups].sort((a, b) => a.position - b.position)
  const fromIndex = all.findIndex(r => r.id === groupId)
  if (fromIndex === -1) return false

  const reordered = [...all]
  reordered.splice(fromIndex, 1)
  const clampedIndex = Math.min(newIndex, reordered.length)
  reordered.splice(clampedIndex, 0, all[fromIndex])

  for (let i = 0; i < reordered.length; i++) {
    if (reordered[i].kind === 'card') {
      updateCardPosition.run(i + 1, reordered[i].id)
    } else {
      updateCardGroupPosition.run(i + 1, reordered[i].id)
    }
  }
  return true
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rateLimits = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(token: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(token)
  if (!entry || now - entry.windowStart > 60_000) {
    rateLimits.set(token, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

// ── WebSocket route ───────────────────────────────────────────────────────────

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const ws = socket
    const query = req.query as Record<string, string>
    const boardId = query.board
    const token = query.token

    if (!boardId || !token) { ws.close(4001, 'Missing board or token'); return }

    const boardRow = getBoard.get(boardId) as any
    if (!boardRow) { ws.close(4004, 'Board not found'); return }

    const now = Math.floor(Date.now() / 1000)
    if (now - boardRow.last_activity_at > BOARD_EXPIRY_SECONDS) { ws.close(4004, 'Board expired'); return }

    const participant = getParticipant.get(boardId, token) as any
    if (!participant) { ws.close(4001, 'Invalid token'); return }

    // Register (replace-on-reconnect)
    participantSockets.set(token, ws)
    addToBoard(boardId, ws)

    // Initial board state
    const iMap = buildIdentityMap(boardId)
    const blurEnabled = boardRow.blur_enabled === 1
    const allCards = getCards.all(boardId) as any[]
    const cards = allCards
      .filter((c: any) => !c.group_id)
      .map((c: any) => buildCard({ ...c, _color: iMap.get(c.creator_token)?.color, _animal: iMap.get(c.creator_token)?.animal }, token, blurEnabled))
    const groups = buildGroups(boardId, iMap, token, blurEnabled)

    const myVotedCards = (getVotesByParticipant.all(token, boardId) as Array<{ card_id: string }>).map(r => r.card_id)

    const ownerUser = boardRow.owner_id ? getUserByClerkId.get(boardRow.owner_id) as any : null
    const ownerIsPro = !!(ownerUser?.is_pro || ownerUser?.is_lifetime)

    send(ws, {
      type: 'board_state',
      blur_enabled: blurEnabled,
      locked: boardRow.locked === 1,
      cards,
      groups,
      participants: [...iMap.values()].map(p => ({ color: p.color, animal: p.animal })),
      timer: { expires_at: boardRow.timer_expires_at, paused_at: boardRow.timer_paused_at, label: boardRow.timer_label },
      is_admin: boardRow.admin_token === token,
      format: boardRow.format,
      title: boardRow.title ?? '',
      created_at: boardRow.created_at,
      last_activity_at: boardRow.last_activity_at,
      my_voted_card_ids: myVotedCards,
      owner_is_pro: ownerIsPro,
    })

    broadcastPresence(boardId)

    // ── Message handling ──────────────────────────────────────────────────────

    ws.on('message', (raw) => {
      let parsed: unknown
      try { parsed = JSON.parse(raw.toString()) } catch {
        send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return
      }

      const result = InboundSchema.safeParse(parsed)
      if (!result.success) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }

      const msg = result.data
      const board = getBoard.get(boardId) as any
      if (!board) { send(ws, { type: 'error', code: 'BOARD_EXPIRED' }); return }

      const curMap = buildIdentityMap(boardId)
      const myId = curMap.get(token)

      switch (msg.type) {
        case 'card:add': {
          if (board.locked === 1) { send(ws, { type: 'error', code: 'BOARD_LOCKED' }); return }
          if (!checkRateLimit(token)) { send(ws, { type: 'error', code: 'RATE_LIMITED' }); return }
          if (!validateColumn(board.format, msg.column_id)) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          const id = nanoid(21)
          const ts = Math.floor(Date.now() / 1000)
          const content = msg.content.trim().slice(0, CARD_MAX_LENGTH)
          insertCard.run(id, boardId, token, msg.column_id, content, ts, ts)
          const { max_pos: maxCardPos } = getMaxPositionInColumn.get(boardId, msg.column_id) as { max_pos: number }
          const { max_pos: maxGroupPos } = getMaxGroupPositionInColumn.get(boardId, msg.column_id) as { max_pos: number }
          updateCardPosition.run(Math.max(maxCardPos, maxGroupPos) + 1, id)
          recordDailyCardCreated.run(utcDate())
          updateBoardWrite.run(ts, boardId)
          broadcastCardUpdate(boardId, { id, board_id: boardId, creator_token: token, column_id: msg.column_id, content, votes: 0, created_at: ts, updated_at: ts, _color: myId?.color, _animal: myId?.animal }, board.blur_enabled === 1)
          break
        }

        case 'card:edit': {
          if (board.locked === 1) { send(ws, { type: 'error', code: 'BOARD_LOCKED' }); return }
          const card = getCard.get(msg.id) as any
          if (!card || card.board_id !== boardId) return
          if (card.creator_token !== token) { send(ws, { type: 'error', code: 'NOT_OWNER' }); return }
          const ts = Math.floor(Date.now() / 1000)
          const content = msg.content.trim().slice(0, CARD_MAX_LENGTH)
          updateCard.run(content, ts, msg.id)
          updateBoardWrite.run(ts, boardId)
          broadcastCardUpdate(boardId, { ...card, content, updated_at: ts, _color: myId?.color, _animal: myId?.animal }, board.blur_enabled === 1)
          break
        }

        case 'card:delete': {
          if (board.locked === 1) { send(ws, { type: 'error', code: 'BOARD_LOCKED' }); return }
          const card = getCard.get(msg.id) as any
          if (!card || card.board_id !== boardId) return
          if (card.creator_token !== token) { send(ws, { type: 'error', code: 'NOT_OWNER' }); return }
          deleteCard.run(msg.id)
          updateBoardWrite.run(Math.floor(Date.now() / 1000), boardId)
          broadcast(boardId, { type: 'card_deleted', id: msg.id })
          break
        }

        case 'vote:toggle': {
          if (board.locked === 1) { send(ws, { type: 'error', code: 'BOARD_LOCKED' }); return }
          const card = getCard.get(msg.card_id) as any
          if (!card || card.board_id !== boardId) return
          const { count } = voteToggleTx(msg.card_id, token)
          updateBoardWrite.run(Math.floor(Date.now() / 1000), boardId)
          const ownerMap = buildIdentityMap(boardId)
          const ownerOf = ownerMap.get(card.creator_token)
          broadcastCardUpdate(boardId, { ...card, votes: count, _color: ownerOf?.color, _animal: ownerOf?.animal }, board.blur_enabled === 1)
          break
        }

        case 'admin:blur_toggle': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const newBlur = board.blur_enabled === 1 ? 0 : 1
          updateBoardBlur.run(newBlur, boardId)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          if (newBlur === 0) {
            const allCards = getCards.all(boardId) as any[]
            broadcast(boardId, { type: 'reveal', sequence: allCards.map((c: any) => c.id) })
            // Also send full card data to all recipients
            const refreshMap = buildIdentityMap(boardId)
            broadcastAllCardsToEach(boardId, allCards, refreshMap, false)
          } else {
            broadcast(boardId, { type: 'blur_changed', blur_enabled: true })
            const allCards = getCards.all(boardId) as any[]
            const refreshMap = buildIdentityMap(boardId)
            broadcastAllCardsToEach(boardId, allCards, refreshMap, true)
          }
          break
        }

        case 'admin:reveal': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          updateBoardBlur.run(0, boardId)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          const allCards = getCards.all(boardId) as any[]
          broadcast(boardId, { type: 'reveal', sequence: allCards.map((c: any) => c.id) })
          const revMap = buildIdentityMap(boardId)
          broadcastAllCardsToEach(boardId, allCards, revMap, false)
          break
        }

        case 'admin:lock_toggle': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const newLocked = board.locked === 1 ? 0 : 1
          updateBoardLock.run(newLocked, boardId)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcast(boardId, { type: 'board_locked', locked: newLocked === 1 })
          break
        }

        case 'admin:timer_start': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const expiresAt = Math.floor(Date.now() / 1000) + msg.duration_seconds
          updateTimerStart.run(expiresAt, msg.label, boardId)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          recordDailyTimerStarted.run(utcDate())
          armTimer(boardId, expiresAt)
          broadcast(boardId, { type: 'timer:started', expires_at: expiresAt, label: msg.label })
          break
        }

        case 'admin:timer_pause': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const pausedAt = Math.floor(Date.now() / 1000)
          disarmTimer(boardId)
          updateTimerPause.run(pausedAt, boardId)
          updateBoardActivity.run(pausedAt, boardId)
          broadcast(boardId, { type: 'timer:paused', paused_at: pausedAt, remaining_seconds: Math.max(0, board.timer_expires_at - pausedAt) })
          break
        }

        case 'admin:timer_resume': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const resumeNow = Math.floor(Date.now() / 1000)
          const remaining = board.timer_expires_at - board.timer_paused_at
          const newExpires = resumeNow + remaining
          updateTimerResume.run(newExpires, boardId)
          updateBoardActivity.run(resumeNow, boardId)
          armTimer(boardId, newExpires)
          broadcast(boardId, { type: 'timer:resumed', expires_at: newExpires })
          break
        }

        case 'admin:timer_cancel': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          disarmTimer(boardId)
          updateTimerClear.run(boardId)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcast(boardId, { type: 'timer:cancelled' })
          break
        }

        case 'admin:title_change': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const title = msg.title.trim().slice(0, 100)
          updateBoardTitle.run(title, boardId)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcast(boardId, { type: 'title_changed', title })
          break
        }

        case 'admin:card_move': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const card = getCard.get(msg.card_id) as any
          if (!card || card.board_id !== boardId) return
          // D3: reject if card is grouped — use admin:card_unstack first
          if (card.group_id) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          if (!validateColumn(board.format, msg.column_id)) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          const ts = Math.floor(Date.now() / 1000)
          // Get max position in target column before the move (card not yet there)
          const { max_pos: maxCardPos } = getMaxPositionInColumn.get(boardId, msg.column_id) as { max_pos: number }
          const { max_pos: maxGroupPos } = getMaxGroupPositionInColumn.get(boardId, msg.column_id) as { max_pos: number }
          moveCard.run(msg.column_id, ts, msg.card_id, boardId)
          updateCardPosition.run(Math.max(maxCardPos, maxGroupPos) + 1, card.id)
          updateBoardActivity.run(ts, boardId)
          const ownerMap = buildIdentityMap(boardId)
          const ownerOf = ownerMap.get(card.creator_token)
          broadcastCardUpdate(boardId, { ...card, column_id: msg.column_id, updated_at: ts, _color: ownerOf?.color, _animal: ownerOf?.animal }, board.blur_enabled === 1)
          break
        }

        case 'admin:card_reorder': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const card = getCard.get(msg.card_id) as any
          if (!card || card.board_id !== boardId) return
          if (!validateColumn(board.format, msg.column_id)) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          // Guard: card must already be in the target column (prevent cross-column move via reorder)
          if (card.column_id !== msg.column_id) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          const ok = reorderCardTx(boardId, msg.card_id, msg.column_id, msg.new_index)
          if (!ok) return
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcastCardsReordered(boardId, board.blur_enabled === 1)
          break
        }

        case 'admin:card_group_create': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const card1 = getCard.get(msg.card_id) as any
          const card2 = getCard.get(msg.target_card_id) as any
          // On rejection: send the requesting socket current state to reverse the
          // optimistic removal the client already applied to both cards.
          if (!card1 || card1.board_id !== boardId) { sendCardsReorderedToSocket(ws, boardId, token, board.blur_enabled === 1); return }
          if (!card2 || card2.board_id !== boardId) { sendCardsReorderedToSocket(ws, boardId, token, board.blur_enabled === 1); return }
          if (card1.group_id || card2.group_id) { sendCardsReorderedToSocket(ws, boardId, token, board.blur_enabled === 1); return }
          if (card1.column_id !== card2.column_id) { sendCardsReorderedToSocket(ws, boardId, token, board.blur_enabled === 1); return }
          if (msg.card_id === msg.target_card_id) { sendCardsReorderedToSocket(ws, boardId, token, board.blur_enabled === 1); return }
          const groupId = nanoid(21)
          createCardGroupTx(groupId, boardId, card1.column_id, msg.card_id, msg.target_card_id, Math.floor(Date.now() / 1000))
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcastCardsReordered(boardId, board.blur_enabled === 1)
          break
        }

        case 'admin:card_group_add': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const card = getCard.get(msg.card_id) as any
          const group = getCardGroup.get(msg.group_id) as any
          if (!card || card.board_id !== boardId) return
          if (!group || group.board_id !== boardId) return
          if (card.group_id) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          const now = Math.floor(Date.now() / 1000)
          const ok = addCardToGroupTx(msg.card_id, msg.group_id, now)
          if (!ok) return
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcastCardsReordered(boardId, board.blur_enabled === 1)
          break
        }

        case 'admin:card_unstack': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const card = getCard.get(msg.card_id) as any
          if (!card || card.board_id !== boardId) return
          if (card.group_id !== msg.group_id) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          const result = unstackCardTx(msg.card_id, msg.group_id, boardId)
          if (!result.ok) return
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcastCardsReordered(boardId, board.blur_enabled === 1)
          break
        }

        case 'admin:card_group_move': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const group = getCardGroup.get(msg.group_id) as any
          if (!group || group.board_id !== boardId) return
          if (!validateColumn(board.format, msg.column_id)) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          if (group.column_id === msg.column_id) return
          const ok = moveCardGroupTx(msg.group_id, msg.column_id, boardId, Math.floor(Date.now() / 1000))
          if (!ok) return
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcastCardsReordered(boardId, board.blur_enabled === 1)
          break
        }

        case 'admin:card_group_reorder': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const group = getCardGroup.get(msg.group_id) as any
          if (!group || group.board_id !== boardId) return
          if (!validateColumn(board.format, msg.column_id)) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          if (group.column_id !== msg.column_id) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          // Reorder groups and ungrouped cards together using UNION positions
          reorderGroupInColumnTx(boardId, msg.group_id, msg.column_id, msg.new_index)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcastCardsReordered(boardId, board.blur_enabled === 1)
          break
        }
      }
    })

    ws.on('close', () => {
      if (participantSockets.get(token) === ws) participantSockets.delete(token)
      rateLimits.delete(token)
      removeFromBoard(boardId, ws)
      broadcastPresence(boardId)
    })
  })
}
