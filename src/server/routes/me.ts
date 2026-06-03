import type { FastifyInstance } from 'fastify'
import {
  getBoardsByOwner, countActiveBoardsByOwner,
  getUserByClerkId, insertUser, updateBoardTitle, deleteBoardFull,
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

  // DELETE /api/me/boards/:id — hard delete a board and all its data
  fastify.delete('/api/me/boards/:id', async (req, reply) => {
    const clerkUserId = await getAuthUserId(req)
    if (!clerkUserId) return reply.status(401).send({ error: 'Unauthorized.' })

    const { id } = req.params as { id: string }
    const boards = getBoardsByOwner.all(clerkUserId) as Array<{ id: string }>
    if (!boards.find(b => b.id === id)) {
      return reply.status(404).send({ error: 'Board not found.' })
    }

    deleteBoardFull(id)
    return reply.status(204).send(null)
  })

  // PATCH /api/me/boards/:id/title — rename a board from the dashboard
  fastify.patch('/api/me/boards/:id/title', async (req, reply) => {
    const clerkUserId = await getAuthUserId(req)
    if (!clerkUserId) return reply.status(401).send({ error: 'Unauthorized.' })

    const { id } = req.params as { id: string }
    const { title } = req.body as { title?: string }
    if (typeof title !== 'string') return reply.status(400).send({ error: 'title required.' })

    const boards = getBoardsByOwner.all(clerkUserId) as Array<{ id: string }>
    if (!boards.find(b => b.id === id)) {
      return reply.status(404).send({ error: 'Board not found.' })
    }

    updateBoardTitle.run(title.trim().slice(0, 100), id)
    return reply.status(204).send(null)
  })
}
