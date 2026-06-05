import type { FastifyInstance } from 'fastify'

/**
 * Proxies /clerk/* to Clerk's Frontend API so browser requests stay same-origin.
 * Uses fetch with redirect:follow so Clerk's version-resolution 307s are handled
 * server-side and never expose a cross-origin redirect to the browser.
 *
 * ClerkProvider must be configured with proxyUrl="/clerk" (see main.tsx).
 * VITE_CLERK_PROXY_URL=/clerk must be set in .env so the build bakes it in.
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

const SKIP_HEADERS = new Set([
  'host', 'connection', 'transfer-encoding', 'keep-alive', 'content-length',
])

export default async function clerkProxyRoutes(fastify: FastifyInstance) {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY
    ?? process.env.VITE_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    fastify.log.warn('CLERK_PUBLISHABLE_KEY not set — Clerk proxy disabled')
    return
  }

  const upstream = fapiUrlFromPublishableKey(publishableKey)
  if (!upstream) {
    fastify.log.warn('Could not derive Clerk FAPI URL from publishable key — proxy disabled')
    return
  }

  const upstreamHost = new URL(upstream).host
  fastify.log.info(`Clerk proxy: /clerk → ${upstream}`)

  fastify.all('/clerk/*', async (req, reply) => {
    const wildcard = (req.params as Record<string, string>)['*']
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    const targetUrl = `${upstream}/${wildcard}${qs}`

    const forwardHeaders: Record<string, string> = { host: upstreamHost }
    for (const [key, val] of Object.entries(req.headers)) {
      if (SKIP_HEADERS.has(key) || val === undefined) continue
      forwardHeaders[key] = Array.isArray(val) ? val.join(', ') : val
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const body: BodyInit | undefined = hasBody && req.body != null
      ? req.body as unknown as BodyInit
      : undefined

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body,
        redirect: 'follow',
      })

      const SKIP_RES = new Set(['content-encoding', 'transfer-encoding', 'connection'])
      response.headers.forEach((val, key) => {
        if (!SKIP_RES.has(key)) reply.header(key, val)
      })

      reply.status(response.status)
      return reply.send(Buffer.from(await response.arrayBuffer()))
    } catch (err) {
      fastify.log.error({ err, targetUrl }, 'Clerk proxy error')
      return reply.status(502).send({ error: 'Clerk proxy unavailable' })
    }
  })
}
