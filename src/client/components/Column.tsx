import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { CardData, GroupData } from '@shared/messages'
import Card from './Card.js'
import GroupCard from './GroupCard.js'

interface Props {
  name: string
  columnId: string
  cards: CardData[]
  groups: GroupData[]
  revealedIds: Set<string>
  revealSequence: string[]
  myVotes: Set<string>
  locked: boolean
  isAdmin?: boolean
  activeCardId?: string | null
  expandedCardId: string | null
  onExpandCard: (id: string | null) => void
  onAddCard: (content: string) => void
  onVote: (cardId: string) => void
  onEdit: (cardId: string, content: string) => void
  onDelete: (cardId: string) => void
  onConvertToGroup?: (cardId: string) => void
  dragOverGroupId?: string | null
  onOpenGroupModal: (groupId: string) => void
}

export default function Column({ name, columnId, cards, groups, revealedIds, revealSequence, myVotes, locked, isAdmin, activeCardId, dragOverGroupId, expandedCardId, onExpandCard, onAddCard, onVote, onEdit, onDelete, onConvertToGroup, onOpenGroupModal }: Props) {
  const [draft, setDraft] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: columnId })

  const isDragActive = !!activeCardId

  // Build interleaved sorted list of cards and groups by position for rendering
  type Item = { kind: 'card'; data: CardData; sortId: string } | { kind: 'group'; data: GroupData; sortId: string }
  const items: Item[] = [
    ...cards.map(c => ({ kind: 'card' as const, data: c, sortId: c.id })),
    ...groups.map(g => ({ kind: 'group' as const, data: g, sortId: `group:${g.id}` })),
  ].sort((a, b) => {
    const posA = a.kind === 'card' ? (a.data as CardData).position : (a.data as GroupData).position
    const posB = b.kind === 'card' ? (b.data as CardData).position : (b.data as GroupData).position
    return posA - posB
  })

  const sortableIds = items.map(i => i.sortId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    onAddCard(trimmed)
    setDraft('')
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-3 min-w-0 rounded-lg transition-colors ${isOver && activeCardId ? 'ring-2 ring-accent/40 bg-accent/5 p-2 -m-2' : ''}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-text-2 px-1">{name}</h2>

      {/* Add card input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={500}
          disabled={locked}
          placeholder={locked ? 'Board is locked' : "Write what's on your mind"}
          className="flex-1 bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!draft.trim() || locked}
          className="bg-accent hover:bg-accent-hover text-white text-sm font-medium px-3 py-2 rounded transition-colors disabled:opacity-40"
        >
          +
        </button>
      </form>

      {/* Cards + Groups */}
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className={`flex flex-col min-h-[72px] transition-all duration-150 ${isDragActive ? 'gap-6' : 'gap-2'}`}>
          {items.length === 0 && (
            <div className="border-dashed border border-border/40 bg-surface rounded flex items-center justify-center h-[72px]">
              <span className="text-text-3 text-xs">No cards yet</span>
            </div>
          )}
          {items.map((item) => {
            if (item.kind === 'group') {
              return (
                <GroupCard
                  key={item.sortId}
                  group={item.data as GroupData}
                  isAdmin={isAdmin}
                  locked={locked}
                  myVotes={myVotes}
                  isDraggingActive={activeCardId === item.sortId}
                  isHoveredOver={dragOverGroupId === (item.data as GroupData).id}
                  onVote={onVote}
                  onOpenModal={onOpenGroupModal}
                />
              )
            }
            const card = item.data as CardData
            return (
              <Card
                key={card.id}
                card={card}
                revealedIds={revealedIds}
                revealIndex={revealSequence.indexOf(card.id)}
                myVotes={myVotes}
                locked={locked}
                isAdmin={isAdmin}
                isDraggingActive={activeCardId === card.id}
                isExpanded={expandedCardId === card.id}
                onExpand={() => onExpandCard(card.id)}
                onCollapse={() => onExpandCard(null)}
                onVote={onVote}
                onEdit={onEdit}
                onDelete={onDelete}
                onConvertToGroup={onConvertToGroup}
              />
            )
          })}
        </div>
      </SortableContext>
    </div>
  )
}
