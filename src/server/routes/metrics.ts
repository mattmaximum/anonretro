import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fs from 'fs'
import db, {
  DB_PATH, getDailyStats, getFormatBreakdown,
  getTotalParticipants, getTotalCards, countBoards, countActiveBoards,
} from '../db.js'
import { getConnectedCount } from '../ws.js'

const METRICS_USER = process.env.METRICS_USER ?? 'admin'
const METRICS_PASSWORD = process.env.METRICS_PASSWORD ?? 'changeme'

function checkAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Basic ')) return false
  const decoded = Buffer.from(auth.slice(6), 'base64').toString()
  const colon = decoded.indexOf(':')
  if (colon === -1) return false
  const user = decoded.slice(0, colon)
  const pass = decoded.slice(colon + 1)
  return user === METRICS_USER && pass === METRICS_PASSWORD
}

function dbSizeKb(): string {
  try {
    const bytes = fs.statSync(DB_PATH).size
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  } catch { return 'unknown' }
}

function uptimeStr(): string {
  const s = Math.floor(process.uptime())
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

function renderPage(data: {
  activeBoardCount: number
  totalBoardCount: number
  connectedNow: number
  totalParticipants: number
  totalCards: number
  formats: Array<{ format: string; count: number }>
  daily: Array<{ date: string; boards_created: number; participants_joined: number; cards_created: number; timers_started: number }>
  dbSize: string
  uptime: string
  nodeVersion: string
}): string {
  const formatRows = data.formats.map(r =>
    `<tr><td>${esc(r.format)}</td><td>${r.count}</td></tr>`
  ).join('')

  const dailyRows = data.daily.map(r =>
    `<tr>
      <td>${esc(r.date)}</td>
      <td>${r.boards_created}</td>
      <td>${r.participants_joined}</td>
      <td>${r.cards_created}</td>
      <td>${r.timers_started}</td>
    </tr>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>AnonRetro — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0d0000;
      --surface: #1a0505;
      --border: #3d0a0a;
      --red: #c0392b;
      --red-dim: #7d1f1f;
      --red-bright: #e74c3c;
      --text-1: #f5e6e6;
      --text-2: #c9a5a5;
      --text-3: #8a5a5a;
    }
    body { background: var(--bg); color: var(--text-1); font-family: system-ui, -apple-system, sans-serif; font-size: 14px; padding: 0; }
    header { background: var(--surface); border-bottom: 1px solid var(--red-dim); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 16px; font-weight: 600; color: var(--red-bright); letter-spacing: 0.5px; }
    header .meta { color: var(--text-3); font-size: 12px; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 24px; }
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--red-dim); margin-bottom: 10px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .stat-card .val { font-size: 28px; font-weight: 700; color: var(--red-bright); line-height: 1; margin-bottom: 4px; }
    .stat-card .lbl { font-size: 11px; color: var(--text-3); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    th { text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-3); border-bottom: 1px solid var(--border); font-weight: 500; }
    td { padding: 9px 14px; border-bottom: 1px solid var(--border); color: var(--text-2); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(192,57,43,0.06); }
    .sys-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .sys-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; }
    .sys-card .lbl { font-size: 11px; color: var(--text-3); }
    .sys-card .val { font-size: 14px; color: var(--text-1); }
    .refresh-note { color: var(--text-3); font-size: 11px; text-align: right; }
    .warning { background: rgba(192,57,43,0.15); border: 1px solid var(--red-dim); border-radius: 6px; padding: 8px 12px; color: #f5a5a5; font-size: 12px; }
  </style>
</head>
<body>
<header>
  <h1>AnonRetro — Admin</h1>
  <span class="meta">Auto-refreshes every 30s · ${new Date().toUTCString()}</span>
</header>
<div class="container">
  ${METRICS_PASSWORD === 'changeme' ? '<div class="warning">Warning: default METRICS_PASSWORD is set. Change it in your environment.</div>' : ''}

  <div>
    <p class="section-title">Live</p>
    <div class="stat-grid">
      <div class="stat-card"><div class="val">${data.activeBoardCount}</div><div class="lbl">Active boards (7d)</div></div>
      <div class="stat-card"><div class="val">${data.totalBoardCount}</div><div class="lbl">Total boards (DB)</div></div>
      <div class="stat-card"><div class="val">${data.connectedNow}</div><div class="lbl">Connected now</div></div>
      <div class="stat-card"><div class="val">${data.totalParticipants}</div><div class="lbl">Participants (all time)</div></div>
      <div class="stat-card"><div class="val">${data.totalCards}</div><div class="lbl">Cards (all time)</div></div>
    </div>
  </div>

  <div>
    <p class="section-title">Board formats</p>
    <table>
      <thead><tr><th>Format</th><th>Active boards</th></tr></thead>
      <tbody>${formatRows || '<tr><td colspan="2" style="color:var(--text-3)">No boards yet</td></tr>'}</tbody>
    </table>
  </div>

  <div>
    <p class="section-title">Daily activity (last 30 days)</p>
    <table>
      <thead>
        <tr>
          <th>Date (UTC)</th>
          <th>Boards</th>
          <th>Participants</th>
          <th>Cards</th>
          <th>Timers</th>
        </tr>
      </thead>
      <tbody>${dailyRows || '<tr><td colspan="5" style="color:var(--text-3)">No data yet</td></tr>'}</tbody>
    </table>
  </div>

  <div>
    <p class="section-title">System</p>
    <div class="sys-grid">
      <div class="sys-card"><div class="lbl">Uptime</div><div class="val">${esc(data.uptime)}</div></div>
      <div class="sys-card"><div class="lbl">Database size</div><div class="val">${esc(data.dbSize)}</div></div>
      <div class="sys-card"><div class="lbl">Node version</div><div class="val">${esc(data.nodeVersion)}</div></div>
    </div>
  </div>

  <p class="refresh-note">Uptime monitoring: ping /api/health every 5 min via UptimeRobot for alerting.</p>
</div>
</body>
</html>`
}

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/usagemetrics', async (req, reply) => {
    if (!checkAuth(req, reply)) {
      reply.header('WWW-Authenticate', 'Basic realm="AnonRetro Admin"')
      return reply.code(401).type('text/plain').send('Unauthorized')
    }

    const cutoff = Math.floor(Date.now() / 1000) - 604800
    const { count: activeBoardCount } = countActiveBoards.get(cutoff) as { count: number }
    const { count: totalBoardCount } = countBoards.get() as { count: number }
    const { count: totalParticipants } = getTotalParticipants.get() as { count: number }
    const { count: totalCards } = getTotalCards.get() as { count: number }
    const formats = getFormatBreakdown.all() as Array<{ format: string; count: number }>
    const daily = getDailyStats.all(30) as Array<{
      date: string; boards_created: number; participants_joined: number; cards_created: number; timers_started: number
    }>

    const html = renderPage({
      activeBoardCount,
      totalBoardCount,
      connectedNow: getConnectedCount(),
      totalParticipants,
      totalCards,
      formats,
      daily,
      dbSize: dbSizeKb(),
      uptime: uptimeStr(),
      nodeVersion: process.version,
    })

    return reply.type('text/html').send(html)
  })
}
