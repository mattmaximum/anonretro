import type { WebSocket } from 'ws'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  getBoard, getCards, getCard, getParticipant, getParticipants,
  insertCard, updateCard, deleteCard, voteToggleTx,
  updateBoardBlur, updateBoardActivity, updateTimerStart,
  updateTimerPause, updateTimerResume, updateTimerClear,
  getVotesByParticipant, recordDailyCardCreated, recordDailyTimerStarted,
} from './db.js'
import { nanoid } from 'nanoid'
import { InboundSchema } from '../shared/messages.js'
import type { OutboundMessage, CardData, ParticipantData } from '../shared/messages.js'
import { getFormat } from '../shared/formats.js'
import { CARD_MAX_LENGTH } from '../shared/constants.js'
import { armTimer, disarmTimer } from './timer.js'

function utcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

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

function idSeed(id: string): number {
  let h = 0
  for (const c of id) h = Math.imul(31, h) + c.charCodeAt(0) | 0
  return Math.abs(h)
}

function scrambleWord(word: string, seed: number): string {
  const arr = word.split('')
  let s = seed
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

function scrambleContent(content: string, cardId: string): string {
  const seed = idSeed(cardId)
  const words = content.trim().split(/\s+/)
  const preview = words.slice(0, 3).map((w, i) => scrambleWord(w, seed + i))
  return words.length > 3 ? preview.join(' ') + ' …' : preview.join(' ')
}

// ── Per-recipient card shape ──────────────────────────────────────────────────

function buildCard(
  row: { id: string; column_id: string; content: string; creator_token: string; votes: number; created_at: number; _color?: string; _animal?: string },
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
    author,                // always send — never scramble the author
    is_own:     isOwn,
    created_at: row.created_at,
  }
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
    if (now - boardRow.created_at > 86400) { ws.close(4004, 'Board expired'); return }

    const participant = getParticipant.get(boardId, token) as any
    if (!participant) { ws.close(4001, 'Invalid token'); return }

    // Register (replace-on-reconnect)
    participantSockets.set(token, ws)
    addToBoard(boardId, ws)

    // Initial board state
    const iMap = buildIdentityMap(boardId)
    const cards = (getCards.all(boardId) as any[]).map(c => {
      const row = { ...c, _color: iMap.get(c.creator_token)?.color, _animal: iMap.get(c.creator_token)?.animal }
      return buildCard(row, token, boardRow.blur_enabled === 1)
    })

    const myVotedCards = (getVotesByParticipant.all(token, boardId) as Array<{ card_id: string }>).map(r => r.card_id)

    send(ws, {
      type: 'board_state',
      blur_enabled: boardRow.blur_enabled === 1,
      cards,
      participants: [...iMap.values()].map(p => ({ color: p.color, animal: p.animal })),
      timer: { expires_at: boardRow.timer_expires_at, paused_at: boardRow.timer_paused_at, label: boardRow.timer_label },
      is_admin: boardRow.admin_token === token,
      format: boardRow.format,
      title: boardRow.title ?? '',
      created_at: boardRow.created_at,
      my_voted_card_ids: myVotedCards,
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
          if (!checkRateLimit(token)) { send(ws, { type: 'error', code: 'RATE_LIMITED' }); return }
          const fmt = getFormat(board.format)
          if (!fmt.columns.includes(msg.column_id)) { send(ws, { type: 'error', code: 'INVALID_MESSAGE' }); return }
          const id = nanoid(21)
          const ts = Math.floor(Date.now() / 1000)
          const content = msg.content.trim().slice(0, CARD_MAX_LENGTH)
          insertCard.run(id, boardId, token, msg.column_id, content, ts, ts)
          recordDailyCardCreated.run(utcDate())
          updateBoardActivity.run(ts, boardId)
          broadcastCardUpdate(boardId, { id, board_id: boardId, creator_token: token, column_id: msg.column_id, content, votes: 0, created_at: ts, updated_at: ts, _color: myId?.color, _animal: myId?.animal }, board.blur_enabled === 1)
          break
        }

        case 'card:edit': {
          const card = getCard.get(msg.id) as any
          if (!card || card.board_id !== boardId) return
          if (card.creator_token !== token) { send(ws, { type: 'error', code: 'NOT_OWNER' }); return }
          const ts = Math.floor(Date.now() / 1000)
          const content = msg.content.trim().slice(0, CARD_MAX_LENGTH)
          updateCard.run(content, ts, msg.id)
          updateBoardActivity.run(ts, boardId)
          broadcastCardUpdate(boardId, { ...card, content, updated_at: ts, _color: myId?.color, _animal: myId?.animal }, board.blur_enabled === 1)
          break
        }

        case 'card:delete': {
          const card = getCard.get(msg.id) as any
          if (!card || card.board_id !== boardId) return
          if (card.creator_token !== token) { send(ws, { type: 'error', code: 'NOT_OWNER' }); return }
          deleteCard.run(msg.id)
          updateBoardActivity.run(Math.floor(Date.now() / 1000), boardId)
          broadcast(boardId, { type: 'card_deleted', id: msg.id })
          break
        }

        case 'vote:toggle': {
          const card = getCard.get(msg.card_id) as any
          if (!card || card.board_id !== boardId) return
          const { count } = voteToggleTx(msg.card_id, token)
          const ownerMap = buildIdentityMap(boardId)
          const ownerOf = ownerMap.get(card.creator_token)
          broadcastCardUpdate(boardId, { ...card, votes: count, _color: ownerOf?.color, _animal: ownerOf?.animal }, board.blur_enabled === 1)
          break
        }

        case 'admin:blur_toggle': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const newBlur = board.blur_enabled === 1 ? 0 : 1
          updateBoardBlur.run(newBlur, boardId)
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
          const allCards = getCards.all(boardId) as any[]
          broadcast(boardId, { type: 'reveal', sequence: allCards.map((c: any) => c.id) })
          const revMap = buildIdentityMap(boardId)
          broadcastAllCardsToEach(boardId, allCards, revMap, false)
          break
        }

        case 'admin:timer_start': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const expiresAt = Math.floor(Date.now() / 1000) + msg.duration_seconds
          updateTimerStart.run(expiresAt, msg.label, boardId)
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
          broadcast(boardId, { type: 'timer:paused', paused_at: pausedAt, remaining_seconds: Math.max(0, board.timer_expires_at - pausedAt) })
          break
        }

        case 'admin:timer_resume': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          const resumeNow = Math.floor(Date.now() / 1000)
          const remaining = board.timer_expires_at - board.timer_paused_at
          const newExpires = resumeNow + remaining
          updateTimerResume.run(newExpires, boardId)
          armTimer(boardId, newExpires)
          broadcast(boardId, { type: 'timer:resumed', expires_at: newExpires })
          break
        }

        case 'admin:timer_cancel': {
          if (!verifyAdmin(board, msg.admin_token)) { send(ws, { type: 'error', code: 'NOT_ADMIN' }); return }
          disarmTimer(boardId)
          updateTimerClear.run(boardId)
          broadcast(boardId, { type: 'timer:cancelled' })
          break
        }
      }
    })

    ws.on('close', () => {
      if (participantSockets.get(token) === ws) participantSockets.delete(token)
      removeFromBoard(boardId, ws)
      broadcastPresence(boardId)
    })
  })
}
