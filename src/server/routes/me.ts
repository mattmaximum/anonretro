import type { FastifyInstance } from 'fastify'
import {
  getBoardsByOwner, countActiveBoardsByOwner, archiveBoard,
  getUserByClerkId, insertUser,
} from '../db.js'
import { getAuthUserId } from '../lib/auth.js'

export default async function meRoutes(fastify: FastifyInstance) {
  // GET /api/me/boards — list all boards owned by the current user
  fastify.get('/api/me/boards', async (req, reply) => {
    const clerkUserId = await getAuthUserId(req)
    if (!clerkUserId) return reply.status(401).send({ error: 'Unauthorized.' })

    const boards = getBoardsByOwner.all(clerkUserId)
    const { count: activeCount } = countActiveBoardsByOwner.get(clerkUserId) as { count: number }

    const user = getUserByClerkId.get(clerkUserId) as { is_pro: number } | undefined
    const isPro = user?.is_pro === 1

    return { boards, activeCount, isPro, limit: 3 }
  })

  // PATCH /api/me/boards/:id/archive — archive a board to free up a slot
  fastify.patch('/api/me/boards/:id/archive', async (req, reply) => {
    const clerkUserId = await getAuthUserId(req)
    if (!clerkUserId) return reply.status(401).send({ error: 'Unauthorized.' })

    // Ensure user record exists
    if (!getUserByClerkId.get(clerkUserId)) {
      insertUser.run(clerkUserId, new Date().toISOString())
    }

    const { id } = req.params as { id: string }
    const result = archiveBoard.run(id, clerkUserId)
    if (result.changes === 0) return reply.status(404).send({ error: 'Board not found.' })

    return reply.status(204).send(null)
  })
}
