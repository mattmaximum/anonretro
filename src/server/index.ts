import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import path from 'path'
import { fileURLToPath } from 'url'
import boardRoutes from './routes/boards.js'
import exportRoutes from './routes/export.js'
import metricsRoutes from './routes/metrics.js'
import meRoutes from './routes/me.js'
import wsRoutes, { broadcast } from './ws.js'
import { initTimerService, restoreTimers } from './timer.js'
import db, { deleteExpiredBoards } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)
const IS_PROD = process.env.NODE_ENV === 'production'
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173']

const fastify = Fastify({
  logger: {
    transport: IS_PROD ? undefined : { target: 'pino-pretty' },
    serializers: {
      // Redact admin_token from access logs
      req(req) {
        return {
          method: req.method,
          url: req.url?.replace(/admin_token=[^&]*/g, 'admin_token=[REDACTED]'),
        }
      },
    },
  },
})

// Rate limiting — applied to all routes (WebSocket upgrades are exempt by nature)
await fastify.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['cf-connecting-ip'] as string ?? req.ip,
})

// CORS
await fastify.register(cors, {
  origin: IS_PROD ? ALLOWED_ORIGINS : true,
})

// WebSocket
await fastify.register(websocket, {
  options: {
    verifyClient: (info: { req: { headers: { origin?: string } } }) => {
      const origin = info.req.headers.origin
      if (!origin) return IS_PROD ? false : true
      if (!IS_PROD) return true
      return ALLOWED_ORIGINS.includes(origin)
    },
  },
})

// Routes
await fastify.register(boardRoutes)
await fastify.register(exportRoutes)
await fastify.register(metricsRoutes)
await fastify.register(meRoutes)
await fastify.register(wsRoutes)

// Health check
fastify.get('/api/health', async () => {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM boards').get() as { count: number }
  return { status: 'ok', boards: count, uptime: process.uptime() }
})

// Serve built frontend in production
if (IS_PROD) {
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../../public'),
    prefix: '/',
  })
  fastify.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
}

// Periodic expired-board cleanup — runs every 6 hours regardless of traffic
function purgeExpiredBoards() {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 2592000 // 30 days
    deleteExpiredBoards(cutoff)
  } catch (err) {
    console.error('Scheduled board purge error (non-fatal):', err)
  }
}
purgeExpiredBoards() // run once at startup to clean up any stale boards
setInterval(purgeExpiredBoards, 6 * 60 * 60 * 1000)

// Start
initTimerService(broadcast)
restoreTimers()

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`AnonRetro running on :${PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
