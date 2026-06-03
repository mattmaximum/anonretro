import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useUser, UserButton } from '@clerk/react'

interface Board {
  id: string
  title: string
  format: string
  created_at: number
  last_activity_at: number
  archived: number
}

interface MeBoards {
  boards: Board[]
  activeCount: number
  isPro: boolean
  limit: number
}

export default function Dashboard() {
  const { getToken, isLoaded } = useAuth()
  const { isSignedIn } = useUser()
  const navigate = useNavigate()
  const [data, setData] = useState<MeBoards | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoaded && !isSignedIn) navigate('/')
  }, [isLoaded, isSignedIn, navigate])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    fetchBoards()
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  async function fetchBoards() {
    const token = await getToken()
    const res = await fetch('/api/me/boards', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setData(await res.json())
  }

  async function handleDelete(boardId: string) {
    setDeleting(boardId)
    setError('')
    const token = await getToken()
    const res = await fetch(`/api/me/boards/${boardId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setConfirmId(null)
      await fetchBoards()
    } else {
      setError('Failed to delete board.')
    }
    setDeleting(null)
  }

  function startRename(board: Board) {
    setRenamingId(board.id)
    setRenameValue(board.title)
  }

  async function commitRename(boardId: string) {
    if (!renamingId) return
    const token = await getToken()
    await fetch(`/api/me/boards/${boardId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: renameValue }),
    })
    setRenamingId(null)
    await fetchBoards()
  }

  function formatDate(unixSecs: number) {
    return new Date(unixSecs * 1000).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  if (!isLoaded || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-3 text-sm">Loading…</p>
      </div>
    )
  }

  const activeBoards = data.boards.filter(b => b.archived === 0)

  return (
    <div className="min-h-screen flex flex-col items-center p-6 gap-8 pt-12">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-1 tracking-tight">My boards</h1>
          {!data.isPro && (
            <p className="text-text-3 text-sm mt-0.5">
              {data.activeCount} of {data.limit} active boards used
              {data.activeCount >= data.limit && (
                <> · <span className="text-accent">Upgrade for unlimited</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-text-3 hover:text-text-2 text-sm transition-colors">← Home</Link>
          <UserButton />
        </div>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      {activeBoards.length === 0 && (
        <div className="w-full max-w-2xl text-center py-12 text-text-3 text-sm">
          No boards yet. <Link to="/" className="text-accent hover:underline">Create one</Link>.
        </div>
      )}

      {activeBoards.length > 0 && (
        <div className="w-full max-w-2xl flex flex-col gap-3">
          {activeBoards.map(board => (
            <div key={board.id} className="bg-surface border border-border rounded-lg px-5 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {renamingId === board.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(board.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => commitRename(board.id)}
                    maxLength={100}
                    className="w-full bg-raised border border-border-active rounded px-2 py-1 text-sm text-text-1 outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Link
                      to={`/b/${board.id}`}
                      className="font-medium text-text-1 hover:text-accent transition-colors truncate"
                    >
                      {board.title || 'Untitled board'}
                    </Link>
                    <button
                      onClick={() => startRename(board)}
                      className="text-text-3 hover:text-text-1 transition-colors flex-shrink-0"
                      title="Rename"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-text-3 text-xs mt-0.5">
                  Last activity {formatDate(board.last_activity_at)} · {board.format}
                </p>
              </div>

              {confirmId === board.id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-text-3 text-xs">Delete forever?</span>
                  <button
                    onClick={() => handleDelete(board.id)}
                    disabled={deleting === board.id}
                    className="text-danger text-xs font-medium hover:text-danger transition-colors disabled:opacity-50"
                  >
                    {deleting === board.id ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="text-text-3 text-xs hover:text-text-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(board.id)}
                  className="text-danger text-xs hover:opacity-70 transition-opacity flex-shrink-0"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
