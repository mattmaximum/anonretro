import { useState } from 'react'
import type { CardData } from '@shared/messages'
import Card from './Card.js'

interface Props {
  name: string
  cards: CardData[]
  revealedIds: Set<string>
  revealSequence: string[]
  myVotes: Set<string>
  onAddCard: (content: string) => void
  onVote: (cardId: string) => void
  onEdit: (cardId: string, content: string) => void
  onDelete: (cardId: string) => void
}

export default function Column({ name, cards, revealedIds, revealSequence, myVotes, onAddCard, onVote, onEdit, onDelete }: Props) {
  const [draft, setDraft] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    onAddCard(trimmed)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-text-2 px-1">{name}</h2>

      {/* Add card input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Write what's on your mind"
          className="flex-1 bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active transition-colors"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="bg-accent hover:bg-accent-hover text-white text-sm font-medium px-3 py-2 rounded transition-colors disabled:opacity-40"
        >
          +
        </button>
      </form>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {cards.length === 0 && (
          <div className="border-dashed border border-border/40 bg-surface rounded flex items-center justify-center h-[72px]">
            <span className="text-text-3 text-xs">No cards yet</span>
          </div>
        )}
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            revealedIds={revealedIds}
            revealIndex={revealSequence.indexOf(card.id)}
            myVotes={myVotes}
            onVote={onVote}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
