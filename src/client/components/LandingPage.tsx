import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth, useUser, SignInButton, UserButton } from '@clerk/react'
import { FORMATS } from '@shared/formats'
import { storage } from '../lib/storage.js'
import UpgradeModal from './UpgradeModal.js'

export default function LandingPage() {
  const navigate = useNavigate()
  const { getToken, isLoaded: authLoaded } = useAuth()
  const { isSignedIn, user } = useUser()
  const [format, setFormat] = useState(FORMATS[0].id)
  const [title, setTitle] = useState('')
  const [joinId, setJoinId] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [freeLimit, setFreeLimit] = useState(3)
  const [isPro, setIsPro] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const formatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isSignedIn) return
    getToken().then(token => {
      if (!token) return
      fetch('/api/me/boards', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { setActiveCount(d.activeCount); setIsPro(d.isPro); setFreeLimit(d.limit) })
        .catch(() => {})
    })
  }, [isSignedIn])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) {
        setFormatOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleCreate() {
    if (!title.trim()) { setError('Board title is required.'); return }
    setCreating(true)
    setError('')
    try {
      const token = await getToken()
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ format, title: title.trim() }),
      })
      if (res.status === 402) {
        setError('BOARD_LIMIT_REACHED')
        return
      }
      if (!res.ok) throw new Error('Failed to create board')
      const data = await res.json()
      storage.setAdminToken(data.id, data.admin_token)
      navigate(`/b/${data.id}?new=1`)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const id = joinId.trim().split('/').pop() ?? joinId.trim()
    if (!id) return
    navigate(`/b/${id}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-12">
      {showUpgrade && (
        <UpgradeModal clerkUserId={user?.id} onClose={() => setShowUpgrade(false)} />
      )}

      <div className="text-center">
        <div className="flex items-center justify-center gap-2.5">
          <h1 className="text-3xl font-semibold text-text-1 tracking-tight">AnonRetro</h1>
          <span className="text-xs font-medium text-text-3 border border-border rounded px-1.5 py-0.5 tracking-wide uppercase">Beta</span>
        </div>
        <p className="text-text-2 mt-2 text-sm">You create an account, share a link, and your team joins instantly — no sign-up and everyone's anonymous.</p>
      </div>

      {/* Create a new board */}
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg px-6 py-4 flex flex-col gap-3">
        {authLoaded && !isSignedIn ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-text-1">Create a board</h2>
              <p className="text-text-3 text-sm mt-0.5">Sign in to create and facilitate retros.</p>
            </div>
            <SignInButton mode="modal">
              <button className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors flex-shrink-0">
                Sign in
              </button>
            </SignInButton>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-text-1 flex-shrink-0">Board name</h2>
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); if (error === 'Board title is required.') setError('') }}
                maxLength={100}
                placeholder="Board title (e.g. Sprint 42 Retro)"
                className={`flex-1 bg-raised border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active ${error === 'Board title is required.' ? 'border-danger' : 'border-border'}`}
              />
              <button
                onClick={handleCreate}
                disabled={creating}
                className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {creating ? 'Creating…' : 'Create board'}
              </button>
              <UserButton />
            </div>
            {error === 'BOARD_LIMIT_REACHED' ? (
              <p className="text-danger text-sm">
                You've reached the limit of 3 active boards.{' '}
                <Link to="/dashboard" className="underline">Delete a board</Link>
                {' '}to make room, or{' '}
                <button onClick={() => setShowUpgrade(true)} className="underline">upgrade for unlimited</button>.
              </p>
            ) : error ? (
              <p className="text-danger text-sm">{error}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-text-1 flex-shrink-0">Pick a format</h2>
              <div className="relative group flex-shrink-0">
                <Link
                  to="/formats"
                  className="w-4 h-4 rounded-full border border-border text-text-3 text-[10px] font-semibold flex items-center justify-center hover:border-border-active hover:text-text-1 transition-colors"
                >
                  ?
                </Link>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface border border-border rounded text-xs text-text-1 whitespace-nowrap shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                  Help me choose
                </div>
              </div>
              <div className="relative" ref={formatRef}>
                <button
                  type="button"
                  onClick={() => setFormatOpen(o => !o)}
                  className="flex items-center justify-between gap-3 w-full bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 hover:border-border-active transition-colors"
                >
                  <span>{FORMATS.find(f => f.id === format)?.name}</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`flex-shrink-0 transition-transform duration-150 ${formatOpen ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {formatOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-20 py-1 overflow-hidden">
                    {FORMATS.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => { setFormat(f.id); setFormatOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          format === f.id
                            ? 'text-accent font-medium bg-accent-muted'
                            : 'text-text-1 hover:bg-raised'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {!isPro && activeCount !== null && (
              <p className="text-text-3 text-xs">
                {activeCount} of {freeLimit} active boards used ·{' '}
                <Link to="/dashboard" className="hover:text-text-2 transition-colors">Manage boards</Link>
                {activeCount >= freeLimit && (
                  <> · <button onClick={() => setShowUpgrade(true)} className="hover:text-text-2 transition-colors">Upgrade for unlimited</button></>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {/* Join a board */}
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg px-6 py-4 flex items-center gap-6">
        <h2 className="font-semibold text-text-1 flex-shrink-0">Join a board</h2>
        <form onSubmit={handleJoin} className="flex flex-1 gap-3">
          <input
            type="text"
            value={joinId}
            onChange={e => setJoinId(e.target.value)}
            placeholder="Paste board link or ID"
            className="flex-1 bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active"
          />
          <button
            type="submit"
            disabled={!joinId.trim() || joining}
            className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 flex-shrink-0"
          >
            Join board
          </button>
        </form>
      </div>

      <p className="text-text-3 text-xs flex gap-4">
        <Link to="/about" className="hover:text-text-2 transition-colors">About</Link>
        <Link to="/privacy" className="hover:text-text-2 transition-colors">Privacy Policy</Link>
        <a href="https://github.com/mattmaximum/anonretro/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" className="hover:text-text-2 transition-colors">Changelog</a>
        {isSignedIn && !isPro && (
          <button onClick={() => setShowUpgrade(true)} className="hover:text-text-2 transition-colors">Upgrade</button>
        )}
      </p>
    </div>
  )
}
