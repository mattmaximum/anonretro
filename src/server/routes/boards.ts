import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'crypto'
import { nanoid } from 'nanoid'
import {
  insertBoard, getBoard, getParticipant, countBoards,
  getOldestBoards, deleteBoard, joinBoardTx,
  recordDailyBoardCreated, recordDailyParticipantJoined, deleteBoardFull,
} from '../db.js'
import { IDENTITY_POOL, EVICTION_LIMIT } from '../../shared/constants.js'
import { FORMATS } from '../../shared/formats.js'
import { broadcast } from '../ws.js'

export default async function boardRoutes(fastify: FastifyInstance) {
  // POST /api/boards — create a new board
  fastify.post('/api/boards', async (req, reply) => {
    const body = req.body as { format?: string }
    const format = FORMATS.find(f => f.id === body?.format) ?? FORMATS[0]
    const id = nanoid(21)
    const adminToken = randomBytes(16).toString('hex')
    const now = Math.floor(Date.now() / 1000)

    insertBoard.run(id, adminToken, format.id, now, now)
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
    if (now - ((board as any).created_at) > 86400) {
      return reply.status(410).send({ error: 'Board has expired.' })
    }

    // Re-use existing token if provided (re-join)
    const existingToken = body?.participant_token
    if (existingToken) {
      const existing = getParticipant.get(id, existingToken)
      if (existing) {
        const p = existing as { color: string; animal: string }
        return reply.send({ participant_token: existingToken, color: p.color, animal: p.animal })
      }
    }

    const token = randomBytes(16).toString('hex')
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

    return reply.status(204).send()
  })
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function runEviction() {
  try {
    const { count } = countBoards.get() as { count: number }
    if (count <= EVICTION_LIMIT) return

    const toDelete = count - EVICTION_LIMIT
    const oldest = getOldestBoards.all(toDelete) as Array<{ id: string }>
    for (const row of oldest) {
      deleteBoard.run(row.id)
    }
  } catch (err) {
    console.error('Eviction error (non-fatal):', err)
  }
}
