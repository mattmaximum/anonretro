import type { GroupData, CardData } from '@shared/messages'

interface Props {
  group: GroupData
  isAdmin?: boolean
  locked: boolean
  myVotes: Set<string>
  onClose: () => void
  onVote: (cardId: string) => void
  onUnstack: (cardId: string, groupId: string) => void
}

export default function GroupModal({ group, isAdmin, locked, myVotes, onClose, onVote, onUnstack }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-raised border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col gap-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-text-1">{group.child_cards.length} grouped cards</p>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-1 transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Cards */}
        <div className="flex flex-col divide-y divide-border max-h-[60vh] overflow-y-auto">
          {group.child_cards.map(card => (
            <ChildCard
              key={card.id}
              card={card}
              groupId={group.id}
              isAdmin={isAdmin}
              locked={locked}
              myVotes={myVotes}
              onVote={onVote}
              onUnstack={onUnstack}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ChildCard({ card, groupId, isAdmin, locked, myVotes, onVote, onUnstack }: {
  card: CardData
  groupId: string
  isAdmin?: boolean
  locked: boolean
  myVotes: Set<string>
  onVote: (cardId: string) => void
  onUnstack: (cardId: string, groupId: string) => void
}) {
  const voted = myVotes.has(card.id)

  return (
    <div className="flex gap-3 px-4 py-3 group/card">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {card.blur
          ? <p className="text-sm italic text-text-1">{card.content}</p>
          : <p className="text-sm text-text-1 whitespace-pre-wrap">{card.content}</p>
        }
        <span className="text-text-3 text-xs">{card.is_own ? 'You' : (card.author ?? '')}</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 self-start mt-0.5">
        {/* Unlink button — admin only */}
        {isAdmin && !locked && (
          <button
            onClick={() => onUnstack(card.id, groupId)}
            className="text-text-3 hover:text-text-1 transition-colors opacity-0 group-hover/card:opacity-100"
            title="Click to unlink from group"
            aria-label="Unlink from group"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              <line x1="4" y1="4" x2="20" y2="20" />
            </svg>
          </button>
        )}

        {/* Vote button */}
        <button
          onClick={() => !locked && onVote(card.id)}
          disabled={locked}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            voted ? 'bg-accent-muted text-accent' : 'bg-transparent text-text-3 hover:text-text-2'
          }`}
          aria-label={voted ? 'Remove vote' : 'Vote for this card'}
          aria-pressed={voted}
        >
          <span aria-hidden>▲</span>
          <span>{card.votes}</span>
        </button>
      </div>
    </div>
  )
}
