import { verifyToken } from '@clerk/backend'
import type { FastifyRequest, FastifyReply } from 'fastify'

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY

/**
 * Returns the Clerk user ID from the request's Authorization header,
 * or null if unauthenticated or if Clerk is not configured (dev mode).
 */
export async function getAuthUserId(req: FastifyRequest): Promise<string | null> {
  if (!CLERK_SECRET_KEY) return null // dev mode: no auth configured
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY })
    return payload.sub
  } catch {
    return null
  }
}

/**
 * Fastify preHandler that rejects unauthenticated requests with 401.
 * Pass as: { preHandler: requireAuth }
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = await getAuthUserId(req)
  if (!userId) {
    reply.status(401).send({ error: 'Sign in to create boards.' })
  }
}
