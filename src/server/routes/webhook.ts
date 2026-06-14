import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  upsertLifetimeByClerkId,
  upsertAnnualByClerkId,
  clearLifetimeOnly,
  revokeFullAccess,
  revokeAnnualByClerkId,
  getUserByOrderId,
} from '../db.js'

const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET
const LIFETIME_VARIANT_ID = process.env.LEMON_SQUEEZY_LIFETIME_VARIANT_ID
const UPGRADE_VARIANT_ID = process.env.LEMON_SQUEEZY_UPGRADE_VARIANT_ID

type UserRow = { clerk_user_id: string; lemonsqueezy_variant_id: string | null }

function grantLifetimeAccess(clerkUserId: string, orderId: string, email: string, variantId: string) {
  upsertLifetimeByClerkId.run(clerkUserId, orderId, variantId, email, new Date().toISOString())
}

function revokeLifetimeAccess(orderId: string, log: FastifyInstance['log']) {
  const user = getUserByOrderId.get(orderId) as UserRow | undefined
  if (!user) {
    log.warn({ orderId }, 'order_refunded for unknown order ID')
    return
  }
  const variant = user.lemonsqueezy_variant_id
  if (variant === UPGRADE_VARIANT_ID) {
    clearLifetimeOnly.run(user.clerk_user_id)
    log.info({ clerkUserId: user.clerk_user_id, orderId, variant }, '$11 upgrade refunded — cleared is_lifetime, kept is_pro')
  } else if (variant === LIFETIME_VARIANT_ID) {
    revokeFullAccess.run(user.clerk_user_id)
    log.info({ clerkUserId: user.clerk_user_id, orderId, variant }, '$29 lifetime refunded — full access revoked')
  } else {
    revokeFullAccess.run(user.clerk_user_id)
    log.warn({ clerkUserId: user.clerk_user_id, orderId, variant }, 'order_refunded for unknown variant — full revoke (safe default)')
  }
}

function grantAnnualAccess(clerkUserId: string, email: string) {
  upsertAnnualByClerkId.run(clerkUserId, email, new Date().toISOString())
}

function revokeAnnualAccess(clerkUserId: string, subscriptionId: string, log: FastifyInstance['log']) {
  const result = revokeAnnualByClerkId.run(clerkUserId)
  log.info({ clerkUserId, subscriptionId, changes: (result as any).changes }, 'revokeAnnualAccess attempted')
}

export default async function webhookRoutes(fastify: FastifyInstance) {
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
    const variantId: string = String(payload?.data?.attributes?.first_order_item?.variant_id ?? '')
    const subscriptionId: string = String(payload?.data?.id ?? '')

    switch (eventName) {
      case 'order_created': {
        if (!clerkUserId) {
          fastify.log.warn({ orderId, email }, 'order_created with no clerk_user_id')
          return reply.status(200).send({ received: true })
        }
        grantLifetimeAccess(clerkUserId, orderId, email, variantId)
        fastify.log.info({ clerkUserId, orderId, email, variantId }, 'lifetime access granted')
        break
      }

      case 'order_refunded': {
        revokeLifetimeAccess(orderId, fastify.log)
        break
      }

      case 'subscription_created': {
        if (!clerkUserId) {
          fastify.log.warn({ subscriptionId, email }, 'subscription_created with no clerk_user_id')
          return reply.status(200).send({ received: true })
        }
        grantAnnualAccess(clerkUserId, email)
        fastify.log.info({ clerkUserId, subscriptionId, email }, 'annual access granted')
        break
      }

      case 'subscription_cancelled': {
        // Access remains valid until subscription_expired fires — no-op here
        fastify.log.info({ clerkUserId, subscriptionId }, 'subscription_cancelled — no access change')
        break
      }

      case 'subscription_expired': {
        if (!clerkUserId) {
          fastify.log.warn({ subscriptionId }, 'subscription_expired with no clerk_user_id')
          return reply.status(200).send({ received: true })
        }
        revokeAnnualAccess(clerkUserId, subscriptionId, fastify.log)
        break
      }

      default:
        break
    }

    return reply.status(200).send({ received: true })
  })
}
