import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { CardData } from '@shared/messages'

interface Props {
  card: CardData
  revealedIds: Set<string>
  revealIndex: number
  locked: boolean
  isExpanded: boolean
  isAdmin?: boolean
  isDraggingActive?: boolean
  onExpand: () => void
  onCollapse: () => void
  onVote: (cardId: string) => void
  onEdit: (cardId: string, content: string) => void
  onDelete: (cardId: string) => void
  myVotes: Set<string>
}


export default function Card({ card, revealedIds, revealIndex, locked, isExpanded, isAdmin, isDraggingActive, onExpand, onCollapse, onVote, onEdit, onDelete, myVotes }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.content)
  const contentRef = useRef<HTMLParagraphElement>(null)
  const [isClamped, setIsClamped] = useState(false)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !isAdmin || locked,
  })

  // Detect whether the content actually overflows 5 lines (only meaningful when collapsed)
  useLayoutEffect(() => {
    if (isExpanded) return
    const el = contentRef.current
    if (!el) return
    setIsClamped(el.scrollHeight > el.clientHeight)
  }, [card.content, isExpanded])

  // Auto-collapse when card becomes blurred (facilitator hid cards)
  useEffect(() => {
    if (card.blur) onCollapse()
  }, [card.blur])
  const isRevealing = revealedIds.has(card.id)
  const voted = myVotes.has(card.id)

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : {}
  const revealStyle = isRevealing
    ? { transition: `opacity 0.4s ease ${revealIndex * 50}ms` }
    : {}

  return (
    <div
      ref={setNodeRef}
      className={`bg-surface border border-border rounded p-3 flex gap-2 group ${isDragging || isDraggingActive ? 'opacity-40' : ''}`}
      style={{ ...dragStyle, ...revealStyle }}
      role="article"
      {...attributes}
    >
      {/* Drag handle — facilitator only */}
      {isAdmin && !locked && (
        <button
          {...listeners}
          className="flex-shrink-0 text-text-3 hover:text-text-2 cursor-grab active:cursor-grabbing self-start mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          aria-label="Drag to move card"
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
      {card.blur ? (
        <>
          <p className="text-sm italic leading-relaxed select-none text-text-1" aria-label="Hidden card">{card.content}</p>
          <span className="text-text-3 text-[11px] not-italic">(Hidden: wait for facilitator)</span>
        </>
      ) : editing ? (
        <form
          onSubmit={e => {
            e.preventDefault()
            if (draft.trim()) { onEdit(card.id, draft.trim()); setEditing(false) }
          }}
        >
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={500}
            autoFocus
            className="w-full bg-raised border border-border-active rounded p-2 text-sm text-text-1 resize-none outline-none"
            rows={3}
          />
          <div className="flex gap-2 mt-2">
            <button type="submit" className="text-xs text-accent hover:text-accent-hover font-medium">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-text-3 hover:text-text-2">Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <p
            ref={contentRef}
            className={`text-sm text-text-1 leading-relaxed whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-5'}`}
          >
            {card.content}
          </p>
          {isClamped && (
            <button
              onClick={isExpanded ? onCollapse : onExpand}
              className="text-accent text-xs hover:underline self-start"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-text-3 text-xs">{card.is_own ? 'You' : (card.author ?? '')}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit / delete (own cards only, not while revealing) */}
          {card.is_own && !editing && !locked && (
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                onClick={() => { setDraft(card.content); setEditing(true) }}
                className="text-text-3 hover:text-text-2 text-xs px-1"
                aria-label="Edit card"
              >
                ✎
              </button>
              <button
                onClick={() => onDelete(card.id)}
                className="text-text-3 hover:text-danger text-xs px-1"
                aria-label="Delete card"
              >
                ✕
              </button>
            </div>
          )}

          {/* Vote button */}
          <button
            onClick={() => !locked && onVote(card.id)}
            disabled={locked}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              voted
                ? 'bg-accent-muted text-accent'
                : 'bg-transparent text-text-3 hover:text-text-2'
            }`}
            aria-label={voted ? 'Remove vote' : 'Vote for this card'}
            aria-pressed={voted}
          >
            <span aria-hidden>▲</span>
            <span>{card.votes}</span>
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
