import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import path from 'path'
import { fileURLToPath } from 'url'
import boardRoutes from './routes/boards.js'
import exportRoutes from './routes/export.js'
import wsRoutes, { broadcast } from './ws.js'
import { initTimerService, restoreTimers } from './timer.js'
import db from './db.js'

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
    decorateReply: false,
  })
  fastify.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
}

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
