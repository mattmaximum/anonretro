import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { GroupData } from '@shared/messages'

interface Props {
  group: GroupData
  isAdmin?: boolean
  locked: boolean
  myVotes: Set<string>
  isDraggingActive?: boolean
  onVote: (cardId: string) => void
  onOpenModal: (groupId: string) => void
}

export default function GroupCard({ group, isAdmin, locked, myVotes, isDraggingActive, onVote, onOpenModal }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group:${group.id}`,
    disabled: !isAdmin || locked,
  })

  const dragStyle = { transform: CSS.Transform.toString(transform), transition }

  const firstCard = group.child_cards[0]
  const extraCount = group.child_cards.length - 1
  const aggregateVotes = group.child_cards.reduce((sum, c) => sum + c.votes, 0)
  const isBlurred = group.child_cards.every(c => c.blur)

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={`relative ${isDragging || isDraggingActive ? 'opacity-40' : ''}`}
      {...attributes}
    >
      {/* Stack shadow layers */}
      <div className="absolute inset-x-1.5 -bottom-1.5 h-full bg-surface border border-border rounded opacity-60 pointer-events-none" />
      {extraCount >= 2 && (
        <div className="absolute inset-x-3 -bottom-3 h-full bg-surface border border-border rounded opacity-40 pointer-events-none" />
      )}

      {/* Main card — div not button to allow nested drag-handle button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenModal(group.id)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpenModal(group.id) }}
        className="relative w-full bg-surface border border-accent/40 rounded p-3 flex gap-2 group text-left hover:border-accent/70 transition-colors cursor-pointer"
      >
        {/* Drag handle — facilitator only */}
        {isAdmin && !locked && (
          <button
            {...listeners}
            onClick={e => e.stopPropagation()}
            className="flex-shrink-0 text-text-3 hover:text-text-2 cursor-grab active:cursor-grabbing self-start mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
            aria-label="Drag to move group"
            tabIndex={-1}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2.5" cy="2.5" r="1.5"/>
              <circle cx="7.5" cy="2.5" r="1.5"/>
              <circle cx="2.5" cy="8" r="1.5"/>
              <circle cx="7.5" cy="8" r="1.5"/>
              <circle cx="2.5" cy="13.5" r="1.5"/>
              <circle cx="7.5" cy="13.5" r="1.5"/>
            </svg>
          </button>
        )}

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* First card preview */}
          {firstCard && (
            isBlurred
              ? <p className="text-sm italic text-text-1 line-clamp-2">{firstCard.content}</p>
              : <p className="text-sm text-text-1 line-clamp-2">{firstCard.content}</p>
          )}

          {/* "+N more" badge */}
          {extraCount > 0 && (
            <span className="text-xs text-accent font-medium">+{extraCount} more — click to view all</span>
          )}

          <div className="flex items-center justify-between">
            <span className="text-text-3 text-xs">{group.child_cards.length} cards grouped</span>

            {/* Aggregate vote count with tooltip */}
            <div
              className="relative group/vote"
              title="Vote on a specific card inside this group to add a vote"
            >
              <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-text-3 bg-transparent">
                <span aria-hidden>▲</span>
                <span>{aggregateVotes}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
