import type { FastifyInstance } from 'fastify'
import httpProxy from '@fastify/http-proxy'

/**
 * Proxies /clerk/* to Clerk's Frontend API so ad blockers can't distinguish
 * Clerk requests from first-party traffic.
 *
 * The upstream FAPI host is derived from the publishable key at startup —
 * no extra env var required. The key format is:
 *   pk_test_<base64(host + "$")>  or  pk_live_<base64(host + "$")>
 *
 * ClerkProvider must be configured with proxyUrl="/clerk" (see main.tsx).
 *
 * After deploying: go to Clerk Dashboard → Configure → Domains → set the
 * proxy URL to https://anonretro.com/clerk
 */

function fapiUrlFromPublishableKey(key: string): string | null {
  try {
    const base64 = key.split('_')[2]
    if (!base64) return null
    const host = Buffer.from(base64, 'base64').toString('utf8').replace(/\$$/, '')
    return `https://${host}`
  } catch {
    return null
  }
}

export default async function clerkProxyRoutes(fastify: FastifyInstance) {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY
    ?? process.env.VITE_CLERK_PUBLISHABLE_KEY // fallback for local dev

  if (!publishableKey) {
    fastify.log.warn('CLERK_PUBLISHABLE_KEY not set — Clerk proxy disabled')
    return
  }

  const upstream = fapiUrlFromPublishableKey(publishableKey)
  if (!upstream) {
    fastify.log.warn('Could not derive Clerk FAPI URL from publishable key — proxy disabled')
    return
  }

  fastify.log.info(`Clerk proxy: /clerk → ${upstream}`)

  await fastify.register(httpProxy, {
    upstream,
    prefix: '/clerk',
    rewritePrefix: '/',
    http2: false,
  })
}
