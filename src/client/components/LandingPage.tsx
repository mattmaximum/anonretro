import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FORMATS } from '@shared/formats'
import { storage } from '../lib/storage.js'

export default function LandingPage() {
  const navigate = useNavigate()
  const [format, setFormat] = useState(FORMATS[0].id)
  const [title, setTitle] = useState('')
  const [joinId, setJoinId] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!title.trim()) { setError('Board title is required.'); return }
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, title: title.trim() }),
      })
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
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-text-1 tracking-tight">AnonRetro</h1>
        <p className="text-text-2 mt-2 text-sm">Anonymous retrospectives. No accounts. Free to use.</p>
      </div>

      {/* Create a new board */}
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg px-6 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-text-1 flex-shrink-0">Create a new board</h2>
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
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex flex-col gap-1.5">
          <span className="text-text-3 text-xs font-medium">Board format:</span>
          <div className="flex flex-wrap gap-2">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                format === f.id
                  ? 'bg-accent-muted text-accent font-medium'
                  : 'text-text-2 hover:bg-raised hover:text-text-1'
              }`}
            >
              {f.name}
            </button>
          ))}
          </div>
        </div>
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
      </p>
    </div>
  )
}
