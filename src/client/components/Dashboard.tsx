import { useEffect, useState } from 'react'
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
  const [archiving, setArchiving] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoaded && !isSignedIn) navigate('/')
  }, [isLoaded, isSignedIn, navigate])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    fetchBoards()
  }, [isLoaded, isSignedIn])

  async function fetchBoards() {
    const token = await getToken()
    const res = await fetch('/api/me/boards', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setData(await res.json())
  }

  async function handleArchive(boardId: string) {
    setArchiving(boardId)
    setError('')
    const token = await getToken()
    const res = await fetch(`/api/me/boards/${boardId}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      await fetchBoards()
    } else {
      setError('Failed to archive board.')
    }
    setArchiving(null)
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
  const archivedBoards = data.boards.filter(b => b.archived === 1)

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

      {activeBoards.length === 0 && archivedBoards.length === 0 && (
        <div className="w-full max-w-2xl text-center py-12 text-text-3 text-sm">
          No boards yet. <Link to="/" className="text-accent hover:underline">Create one</Link>.
        </div>
      )}

      {activeBoards.length > 0 && (
        <div className="w-full max-w-2xl flex flex-col gap-3">
          {activeBoards.map(board => (
            <div key={board.id} className="bg-surface border border-border rounded-lg px-5 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <Link
                  to={`/b/${board.id}`}
                  className="font-medium text-text-1 hover:text-accent transition-colors truncate block"
                >
                  {board.title || 'Untitled board'}
                </Link>
                <p className="text-text-3 text-xs mt-0.5">
                  Last activity {formatDate(board.last_activity_at)} · {board.format}
                </p>
              </div>
              <button
                onClick={() => handleArchive(board.id)}
                disabled={archiving === board.id}
                className="text-text-3 hover:text-text-2 text-xs transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {archiving === board.id ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          ))}
        </div>
      )}

      {archivedBoards.length > 0 && (
        <div className="w-full max-w-2xl flex flex-col gap-2">
          <p className="text-text-3 text-xs font-medium uppercase tracking-wide">Archived</p>
          {archivedBoards.map(board => (
            <div key={board.id} className="bg-surface border border-border rounded-lg px-5 py-3 flex items-center gap-4 opacity-50">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-1 truncate">{board.title || 'Untitled board'}</p>
                <p className="text-text-3 text-xs mt-0.5">
                  Last activity {formatDate(board.last_activity_at)} · {board.format}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
