import type { ParticipantData } from '@shared/messages'
import { avatarTextColor, COLOR_HEX } from '../lib/avatarColor.js'

interface Props {
  participants: ParticipantData[]
  myColor: string
  myAnimal: string
  isAdmin: boolean
}

export default function PresenceBar({ participants, myColor, myAnimal, isAdmin }: Props) {
  const MAX_VISIBLE = 8
  const visible = participants.slice(0, MAX_VISIBLE)
  const overflow = participants.length - MAX_VISIBLE

  const otherCount = participants.length - 1
  const you = `You're the ${myColor} ${myAnimal}${isAdmin ? ' · Facilitator' : ''}`
  const others = otherCount <= 0
    ? "You're the only one here so far."
    : otherCount === 1
      ? `joined by 1 other colorful animal. Don't reveal who you are unless you want to.`
      : `joined by ${otherCount} other colorful animals. Don't reveal who you are unless you want to.`
  const identityLabel = otherCount <= 0 ? you + '. ' + others : `${you}, ${others}`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {visible.map((p, i) => {
          const hex = COLOR_HEX[p.color] ?? '#888'
          const textColor = avatarTextColor(hex)
          const isMe = p.color === myColor && p.animal === myAnimal
          return (
            <div
              key={i}
              title={`${p.color} ${p.animal}${isMe ? ' (you)' : ''}`}
              className={`h-8 min-w-8 px-1.5 rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${isMe ? 'ring-2 ring-accent ring-offset-1 ring-offset-base' : ''}`}
              style={{ background: hex, color: textColor, fontSize: '9px' }}
              aria-label={`${p.color} ${p.animal}${isMe ? ' (you)' : ''}`}
            >
              {p.animal}
            </div>
          )
        })}
        {overflow > 0 && (
          <div className="px-2 h-8 rounded-full bg-raised text-text-2 text-xs flex items-center">
            +{overflow}
          </div>
        )}
      </div>
      <p className="text-text-3 text-[11px]">{identityLabel}</p>
    </div>
  )
}
