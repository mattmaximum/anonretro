import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createHmac, timingSafeEqual } from 'crypto'
import { upsertUserProByClerkId, getUserByOrderId, setUserPro } from '../db.js'

const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Scoped raw-body parser — only applies to routes in this plugin.
  // Signature verification requires the exact raw bytes Lemon Squeezy sent.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body: Buffer) => void) => {
      done(null, body)
    }
  )

  fastify.post('/api/webhooks/lemonsqueezy', {
    config: { rateLimit: { max: 200, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (!WEBHOOK_SECRET) {
      return reply.status(400).send({ error: 'Webhook not configured.' })
    }

    const rawBody = req.body as Buffer
    const signature = req.headers['x-signature'] as string | undefined

    if (!signature) return reply.status(400).send({ error: 'Missing X-Signature header.' })

    // Timing-safe comparison to prevent timing attacks
    const digest = Buffer.from(createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex'))
    const sig = Buffer.from(signature)
    if (digest.length !== sig.length || !timingSafeEqual(digest, sig)) {
      return reply.status(401).send({ error: 'Invalid signature.' })
    }

    let payload: any
    try {
      payload = JSON.parse(rawBody.toString())
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON.' })
    }

    const eventName: string = payload?.meta?.event_name ?? ''
    const orderId: string = String(payload?.data?.id ?? '')
    const email: string = payload?.data?.attributes?.user_email ?? ''
    const clerkUserId: string = payload?.meta?.custom_data?.clerk_user_id ?? ''

    switch (eventName) {
      case 'order_created': {
        if (!clerkUserId) {
          // Fallback: log and return 200 so LS doesn't retry — this order
          // had no custom data (e.g. a manual gift order from the LS dashboard)
          fastify.log.warn({ orderId, email }, 'order_created with no clerk_user_id')
          return reply.status(200).send({ received: true })
        }
        upsertUserProByClerkId.run(
          clerkUserId,
          orderId,
          email,
          new Date().toISOString()
        )
        fastify.log.info({ clerkUserId, orderId, email }, 'pro access granted')
        break
      }

      case 'order_refunded': {
        const user = getUserByOrderId.get(orderId) as { clerk_user_id: string } | undefined
        if (user) {
          setUserPro.run(0, '', user.clerk_user_id)
          fastify.log.info({ clerkUserId: user.clerk_user_id, orderId }, 'pro access revoked')
        } else {
          fastify.log.warn({ orderId }, 'order_refunded for unknown order ID')
        }
        break
      }

      default:
        // Return 200 for unhandled events so LS doesn't retry them
        break
    }

    return reply.status(200).send({ received: true })
  })
}
