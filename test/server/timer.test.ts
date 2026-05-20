import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Inline the timer logic to test without module side effects

type BroadcastFn = (boardId: string, msg: object) => void

function createTimerService() {
  const timerHandles = new Map<string, ReturnType<typeof setTimeout>>()
  let broadcast: BroadcastFn = () => {}
  const cleared: string[] = []

  function init(fn: BroadcastFn) { broadcast = fn }

  function handleExpired(boardId: string) {
    timerHandles.delete(boardId)
    cleared.push(boardId)
    broadcast(boardId, { type: 'timer:expired' })
  }

  function arm(boardId: string, expiresAt: number) {
    const existing = timerHandles.get(boardId)
    if (existing) clearTimeout(existing)
    const remaining = expiresAt * 1000 - Date.now()
    if (remaining <= 0) { handleExpired(boardId); return }
    const handle = setTimeout(() => handleExpired(boardId), remaining)
    timerHandles.set(boardId, handle)
  }

  function disarm(boardId: string) {
    const handle = timerHandles.get(boardId)
    if (handle) { clearTimeout(handle); timerHandles.delete(boardId) }
  }

  return { init, arm, disarm, timerHandles, cleared }
}

const BASE_TIME = 1_700_000_000_000 // fixed epoch ms for deterministic tests

describe('timer service', () => {
  beforeEach(() => { vi.useFakeTimers({ now: BASE_TIME }) })
  afterEach(() => { vi.useRealTimers() })

  it('fires timer:expired after duration elapses', () => {
    const svc = createTimerService()
    const events: object[] = []
    svc.init((id, msg) => events.push({ id, msg }))

    const nowSec = Math.floor(BASE_TIME / 1000)
    const expiresAt = nowSec + 5 // 5s from BASE_TIME
    svc.arm('board1', expiresAt)

    vi.advanceTimersByTime(4900)
    expect(events).toHaveLength(0)

    vi.advanceTimersByTime(200)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'board1', msg: { type: 'timer:expired' } })
    expect(svc.cleared).toContain('board1')
  })

  it('re-arming cancels the previous timer', () => {
    const svc = createTimerService()
    const events: object[] = []
    svc.init((id, msg) => events.push({ id, msg }))

    const nowSec = Math.floor(BASE_TIME / 1000)
    const first = nowSec + 5
    const second = nowSec + 10
    svc.arm('board1', first)
    svc.arm('board1', second) // replaces first

    vi.advanceTimersByTime(5100)
    expect(events).toHaveLength(0) // first handle was cancelled

    vi.advanceTimersByTime(5100)
    expect(events).toHaveLength(1)
  })

  it('disarm prevents expiry event', () => {
    const svc = createTimerService()
    const events: object[] = []
    svc.init((id, msg) => events.push({ id, msg }))

    svc.arm('board1', Math.floor(BASE_TIME / 1000) + 5)
    svc.disarm('board1')

    vi.advanceTimersByTime(10_000)
    expect(events).toHaveLength(0)
    expect(svc.timerHandles.size).toBe(0)
  })

  it('already-expired timer fires handleExpired immediately (restoreTimers path)', () => {
    const svc = createTimerService()
    const events: object[] = []
    svc.init((id, msg) => events.push({ id, msg }))

    const pastExpiry = Math.floor(Date.now() / 1000) - 300
    svc.arm('board1', pastExpiry)

    // No time advance needed — fires synchronously in the negative-remaining branch
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'board1', msg: { type: 'timer:expired' } })
  })

  it('multiple boards track independently', () => {
    const svc = createTimerService()
    const events: Array<{ id: string }> = []
    svc.init((id, msg) => events.push({ id, ...msg }))

    const nowSec = Math.floor(BASE_TIME / 1000)
    svc.arm('boardA', nowSec + 3)
    svc.arm('boardB', nowSec + 7)

    vi.advanceTimersByTime(3100)
    expect(events.map(e => e.id)).toEqual(['boardA'])

    vi.advanceTimersByTime(4100)
    expect(events.map(e => e.id)).toEqual(['boardA', 'boardB'])
  })
})
