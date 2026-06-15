import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'crypto'
import { nanoid } from 'nanoid'
import {
  insertBoard, getBoard, getParticipant, countBoards,
  getOldestBoards, deleteBoard, joinBoardTx,
  recordDailyBoardCreated, recordDailyParticipantJoined, deleteBoardFull,
  deleteExpiredBoards, getUserByClerkId, insertUser, countActiveBoardsByOwner,
} from '../db.js'
import { IDENTITY_POOL, EVICTION_LIMIT, BOARD_EXPIRY_SECONDS, BOARD_EXPIRY_PRO_SECONDS } from '../../shared/constants.js'
import { FORMATS } from '../../shared/formats.js'
import { broadcast } from '../ws.js'
import { getAuthUserId } from '../lib/auth.js'
import { utcDate } from '../lib/utils.js'

export const FREE_BOARD_LIMIT = 1

export default async function boardRoutes(fastify: FastifyInstance) {
  // POST /api/boards — create a new board (requires auth)
  fastify.post('/api/boards', async (req, reply) => {
    const clerkUserId = await getAuthUserId(req)
    if (!clerkUserId) {
      return reply.status(401).send({ error: 'Sign in to create boards.' })
    }

    // Upsert the user record and check board limit
    let user = getUserByClerkId.get(clerkUserId) as { is_pro: number } | undefined
    if (!user) {
      insertUser.run(clerkUserId, new Date().toISOString())
      user = { is_pro: 0 }
    }
    if (!user.is_pro) {
      const { count } = countActiveBoardsByOwner.get(clerkUserId) as { count: number }
      if (count >= FREE_BOARD_LIMIT) {
        return reply.status(402).send({ error: 'BOARD_LIMIT_REACHED' })
      }
    }

    const body = req.body as { format?: string; title?: string }
    const format = FORMATS.find(f => f.id === body?.format) ?? FORMATS[0]
    const title = (body?.title ?? '').trim().slice(0, 100)
    const id = nanoid(21)
    const adminToken = randomBytes(16).toString('hex')
    const now = Math.floor(Date.now() / 1000)

    insertBoard.run(id, adminToken, format.id, title, now, now, clerkUserId)
    recordDailyBoardCreated.run(utcDate())

    // Fire-and-forget eviction — runs after 201 returned
    setImmediate(() => runEviction())

    return reply.status(201).send({ id, admin_token: adminToken, format: format.id })
  })

  // POST /api/boards/:id/join — assign identity and return participant token
  fastify.post('/api/boards/:id/join', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { participant_token?: string }
    const board = getBoard.get(id)
    if (!board) return reply.status(404).send({ error: 'Board not found or expired.' })

    const now = Math.floor(Date.now() / 1000)
    const boardRow = board as { id: string }
    if (now - ((board as any).last_activity_at) > BOARD_EXPIRY_SECONDS) {
      return reply.status(410).send({ error: 'Board has expired.' })
    }

    // Accept client-provided token (re-join or idempotent first-join).
    // Validates format to a 32-char hex string so arbitrary strings can't be injected.
    const rawToken = body?.participant_token
    const clientToken = typeof rawToken === 'string' && /^[0-9a-f]{32}$/.test(rawToken) ? rawToken : null

    if (clientToken) {
      const existing = getParticipant.get(id, clientToken)
      if (existing) {
        const p = existing as { color: string; animal: string }
        return reply.send({ participant_token: clientToken, color: p.color, animal: p.animal })
      }
    }

    // Use the client token for the new participant too (prevents duplicate on double-request)
    const token = clientToken ?? randomBytes(16).toString('hex')
    const result = joinBoardTx(id, token, IDENTITY_POOL, now)

    if ('error' in result) {
      return reply.status(403).send({ error: 'Board at capacity (100 participants).' })
    }

    const { identity } = result
    recordDailyParticipantJoined.run(utcDate())
    return reply.status(201).send({
      participant_token: token,
      color: identity.color,
      animal: identity.animal,
    })
  })

  // DELETE /api/boards/:id — admin-only hard delete
  fastify.delete('/api/boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const adminToken = req.headers['x-admin-token'] as string | undefined
    if (!adminToken) return reply.status(401).send({ error: 'Missing admin token.' })

    const board = getBoard.get(id) as any
    if (!board) return reply.status(404).send({ error: 'Board not found.' })
    if (board.admin_token !== adminToken) return reply.status(403).send({ error: 'Invalid admin token.' })

    // Broadcast before deleting so sockets still exist in boardSockets map
    broadcast(id, { type: 'board_deleted' })
    deleteBoardFull(id)

    return reply.status(204).send(null)
  })
}

function runEviction() {
  try {
    // 1. Time-based: purge boards inactive for 7+ days
    const now = Math.floor(Date.now() / 1000)
    deleteExpiredBoards(now - BOARD_EXPIRY_SECONDS, now - BOARD_EXPIRY_PRO_SECONDS)

    // 2. Safety net: if still over the hard cap, evict oldest
    const { count } = countBoards.get() as { count: number }
    if (count <= EVICTION_LIMIT) return

    const toDelete = count - EVICTION_LIMIT
    const oldest = getOldestBoards.all(toDelete) as Array<{ id: string }>
    for (const row of oldest) {
      deleteBoardFull(row.id)
    }
  } catch (err) {
    console.error('Eviction error (non-fatal):', err)
  }
}
