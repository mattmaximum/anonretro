import type { FastifyInstance } from 'fastify'
import { getBoard, getCards, getParticipants } from '../db.js'
import { getFormat } from '../../shared/formats.js'

export default async function exportRoutes(fastify: FastifyInstance) {
  fastify.get('/api/boards/:id/export.csv', async (req, reply) => {
    const { id } = req.params as { id: string }
    const adminToken = req.headers['x-admin-token'] as string | undefined

    const board = getBoard.get(id) as any
    if (!board) return reply.status(404).send({ error: 'Board not found.' })
    if (!adminToken || board.admin_token !== adminToken) {
      return reply.status(403).send({ error: 'Admin access required.' }
      )
    }

    const format = getFormat(board.format)
    const cards = getCards.all(id) as any[]
    const participants = getParticipants.all(id) as any[]
    const identityMap = new Map<string, string>()
    for (const p of participants) {
      identityMap.set(p.participant_token, `${p.color} ${p.animal}`)
    }

    // UTF-8 BOM for Excel compatibility
    const BOM = '﻿'
    const rows: string[] = ['Column Name,Card Content,Total Votes,Author (Color Animal)']

    for (const col of format.columns) {
      for (const card of cards.filter((c: any) => c.column_id === col)) {
        const author = identityMap.get(card.creator_token) ?? 'Unknown'
        rows.push([col, card.content, card.votes, author].map(csvEscape).join(','))
      }
    }

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="retro-${id}.csv"`)
      .send(BOM + rows.join('\r\n'))
  })
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
