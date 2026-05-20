import { useState } from 'react'
import type { CardData } from '@shared/messages'

interface Props {
  card: CardData
  revealedIds: Set<string>
  revealIndex: number
  onVote: (cardId: string) => void
  onEdit: (cardId: string, content: string) => void
  onDelete: (cardId: string) => void
  myVotes: Set<string>
}

export default function Card({ card, revealedIds, revealIndex, onVote, onEdit, onDelete, myVotes }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.content ?? '')
  const isRevealing = revealedIds.has(card.id)
  const voted = myVotes.has(card.id)

  // Reveal stagger animation: delay = index * 50ms
  const revealStyle = isRevealing
    ? { opacity: 1, transition: `opacity 0.4s ease ${revealIndex * 50}ms` }
    : card.blur
    ? { opacity: 1 }
    : {}

  if (card.blur) {
    return (
      <div
        className="w-full rounded border border-border bg-blur-fill"
        style={{ height: 72 }}
        aria-label="Hidden card"
        role="article"
      />
    )
  }

  return (
    <div
      className="bg-surface border border-border rounded p-3 flex flex-col gap-2 group"
      style={revealStyle}
      role="article"
    >
      {editing ? (
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
        <p className="text-sm text-text-1 leading-relaxed whitespace-pre-wrap">{card.content}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-text-3 text-xs">{card.is_own ? 'You' : (card.author ?? '')}</span>

        <div className="flex items-center gap-2">
          {/* Edit / delete (own cards only, not while revealing) */}
          {card.is_own && !editing && !revealedIds.size && (
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                onClick={() => { setDraft(card.content ?? ''); setEditing(true) }}
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
            onClick={() => onVote(card.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
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
  )
}
