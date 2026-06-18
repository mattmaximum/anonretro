import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { UserButton, useUser } from '@clerk/react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, rectIntersection } from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent, DragOverEvent, CollisionDetection } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { CardData, GroupData, ParticipantData, TimerState, OutboundMessage } from '@shared/messages'
import { getFormat } from '@shared/formats'
import { storage } from '../lib/storage.js'
import { useWebSocket } from '../hooks/useWebSocket.js'
import Column from './Column.js'
import Card from './Card.js'
import GroupModal from './GroupModal.js'
import PresenceBar from './PresenceBar.js'
import AdminPanel from './AdminPanel.js'
import ShareModal from './ShareModal.js'
import TimerDisplay from './TimerDisplay.js'

type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'dead'

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isSignedIn } = useUser()

  // Board state
  const [cards, setCards] = useState<CardData[]>([])
  const [groups, setGroups] = useState<GroupData[]>([])
  const [participants, setParticipants] = useState<ParticipantData[]>([])
  const [blurEnabled, setBlurEnabled] = useState(true)
  const [boardLocked, setBoardLocked] = useState(false)
  const [timer, setTimer] = useState<TimerState>({ expires_at: null, paused_at: null, label: null })
  const [format, setFormat] = useState('mad-sad-glad')
  const [boardTitle, setBoardTitle] = useState('')
  const [boardCreatedAt, setBoardCreatedAt] = useState<number | null>(null)
  const [boardLastActivityAt, setBoardLastActivityAt] = useState<number | null>(null)
  const [ownerIsPro, setOwnerIsPro] = useState(false)
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set())
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [revealSequence, setRevealSequence] = useState<string[]>([])
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [expiredCode, setExpiredCode] = useState<number | null>(null)
  const [boardDeletedByAdmin, setBoardDeletedByAdmin] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

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

  // Drag state (facilitator only)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)

  // Group modal
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)

  // Track pointer Y for 3-way collision detection (gap vs stack zone)
  const pointerYRef = useRef(0)

  const reconnectCount = useRef(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Stable set of column droppable IDs for collision filtering.
  const columnIds = useMemo(() => new Set(getFormat(format).columns.map(c => c.id)), [format])

  // Prefer sortable items (cards/groups) over column droppables when both are
  // under the pointer. The column droppable covers the whole column area, so
  // without this filter pointerWithin returns the column first and the SortableContext
  // never sees the card — causing the animated placeholder to stay at the wrong position.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    const itemCollisions = pointerCollisions.filter(c => !columnIds.has(c.id as string))
    if (itemCollisions.length > 0) return itemCollisions
    if (pointerCollisions.length > 0) return pointerCollisions
    return rectIntersection(args)
  }, [columnIds])

  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function handleDragOver(event: DragOverEvent) {
    setDragOverId(event.over ? (event.over.id as string) : null)
  }

  // ID of the group currently being hovered by a dragged card (not a group).
  // Used to show a visual drop-target highlight on GroupCard.
  const dragOverGroupId = activeCardId && !activeCardId.startsWith('group:') && dragOverId?.startsWith('group:')
    ? dragOverId.slice('group:'.length)
    : null

  useEffect(() => {
    function track(e: PointerEvent) { pointerYRef.current = e.clientY }
    window.addEventListener('pointermove', track, { passive: true })
    return () => window.removeEventListener('pointermove', track)
  }, [])

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

    // Generate and persist the token BEFORE fetching so React StrictMode's
    // double-invoke finds it in storage on the second run and returns early,
    // preventing two participants from being created for the same client.
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    storage.setToken(boardId, newToken)

    fetch(`/api/boards/${boardId}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participant_token: newToken }) })
      .then(r => r.json())
      .then(data => {
        if (data.error) { storage.removeToken(boardId); setExpiredCode(404); return }
        storage.setIdentity(boardId, { color: data.color, animal: data.animal })
        setToken(newToken)
        setIdentity({ color: data.color, animal: data.animal })
        if (!storage.getOnboardingSeen(boardId)) setShowOnboarding(true)
      })
      .catch(() => { storage.removeToken(boardId); setExpiredCode(500) })
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
        setGroups(msg.groups)
        setParticipants(msg.participants)
        setTimer(msg.timer)
        setMyVotes(new Set(msg.my_voted_card_ids))
        setFormat(msg.format)
        setBoardTitle(msg.title)
        setBoardCreatedAt(msg.created_at)
        setBoardLastActivityAt(msg.last_activity_at)
        setOwnerIsPro(msg.owner_is_pro)
        break

      case 'card_update':
        if (msg.card.group_id) {
          // Grouped card — update inside the group's child_cards, not top-level cards
          setGroups(prev => prev.map(g => {
            if (g.id !== msg.card.group_id) return g
            const childIdx = g.child_cards.findIndex(c => c.id === msg.card.id)
            if (childIdx === -1) return g
            const next = [...g.child_cards]
            next[childIdx] = msg.card
            return { ...g, child_cards: next }
          }))
        } else {
          setCards(prev => {
            const idx = prev.findIndex(c => c.id === msg.card.id)
            if (idx === -1) return [...prev, msg.card]
            const next = [...prev]
            next[idx] = msg.card
            return next
          })
        }
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

      case 'title_changed':
        setBoardTitle(msg.title)
        break

      case 'cards_reordered':
        setCards(msg.cards)
        setGroups(msg.groups)
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

  useLayoutEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  function startTitleEdit() {
    setTitleDraft(boardTitle)
    setEditingTitle(true)
  }

  function commitTitleEdit() {
    if (!adminToken) return
    const trimmed = titleDraft.trim().slice(0, 100)
    if (trimmed !== boardTitle) {
      send({ type: 'admin:title_change', admin_token: adminToken, title: trimmed })
    }
    setEditingTitle(false)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null)
    setDragOverId(null)
    const { active, over } = event
    if (!over || !adminToken) return

    const activeId = active.id as string
    const overId = over.id as string
    const isActiveGroup = activeId.startsWith('group:')
    const isOverGroup = overId.startsWith('group:')
    const columnIdSet = new Set(fmt.columns.map(c => c.id))

    // ── Drop on column background/header ──
    if (columnIdSet.has(overId)) {
      if (isActiveGroup) {
        const groupId = activeId.slice('group:'.length)
        const group = groups.find(g => g.id === groupId)
        if (!group || group.column_id === overId) return
        // Optimistic: move group and its children to target column
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, column_id: overId } : g))
        send({ type: 'admin:card_group_move', admin_token: adminToken, group_id: groupId, column_id: overId })
      } else {
        const card = cards.find(c => c.id === activeId)
        if (!card) return
        if (card.column_id === overId) {
          // Same-column header/background drop → reorder to top
          const columnCards = cards.filter(c => c.column_id === card.column_id)
          const oldIndex = columnCards.findIndex(c => c.id === activeId)
          if (oldIndex === 0) return
          const reordered = arrayMove(columnCards, oldIndex, 0)
          setCards(prev => [...prev.filter(c => c.column_id !== card.column_id), ...reordered])
          send({ type: 'admin:card_reorder', admin_token: adminToken, card_id: activeId, column_id: card.column_id, new_index: 0 })
        } else {
          // Different column → move card there
          setCards(prev => prev.map(c => c.id === activeId ? { ...c, column_id: overId } : c))
          send({ type: 'admin:card_move', admin_token: adminToken, card_id: activeId, column_id: overId })
        }
      }
      return
    }

    // ── Group being reordered in column ──
    if (isActiveGroup) {
      const groupId = activeId.slice('group:'.length)
      const group = groups.find(g => g.id === groupId)
      if (!group) return
      const overColId = isOverGroup
        ? groups.find(g => g.id === overId.slice('group:'.length))?.column_id
        : cards.find(c => c.id === overId)?.column_id
      if (!overColId || overColId !== group.column_id) return
      // Compute new index in the merged column order
      const colItems = getMergedColumnItems(cards, groups, group.column_id)
      const oldIdx = colItems.findIndex(i => i === activeId)
      const newIdx = colItems.findIndex(i => i === overId)
      if (oldIdx === newIdx || newIdx === -1) return
      // Optimistic: reorder merged items and reassign sequential positions
      const reordered = [...colItems]
      reordered.splice(oldIdx, 1)
      reordered.splice(newIdx, 0, activeId)
      setGroups(prev => prev.map(g => {
        const idx = reordered.indexOf(`group:${g.id}`)
        if (g.column_id !== group.column_id || idx === -1) return g
        return { ...g, position: idx + 1 }
      }))
      setCards(prev => prev.map(c => {
        const idx = reordered.indexOf(c.id)
        if (c.column_id !== group.column_id || idx === -1) return c
        return { ...c, position: idx + 1 }
      }))
      send({ type: 'admin:card_group_reorder', admin_token: adminToken, group_id: groupId, column_id: group.column_id, new_index: newIdx })
      return
    }

    // ── Card being dragged ──
    const card = cards.find(c => c.id === activeId)
    if (!card) return

    if (isOverGroup) {
      // Card dropped on a group → add to group
      const groupId = overId.slice('group:'.length)
      const group = groups.find(g => g.id === groupId)
      if (!group) return
      // Optimistic: remove from top-level cards, add to group's child_cards.
      // column_id is set to the group's column so cross-column adds render correctly.
      setCards(prev => prev.filter(c => c.id !== activeId))
      setGroups(prev => prev.map(g => g.id === groupId
        ? { ...g, child_cards: [...g.child_cards, { ...card, group_id: groupId, column_id: group.column_id }] }
        : g
      ))
      send({ type: 'admin:card_group_add', admin_token: adminToken, card_id: activeId, group_id: groupId })
      return
    }

    // ── Card dropped on another card ──
    const overCard = cards.find(c => c.id === overId)
    if (!overCard || card.column_id !== overCard.column_id) return

    // 3-way detection: check pointer Y vs over card's bounding rect
    const overRect = over.rect
    const py = pointerYRef.current
    const inCenterZone = py > overRect.top + overRect.height * 0.2
      && py < overRect.top + overRect.height * 0.8

    if (inCenterZone) {
      // Stack: create group from two cards
      // Optimistic: remove both from top-level (server will send cards_reordered)
      setCards(prev => prev.filter(c => c.id !== activeId && c.id !== overId))
      send({ type: 'admin:card_group_create', admin_token: adminToken, card_id: activeId, target_card_id: overId })
    } else {
      // Gap zone → reorder
      const columnCards = cards.filter(c => c.column_id === card.column_id)
      const oldIndex = columnCards.findIndex(c => c.id === activeId)
      const newIndex = columnCards.findIndex(c => c.id === overId)
      if (oldIndex === newIndex) return
      const reordered = arrayMove(columnCards, oldIndex, newIndex)
      setCards(prev => [...prev.filter(c => c.column_id !== card.column_id), ...reordered])
      send({ type: 'admin:card_reorder', admin_token: adminToken, card_id: activeId, column_id: card.column_id, new_index: newIndex })
    }
  }

  function getMergedColumnItems(allCards: CardData[], allGroups: GroupData[], columnId: string): string[] {
    const colCards = allCards.filter(c => c.column_id === columnId).map(c => ({ id: c.id, pos: c.position }))
    const colGroups = allGroups.filter(g => g.column_id === columnId).map(g => ({ id: `group:${g.id}`, pos: g.position }))
    return [...colCards, ...colGroups].sort((a, b) => a.pos - b.pos).map(i => i.id)
  }

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
        <p className="text-text-2 text-sm">Boards are automatically deleted after 7 days of inactivity.</p>
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
          {boardTitle && (
            <span className="text-sm leading-tight truncate min-w-0 flex items-center gap-1">
              <span className="text-text-3 font-normal flex-shrink-0">Board: </span>
              {isAdmin && editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitTitleEdit()
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  onBlur={commitTitleEdit}
                  maxLength={100}
                  className="bg-raised border border-border-active rounded px-2 py-0.5 text-sm font-semibold text-text-1 outline-none min-w-0 w-48"
                />
              ) : (
                <>
                  <span className="font-semibold text-text-1 truncate">{boardTitle}</span>
                  {isAdmin && (
                    <button
                      onClick={startTitleEdit}
                      className="text-text-3 hover:text-text-1 transition-colors flex-shrink-0 ml-0.5"
                      title="Rename board"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  )}
                </>
              )}
            </span>
          )}
          {identity && (
            <PresenceBar
              participants={participants}
              myColor={identity.color}
              myAnimal={identity.animal}
              isAdmin={isAdmin}
            />
          )}
        </div>

        {/* Retention box + privacy link + account */}
        <div className="flex flex-col items-end gap-0.5">
          <RetentionBox lastActivityAt={boardLastActivityAt} ownerIsPro={ownerIsPro} />
          <div className="flex items-center gap-2">
            <Link to="/privacy" className="text-text-3 text-[10px] hover:text-text-2 transition-colors">Privacy</Link>
            {isSignedIn && <UserButton />}
          </div>
        </div>
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

      {/* Group modal */}
      {openGroupId && (() => {
        const group = groups.find(g => g.id === openGroupId)
        return group ? (
          <GroupModal
            group={group}
            isAdmin={isAdmin}
            locked={boardLocked}
            myVotes={myVotes}
            onClose={() => setOpenGroupId(null)}
            onVote={cardId => {
              setMyVotes(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s })
              send({ type: 'vote:toggle', card_id: cardId })
            }}
            onUnstack={(cardId, groupId) => {
              if (!adminToken) return
              send({ type: 'admin:card_unstack', admin_token: adminToken, card_id: cardId, group_id: groupId })
              // Optimistic: remove card from group's child_cards
              setGroups(prev => prev.map(g => g.id === groupId
                ? { ...g, child_cards: g.child_cards.filter(c => c.id !== cardId) }
                : g
              ))
            }}
          />
        ) : null
      })()}

      <div className="flex flex-1 min-h-0">
        {/* Columns — desktop */}
        <main className="flex-1 p-4 overflow-auto">
          {/* Desktop: grid */}
          <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="hidden md:grid gap-4" style={{ gridTemplateColumns: `repeat(${fmt.columns.length}, minmax(0, 1fr))` }}>
              {fmt.columns.map(col => (
                <Column
                  key={col.id}
                  name={col.label}
                  columnId={col.id}
                  cards={cards.filter(c => c.column_id === col.id)}
                  groups={groups.filter(g => g.column_id === col.id)}
                  revealedIds={revealedIds}
                  revealSequence={revealSequence}
                  myVotes={myVotes}
                  locked={boardLocked}
                  isAdmin={isAdmin}
                  activeCardId={activeCardId}
                  dragOverGroupId={dragOverGroupId}
                  expandedCardId={expandedCardId}
                  onExpandCard={setExpandedCardId}
                  onAddCard={content => send({ type: 'card:add', column_id: col.id, content })}
                  onVote={cardId => {
                    setMyVotes(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s })
                    send({ type: 'vote:toggle', card_id: cardId })
                  }}
                  onEdit={(cardId, content) => send({ type: 'card:edit', id: cardId, content })}
                  onDelete={cardId => send({ type: 'card:delete', id: cardId })}
                  onOpenGroupModal={setOpenGroupId}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeCardId ? (() => {
                const isGroup = activeCardId.startsWith('group:')
                if (isGroup) {
                  const group = groups.find(g => `group:${g.id}` === activeCardId)
                  return group ? (
                    <div className="bg-surface border border-accent/60 rounded p-3 shadow-xl rotate-1 text-sm text-text-1 opacity-95 max-w-xs">
                      <span className="text-text-2">{group.child_cards.length} grouped cards</span>
                    </div>
                  ) : null
                }
                const card = cards.find(c => c.id === activeCardId)
                return card ? (
                  <div className="bg-surface border border-accent/60 rounded p-3 shadow-xl rotate-1 text-sm text-text-1 opacity-95 max-w-xs">
                    {card.blur ? <span className="italic text-text-3">Hidden card</span> : card.content}
                  </div>
                ) : null
              })() : null}
            </DragOverlay>
          </DndContext>

          {/* Mobile: tabs */}
          <div className="md:hidden flex flex-col gap-4">
            <div className="flex gap-1 border-b border-border">
              {fmt.columns.map((col, i) => {
                const colUnread = (unread[col.id] ?? 0)
                return (
                  <button
                    key={col.id}
                    onClick={() => setActiveTab(i)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === i
                        ? 'border-accent text-text-1'
                        : 'border-transparent text-text-2 hover:text-text-1'
                    }`}
                  >
                    {col.label}
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
              name={fmt.columns[activeTab].label}
              columnId={fmt.columns[activeTab].id}
              cards={cards.filter(c => c.column_id === fmt.columns[activeTab].id)}
              groups={groups.filter(g => g.column_id === fmt.columns[activeTab].id)}
              revealedIds={revealedIds}
              revealSequence={revealSequence}
              myVotes={myVotes}
              locked={boardLocked}
              expandedCardId={expandedCardId}
              onExpandCard={setExpandedCardId}
              onAddCard={content => send({ type: 'card:add', column_id: fmt.columns[activeTab].id, content })}
              onVote={cardId => {
                setMyVotes(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s })
                send({ type: 'vote:toggle', card_id: cardId })
              }}
              onEdit={(cardId, content) => send({ type: 'card:edit', id: cardId, content })}
              onDelete={cardId => send({ type: 'card:delete', id: cardId })}
              onOpenGroupModal={setOpenGroupId}
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

function RetentionBox({ lastActivityAt, ownerIsPro }: { lastActivityAt: number | null; ownerIsPro: boolean }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!lastActivityAt) return
    function update() {
      const expirySeconds = ownerIsPro ? 31536000 : 604800
      const expiresAt = (lastActivityAt! + expirySeconds) * 1000
      const msLeft = expiresAt - Date.now()
      if (msLeft <= 0) { setLabel('Board expired'); return }
      const dLeft = Math.floor(msLeft / 86_400_000)
      const hLeft = Math.floor((msLeft % 86_400_000) / 3_600_000)
      const hTotal = Math.floor(msLeft / 3_600_000)
      const mLeft = Math.floor(msLeft / 60_000)
      if (dLeft >= 7) setLabel(`Expires in ${dLeft}d`)
      else if (dLeft >= 1) setLabel(`Expires in ${dLeft}d ${hLeft}h`)
      else if (hTotal >= 1) setLabel(`Expires in ${hTotal}h`)
      else setLabel(`Expires in ${mLeft}m`)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [lastActivityAt, ownerIsPro])

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
