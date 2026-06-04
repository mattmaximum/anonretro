import type { FastifyInstance } from 'fastify'
import { getBoard, getCards, getParticipants } from '../db.js'
import { getFormat } from '../../shared/formats.js'

export default async function exportRoutes(fastify: FastifyInstance) {
  fastify.get('/api/boards/:id/export.csv', async (req, reply) => {
    const data = getBoardData(req, reply)
    if (!data) return

    const { board, format, columns } = data
    const BOM = '﻿'
    const rows: string[] = [
      ['Board', board.title || board.id].map(csvEscape).join(','),
      ['Format', format.name].map(csvEscape).join(','),
      ['Exported', new Date().toISOString().slice(0, 10)].map(csvEscape).join(','),
      '',
      ['Column Name', 'Card Content', 'Total Votes', 'Author (Color Animal)'].join(','),
    ]

    for (const col of columns) {
      for (const card of col.cards) {
        rows.push([col.name, card.content, card.votes, card.author].map(csvEscape).join(','))
      }
    }

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="retro-${board.id}.csv"`)
      .send(BOM + rows.join('\r\n'))
  })

  fastify.get('/api/boards/:id/export.json', async (req, reply) => {
    const data = getBoardData(req, reply)
    if (!data) return

    const { board, format, columns } = data

    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="retro-${board.id}.json"`)
      .send({
        board: {
          id: board.id,
          title: board.title || board.id,
          format: format.name,
          created_at: board.created_at,
          exported_at: new Date().toISOString(),
        },
        columns,
      })
  })

  fastify.get('/api/boards/:id/export.md', async (req, reply) => {
    const data = getBoardData(req, reply)
    if (!data) return

    const { board, format, columns } = data
    const lines: string[] = [
      `# Retro: ${board.title || board.id}`,
      '',
      `**Format:** ${format.name}  `,
      `**Exported:** ${new Date().toISOString().slice(0, 10)}`,
      '',
      '---',
    ]

    for (const col of columns) {
      lines.push('', `## ${col.name}`, '')
      if (col.cards.length === 0) {
        lines.push('_No cards_')
      } else {
        for (const card of col.cards) {
          const votes = col.cards.some(c => c.votes > 0)
            ? ` *(${card.votes} vote${card.votes !== 1 ? 's' : ''})*`
            : ''
          lines.push(`- ${card.content}${votes} — *${card.author}*`)
        }
      }
    }

    reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="retro-${board.id}.md"`)
      .send(lines.join('\n'))
  })
}

type BoardData = {
  board: Record<string, any>
  format: ReturnType<typeof getFormat>
  columns: { name: string; cards: { content: string; votes: number; author: string }[] }[]
}

function getBoardData(req: any, reply: any): BoardData | null {
  const { id } = req.params as { id: string }
  const adminToken = req.headers['x-admin-token'] as string | undefined

  const board = getBoard.get(id) as Record<string, any> | undefined
  if (!board) { reply.status(404).send({ error: 'Board not found.' }); return null }
  if (!adminToken || board.admin_token !== adminToken) {
    reply.status(403).send({ error: 'Admin access required.' }); return null
  }

  const format = getFormat(board.format)
  const cards = getCards.all(id) as Record<string, any>[]
  const participants = getParticipants.all(id) as Record<string, any>[]

  const identityMap = new Map<string, string>()
  for (const p of participants) {
    identityMap.set(p.participant_token, `${p.color} ${p.animal}`)
  }

  const columns = format.columns.map(colName => ({
    name: colName,
    cards: cards
      .filter(c => c.column_id === colName)
      .sort((a, b) => b.votes - a.votes)
      .map(c => ({
        content: c.content as string,
        votes: c.votes as number,
        author: identityMap.get(c.creator_token) ?? 'Unknown',
      })),
  }))

  return { board, format, columns }
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
