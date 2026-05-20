import { getActiveTimers, updateTimerClear } from './db.js'
import type { OutboundMessage } from '../shared/messages.js'

type BroadcastFn = (boardId: string, msg: OutboundMessage) => void

// Sparse registry — only boards with a running (non-paused) timer
const timerHandles = new Map<string, ReturnType<typeof setTimeout>>()

let broadcast: BroadcastFn

export function initTimerService(broadcastFn: BroadcastFn) {
  broadcast = broadcastFn
}

function handleExpired(boardId: string) {
  timerHandles.delete(boardId)
  updateTimerClear.run(boardId)
  broadcast(boardId, { type: 'timer:expired' })
}

export function armTimer(boardId: string, expiresAt: number) {
  const existing = timerHandles.get(boardId)
  if (existing) clearTimeout(existing)

  const remaining = expiresAt * 1000 - Date.now()
  if (remaining <= 0) {
    handleExpired(boardId)
    return
  }

  const handle = setTimeout(() => handleExpired(boardId), remaining)
  timerHandles.set(boardId, handle)
}

export function disarmTimer(boardId: string) {
  const handle = timerHandles.get(boardId)
  if (handle) {
    clearTimeout(handle)
    timerHandles.delete(boardId)
  }
}

// Called at server startup — re-arm all active timers from SQLite
export function restoreTimers() {
  const rows = getActiveTimers.all() as Array<{ id: string; timer_expires_at: number }>
  for (const row of rows) {
    armTimer(row.id, row.timer_expires_at)
  }
}
