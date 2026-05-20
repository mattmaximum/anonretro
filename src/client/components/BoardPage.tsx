import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { CardData, ParticipantData, TimerState, OutboundMessage } from '@shared/messages'
import { getFormat } from '@shared/formats'
import { storage } from '../lib/storage.js'
import { useWebSocket } from '../hooks/useWebSocket.js'
import Column from './Column.js'
import PresenceBar from './PresenceBar.js'
import AdminPanel from './AdminPanel.js'
import ShareModal from './ShareModal.js'
import TimerDisplay from './TimerDisplay.js'

type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'dead'

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // Board state
  const [cards, setCards] = useState<CardData[]>([])
  const [participants, setParticipants] = useState<ParticipantData[]>([])
  const [blurEnabled, setBlurEnabled] = useState(true)
  const [boardLocked, setBoardLocked] = useState(false)
  const [timer, setTimer] = useState<TimerState>({ expires_at: null, paused_at: null, label: null })
  const [format, setFormat] = useState('mad-sad-glad')
  const [boardTitle, setBoardTitle] = useState('')
  const [boardCreatedAt, setBoardCreatedAt] = useState<number | null>(null)
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set())
  const [revealSequence, setRevealSequence] = useState<string[]>([])
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [expiredCode, setExpiredCode] = useState<number | null>(null)
  const [boardDeletedByAdmin, setBoardDeletedByAdmin] = useState(false)

  // Identity
  const [token, setToken] = useState<string | null>(null)
  const [identity, setIdentity] = useState<{ color: string; animal: string } | null>(null)
  const adminToken = boardId ? storage.getAdminToken(boardId!) : null
  const isAdmin = !!adminToken

  // Modals
  const [showShare, setShowShare] = useState(searchParams.get('new') === '1')
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Mobile tab state
  const [activeTab, setActiveTab] = useState(0)
  const [unread, setUnread] = useState<Record<string, number>>({})

  const reconnectCount = useRef(0)

  // ── Join flow ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!boardId) return

    const existing = storage.getToken(boardId)
    if (existing) {
      setToken(existing)
      const id = storage.getIdentity(boardId)
      if (id) setIdentity(id)
      return
    }

    fetch(`/api/boards/${boardId}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setExpiredCode(404); return }
        storage.setToken(boardId, data.participant_token)
        storage.setIdentity(boardId, { color: data.color, animal: data.animal })
        setToken(data.participant_token)
        setIdentity({ color: data.color, animal: data.animal })
        // Show onboarding banner on first join
        if (!storage.getOnboardingSeen(boardId)) setShowOnboarding(true)
      })
      .catch(() => setExpiredCode(500))
  }, [boardId])

  // ── WS message handler ───────────────────────────────────────────────────────

  const onMessage = useCallback((msg: OutboundMessage) => {
    setWsStatus('connected')
    reconnectCount.current = 0

    switch (msg.type) {
      case 'board_state':
        setBlurEnabled(msg.blur_enabled)
        setBoardLocked(msg.locked)
        setCards(msg.cards)
        setParticipants(msg.participants)
        setTimer(msg.timer)
        setMyVotes(new Set(msg.my_voted_card_ids))
        setFormat(msg.format)
        setBoardTitle(msg.title)
        setBoardCreatedAt(msg.created_at)
        break

      case 'card_update':
        setCards(prev => {
          const idx = prev.findIndex(c => c.id === msg.card.id)
          if (idx === -1) return [...prev, msg.card]
          const next = [...prev]
          next[idx] = msg.card
          return next
        })
        // Sync vote state: if this is our own card_update after a vote toggle,
        // the server is authoritative on what we've voted.
        // We handle optimistic updates via onVote below; server confirms via card_update.
        break

      case 'card_deleted':
        setCards(prev => prev.filter(c => c.id !== msg.id))
        break

      case 'presence':
        setParticipants(msg.participants)
        break

      case 'blur_changed':
        setBlurEnabled(msg.blur_enabled)
        break

      case 'reveal':
        setBlurEnabled(false)
        setRevealSequence(msg.sequence)
        // Stagger reveals: each card appears after index * 50ms
        msg.sequence.forEach((id, i) => {
          setTimeout(() => setRevealedIds(prev => new Set([...prev, id])), i * 50)
        })
        break

      case 'timer:started':
        setTimer({ expires_at: msg.expires_at, paused_at: null, label: msg.label })
        break
      case 'timer:paused':
        setTimer(t => ({ ...t, paused_at: msg.paused_at }))
        break
      case 'timer:resumed':
        setTimer(t => ({ ...t, expires_at: msg.expires_at, paused_at: null }))
        break
      case 'timer:cancelled':
      case 'timer:expired':
        setTimer({ expires_at: null, paused_at: null, label: null })
        break

      case 'board_locked':
        setBoardLocked(msg.locked)
        break

      case 'board_deleted':
        setBoardDeletedByAdmin(true)
        break
    }
  }, [])

  const onClose = useCallback((code: number) => {
    if (code === 4001 || code === 4004) {
      setExpiredCode(code)
    } else {
      reconnectCount.current++
      setWsStatus(reconnectCount.current >= 3 ? 'dead' : 'reconnecting')
    }
  }, [])

  const { send } = useWebSocket(boardId!, token, onMessage, onClose)

  // Remove ?new=1 from URL after showing share modal
  useEffect(() => {
    if (showShare) {
      const sp = new URLSearchParams(searchParams)
      sp.delete('new')
      setSearchParams(sp, { replace: true })
    }
  }, [showShare])

  // Keep browser tab title in sync
  useEffect(() => {
    document.title = boardTitle ? `${boardTitle} — AnonRetro` : 'AnonRetro'
    return () => { document.title = 'AnonRetro' }
  }, [boardTitle])

  // Onboarding auto-dismiss
  useEffect(() => {
    if (!showOnboarding || !boardId) return
    const t = setTimeout(() => {
      setShowOnboarding(false)
      storage.setOnboardingSeen(boardId)
    }, 8000)
    return () => clearTimeout(t)
  }, [showOnboarding, boardId])

  // ── Expiry screens ───────────────────────────────────────────────────────────

  if (boardDeletedByAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
        <p className="text-text-1 text-lg font-medium">This board was deleted by the facilitator.</p>
        <p className="text-text-2 text-sm">The session has ended.</p>
        <a href="/" className="text-accent hover:underline text-sm mt-2">Start or join a retro →</a>
      </div>
    )
  }

  if (expiredCode === 4004 || expiredCode === 410) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
        <p className="text-text-1 text-lg font-medium">This board has expired.</p>
        <p className="text-text-2 text-sm">Boards are automatically deleted after 7 days.</p>
        <a href="/" className="text-accent hover:underline text-sm mt-2">Start a new retro →</a>
      </div>
    )
  }

  if (expiredCode === 4001) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
        <p className="text-text-1 text-lg font-medium">Session not found.</p>
        <p className="text-text-2 text-sm">Your session token is invalid. Try joining again.</p>
        <a href={`/b/${boardId}`} className="text-accent hover:underline text-sm mt-2">Rejoin →</a>
      </div>
    )
  }

  const fmt = getFormat(format)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-base">
      {/* Share modal (auto-open for new boards) */}
      {showShare && boardId && adminToken && (
        <ShareModal boardId={boardId} adminToken={adminToken} onClose={() => setShowShare(false)} />
      )}

      {/* Onboarding banner */}
      {showOnboarding && identity && (
        <div className="bg-raised border-b border-border px-4 py-2 flex items-center justify-between gap-4">
          <p className="text-text-2 text-sm">
            You're <span className="text-text-1 font-medium">{identity.color} {identity.animal}</span>.
            Cards are hidden until the facilitator reveals them.
          </p>
          <button
            onClick={() => { setShowOnboarding(false); boardId && storage.setOnboardingSeen(boardId) }}
            className="text-text-3 hover:text-text-2 text-sm flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* WS status banners */}
      {wsStatus === 'reconnecting' && (
        <div className="bg-raised border-b border-border px-4 py-1.5 text-center">
          <p className="text-warning text-xs">Reconnecting…</p>
        </div>
      )}
      {wsStatus === 'dead' && (
        <div className="bg-raised border-b border-border px-4 py-1.5 text-center">
          <p className="text-danger text-xs">Connection lost — check your network.</p>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <a href="/" className="text-xs font-medium px-2.5 py-1 rounded border border-border text-text-2 hover:text-text-1 hover:border-border-active flex-shrink-0 transition-colors">
            Go Home
          </a>
          <div className="flex flex-col min-w-0 gap-0.5">
            {boardTitle && (
              <span className="text-sm leading-tight truncate">
                <span className="text-text-3 font-normal">Board Name: </span>
                <span className="font-semibold text-text-1">{boardTitle}</span>
              </span>
            )}
            <span className="text-[11px] leading-tight">
              <span className="text-text-3">Board Type: </span>
              <span className="text-text-2">{fmt.name}</span>
            </span>
          </div>
          {identity && (
            <PresenceBar
              participants={participants}
              myColor={identity.color}
              myAnimal={identity.animal}
              isAdmin={isAdmin}
            />
          )}
        </div>

        {/* Retention box */}
        <RetentionBox createdAt={boardCreatedAt} />
      </header>

      {/* Lock banner — visible to all participants */}
      {boardLocked && (
        <div className="border-b border-warning/40 bg-warning/10 px-4 py-2 flex items-center justify-center gap-2">
          <span className="text-warning text-base leading-none">🔒</span>
          <span className="text-warning text-sm font-semibold">Board Locked</span>
          <span className="text-warning/70 text-xs">— no changes can be made</span>
        </div>
      )}

      {/* Timer banner — visible to all participants */}
      {timer.expires_at !== null && (
        <div className="border-b border-border bg-raised px-4 py-2.5 flex items-center justify-center gap-4">
          {timer.label && <span className="text-text-2 text-sm font-medium">{timer.label}</span>}
          <TimerDisplay timer={timer} />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Columns — desktop */}
        <main className="flex-1 p-4 overflow-auto">
          {/* Desktop: grid */}
          <div className="hidden md:grid gap-4" style={{ gridTemplateColumns: `repeat(${fmt.columns.length}, minmax(0, 1fr))` }}>
            {fmt.columns.map(col => (
              <Column
                key={col}
                name={col}
                cards={cards.filter(c => c.column_id === col)}
                revealedIds={revealedIds}
                revealSequence={revealSequence}
                myVotes={myVotes}
                locked={boardLocked}
                onAddCard={content => send({ type: 'card:add', column_id: col, content })}
                onVote={cardId => {
                  setMyVotes(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s })
                  send({ type: 'vote:toggle', card_id: cardId })
                }}
                onEdit={(cardId, content) => send({ type: 'card:edit', id: cardId, content })}
                onDelete={cardId => send({ type: 'card:delete', id: cardId })}
              />
            ))}
          </div>

          {/* Mobile: tabs */}
          <div className="md:hidden flex flex-col gap-4">
            <div className="flex gap-1 border-b border-border">
              {fmt.columns.map((col, i) => {
                const colUnread = (unread[col] ?? 0)
                return (
                  <button
                    key={col}
                    onClick={() => setActiveTab(i)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === i
                        ? 'border-accent text-text-1'
                        : 'border-transparent text-text-2 hover:text-text-1'
                    }`}
                  >
                    {col}
                    {colUnread > 0 && (
                      <span className="bg-danger text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {colUnread > 9 ? '9+' : colUnread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <Column
              name={fmt.columns[activeTab]}
              cards={cards.filter(c => c.column_id === fmt.columns[activeTab])}
              revealedIds={revealedIds}
              revealSequence={revealSequence}
              myVotes={myVotes}
              locked={boardLocked}
              onAddCard={content => send({ type: 'card:add', column_id: fmt.columns[activeTab], content })}
              onVote={cardId => {
                setMyVotes(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s })
                send({ type: 'vote:toggle', card_id: cardId })
              }}
              onEdit={(cardId, content) => send({ type: 'card:edit', id: cardId, content })}
              onDelete={cardId => send({ type: 'card:delete', id: cardId })}
            />
          </div>
        </main>

        {/* Facilitator Controls — desktop sidebar */}
        {isAdmin && adminToken && (
          <aside className="hidden md:flex flex-col w-56 border-l border-border bg-raised p-4 flex-shrink-0">
            <p className="text-text-2 text-xs font-semibold uppercase tracking-wide mb-3">Facilitator Controls</p>
            <AdminPanel
              adminToken={adminToken}
              blurEnabled={blurEnabled}
              locked={boardLocked}
              timer={timer}
              boardId={boardId!}
              onSend={send}
              onShare={() => setShowShare(true)}
            />
          </aside>
        )}
      </div>

      {/* Facilitator Controls FAB — mobile */}
      {isAdmin && adminToken && (
        <MobileAdminFAB adminToken={adminToken} blurEnabled={blurEnabled} locked={boardLocked} timer={timer} boardId={boardId!} onSend={send} onShare={() => setShowShare(true)} />
      )}
    </div>
  )
}

// ── Retention box ─────────────────────────────────────────────────────────────

function RetentionBox({ createdAt }: { createdAt: number | null }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!createdAt) return
    function update() {
      const expiresAt = (createdAt! + 604800) * 1000
      const msLeft = expiresAt - Date.now()
      if (msLeft <= 0) { setLabel('Board expired'); return }
      const dLeft = Math.floor(msLeft / 86_400_000)
      const hLeft = Math.floor(msLeft / 3_600_000)
      if (dLeft >= 2) setLabel(`Expires in ${dLeft}d`)
      else if (hLeft >= 2) setLabel(`Expires in ${hLeft}h`)
      else {
        const mLeft = Math.floor(msLeft / 60_000)
        setLabel(`Expires in ${mLeft}m`)
      }
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [createdAt])

  if (!label) return null
  return <p className="text-text-3 text-xs">{label}</p>
}

// ── Mobile Admin FAB + Bottom Sheet ──────────────────────────────────────────

function MobileAdminFAB({ adminToken, blurEnabled, locked, timer, boardId, onSend, onShare }: {
  adminToken: string; blurEnabled: boolean; locked: boolean; timer: TimerState; boardId: string; onSend: (msg: object) => void; onShare: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-4 right-4 w-12 h-12 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg flex items-center justify-center text-xl z-40"
        aria-label="Open admin controls"
      >
        ⚙
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setOpen(false)}>
          <div
            className="bg-raised rounded-t-xl p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-text-1">Facilitator Controls</p>
              <button onClick={() => setOpen(false)} className="text-text-3 hover:text-text-2">✕</button>
            </div>
            <AdminPanel adminToken={adminToken} blurEnabled={blurEnabled} locked={locked} timer={timer} boardId={boardId} onSend={onSend} onShare={onShare} />
          </div>
        </div>
      )}
    </>
  )
}
