import { useEffect } from 'react'

const LS_CHECKOUT_LIFETIME = import.meta.env.VITE_LS_CHECKOUT_LIFETIME as string | undefined
const LS_CHECKOUT_ANNUAL = import.meta.env.VITE_LS_CHECKOUT_ANNUAL as string | undefined
const LS_CHECKOUT_UPGRADE = import.meta.env.VITE_LS_CHECKOUT_UPGRADE as string | undefined

interface Props {
  clerkUserId?: string
  onClose: () => void
  upgradeOnly?: boolean
}

function buildCheckoutUrl(base: string | undefined, clerkUserId: string | undefined) {
  if (!base || !clerkUserId) return null
  return `${base}?checkout[custom][clerk_user_id]=${encodeURIComponent(clerkUserId)}`
}

export default function UpgradeModal({ clerkUserId, onClose, upgradeOnly = false }: Props) {
  const lifetimeUrl = buildCheckoutUrl(LS_CHECKOUT_LIFETIME, clerkUserId)
  const annualUrl = buildCheckoutUrl(LS_CHECKOUT_ANNUAL, clerkUserId)
  const upgradeUrl = buildCheckoutUrl(LS_CHECKOUT_UPGRADE, clerkUserId)

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
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative bg-surface border border-border rounded-xl p-8 w-full max-w-lg flex flex-col gap-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-3 hover:text-text-2 transition-colors"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {upgradeOnly ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-text-1 font-medium">Own it forever</p>
              <p className="text-text-2 text-sm leading-relaxed">
                You're on the annual plan. Add $11 once and never pay again — lifetime access, no renewals.
              </p>
            </div>
            <div className="flex flex-col gap-3 border border-accent rounded-lg p-5 relative">
              <span className="absolute -top-2.5 left-3 bg-accent text-white text-xs font-medium px-2 py-0.5 rounded-full">
                One-time upgrade
              </span>
              <div>
                <p className="text-text-1 font-medium text-sm">Annual → Lifetime</p>
                <p className="text-text-1 text-xl font-semibold mt-1">$11<span className="text-text-3 text-sm font-normal"> once</span></p>
              </div>
              <p className="text-text-3 text-xs leading-relaxed">Locks in lifetime access on top of your current plan. No future charges.</p>
              {upgradeUrl ? (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="bg-accent hover:bg-accent-hover text-white text-sm font-medium py-2 px-3 rounded text-center transition-colors"
                >
                  Upgrade to lifetime — $11
                </a>
              ) : (
                <button disabled className="bg-accent opacity-50 text-white text-sm font-medium py-2 px-3 rounded text-center cursor-not-allowed">
                  Coming soon
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-text-1 font-medium">Unlock unlimited boards</p>
              <p className="text-text-2 text-sm leading-relaxed">
                One person built this. It costs about $250/year to run and your contribution supports the project.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Annual */}
              <div className="flex flex-col gap-3 border border-border rounded-lg p-4">
                <div>
                  <p className="text-text-1 font-medium text-sm">Annual</p>
                  <p className="text-text-1 text-xl font-semibold mt-1">$19<span className="text-text-3 text-sm font-normal">/yr</span></p>
                </div>
                <p className="text-text-3 text-xs leading-relaxed">Unlimited boards. Renews yearly.</p>
                {annualUrl ? (
                  <a
                    href={annualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="border border-border hover:border-text-2 text-text-1 text-sm font-medium py-2 px-3 rounded text-center transition-colors"
                  >
                    Get annual
                  </a>
                ) : (
                  <button disabled className="border border-border text-text-3 text-sm font-medium py-2 px-3 rounded text-center cursor-not-allowed opacity-50">
                    Coming soon
                  </button>
                )}
              </div>
              {/* Lifetime */}
              <div className="flex flex-col gap-3 border border-accent rounded-lg p-4 relative">
                <span className="absolute -top-2.5 left-3 bg-accent text-white text-xs font-medium px-2 py-0.5 rounded-full">
                  Best value
                </span>
                <div>
                  <p className="text-text-1 font-medium text-sm">Lifetime</p>
                  <p className="text-text-1 text-xl font-semibold mt-1">$29<span className="text-text-3 text-sm font-normal"> once</span></p>
                </div>
                <p className="text-text-3 text-xs leading-relaxed">Unlimited boards, forever. No renewals.</p>
                {lifetimeUrl ? (
                  <a
                    href={lifetimeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="bg-accent hover:bg-accent-hover text-white text-sm font-medium py-2 px-3 rounded text-center transition-colors"
                  >
                    Get lifetime — $29
                  </a>
                ) : (
                  <button disabled className="bg-accent opacity-50 text-white text-sm font-medium py-2 px-3 rounded text-center cursor-not-allowed">
                    Coming soon
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="text-text-3 hover:text-text-2 text-sm py-1 transition-colors text-center"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
