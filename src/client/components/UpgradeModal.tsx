import { useEffect } from 'react'

const LS_CHECKOUT_BASE = import.meta.env.VITE_LEMON_SQUEEZY_CHECKOUT_URL as string | undefined

interface Props {
  clerkUserId?: string
  onClose: () => void
}

export default function UpgradeModal({ clerkUserId, onClose }: Props) {
  const checkoutUrl = clerkUserId && LS_CHECKOUT_BASE
    ? `${LS_CHECKOUT_BASE}?checkout[custom][clerk_user_id]=${encodeURIComponent(clerkUserId)}`
    : null

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div className="relative bg-surface border border-border rounded-xl p-8 w-full max-w-sm flex flex-col gap-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-3 hover:text-text-2 transition-colors"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="flex flex-col gap-3">
          <p className="text-text-2 text-sm leading-relaxed">
            Free accounts get 3 active boards.
          </p>
          <p className="text-text-1 font-medium">
            $29 once → unlimited boards, forever.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            That's it. The money covers hosting. This isn't a business — it's a tool that should exist.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="bg-accent hover:bg-accent-hover text-white text-sm font-medium py-2.5 px-4 rounded text-center transition-colors"
            >
              Get lifetime access — $29
            </a>
          ) : (
            <button
              disabled
              className="bg-accent opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded text-center cursor-not-allowed"
            >
              Coming soon
            </button>
          )}
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-2 text-sm py-1 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
