import type { FastifyInstance } from 'fastify'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const CONTACT_EMAIL = process.env.CONTACT_EMAIL
const CONTACT_FROM = process.env.CONTACT_FROM ?? 'contact@anonretro.com'

const CATEGORIES = ['Billing', 'Support', 'Feature Request', 'General / Other'] as const

export default async function contactRoutes(fastify: FastifyInstance) {
  fastify.post('/api/contact', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    if (!RESEND_API_KEY || !CONTACT_EMAIL) {
      fastify.log.warn('Contact form not configured — missing RESEND_API_KEY or CONTACT_EMAIL')
      return reply.status(503).send({ error: 'Contact form unavailable.' })
    }

    const { name, email, category, message } = req.body as Record<string, string>

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return reply.status(400).send({ error: 'Name, email, and message are required.' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ error: 'Invalid email address.' })
    }
    if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
      return reply.status(400).send({ error: 'Invalid category.' })
    }
    if (message.trim().length > 5000) {
      return reply.status(400).send({ error: 'Message too long (max 5000 characters).' })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: CONTACT_EMAIL,
        reply_to: email.trim(),
        subject: `[AnonRetro] ${category} — ${name.trim()}`,
        text: `From: ${name.trim()} <${email.trim()}>\nCategory: ${category}\n\n${message.trim()}`,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      fastify.log.error({ status: res.status, err }, 'Resend API error')
      return reply.status(502).send({ error: 'Failed to send message. Try again later.' })
    }

    fastify.log.info({ name: name.trim(), category }, 'Contact form submitted')
    return reply.status(200).send({ ok: true })
  })
}
