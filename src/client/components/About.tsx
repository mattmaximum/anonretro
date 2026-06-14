import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()
  useEffect(() => {
    document.title = 'About — AnonRetro'
    return () => { document.title = 'AnonRetro — Retrospectives without anchoring bias' }
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center p-6 py-12">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-text-3 text-sm hover:text-text-2 transition-colors mb-6 flex items-center gap-1"
          >
            ← Back to home
          </button>
          <h1 className="text-2xl font-semibold text-text-1">About AnonRetro</h1>
        </div>

        <section className="flex flex-col gap-3">
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro was built to eliminate anchoring bias in retrospectives. When people can
            see each other's cards as they're written, they anchor on the first thing posted —
            the loudest voice sets the tone before the conversation starts.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            Cards stay hidden until the facilitator reveals them. Everyone writes independently.
            Everything surfaces at once. No one can follow someone else's lead.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            The hiding is enforced at the data layer — the server sends <code className="text-text-1 bg-raised px-1 py-0.5 rounded text-xs">content: null</code> to
            non-owners over WebSocket, so browser devtools and screen readers can't leak other
            people's cards. It's not CSS.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">How it works</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Facilitators create a board and share the link. Participants join instantly — no
            account, no setup. Cards stay hidden during the writing phase. When the facilitator
            reveals, everything appears at once with a staggered animation.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            Free accounts support 1 active board. Upgrade for unlimited boards:
          </p>
          <ul className="text-text-2 text-sm leading-relaxed list-disc list-inside flex flex-col gap-1 pl-1">
            <li><span className="font-medium text-text-1">Annual — $19/yr.</span> Unlimited boards, renews yearly. Cancel anytime; access continues until the end of the billing period.</li>
            <li><span className="font-medium text-text-1">Lifetime — $29 once.</span> Unlimited boards, forever. No renewals, no future charges.</li>
            <li><span className="font-medium text-text-1">Annual → Lifetime upgrade — $11.</span> Already on annual? Lock in lifetime access for $11 more.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Keep it running</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro costs about $250/year to host. Your contribution supports the project and
            keeps it alive. One person built this.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Refunds &amp; cancellations</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            <span className="font-medium text-text-1">Refunds —</span> 30-day no-questions-asked refund on any purchase. Email <a href="mailto:mattmcx@gmail.com" className="hover:text-text-2 transition-colors underline">mattmcx@gmail.com</a> and I'll sort it out. Access is revoked immediately on refund.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            <span className="font-medium text-text-1">Cancellations —</span> Cancel your annual subscription anytime via the link in your purchase receipt. Access continues until the end of your current billing period — no proration, no partial refunds on cancel.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            After 30 days, purchases are non-refundable.
          </p>
        </section>

        <p className="text-text-3 text-sm">Made by Matt — <a href="mailto:mattmcx@gmail.com" className="hover:text-text-2 transition-colors">mattmcx@gmail.com</a></p>
      </div>
    </div>
  )
}
