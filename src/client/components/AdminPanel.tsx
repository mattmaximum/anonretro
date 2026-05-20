import { useState } from 'react'
import type { TimerState } from '@shared/messages'
import TimerDisplay from './TimerDisplay.js'

interface Props {
  adminToken: string
  blurEnabled: boolean
  timer: TimerState
  boardId: string
  onSend: (msg: object) => void
}

function DeleteDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-raised rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
        <h3 className="font-semibold text-text-1">Delete this board?</h3>
        <p className="text-text-2 text-sm">All cards, votes, and participants will be permanently removed. Everyone will be redirected to the home page. This can't be undone.</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="flex-1 bg-danger hover:bg-danger/80 text-white font-medium py-2 rounded transition-colors text-sm">
            Delete board
          </button>
          <button onClick={onCancel} className="flex-1 text-text-2 hover:text-text-1 border border-border rounded py-2 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function RevealDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-raised rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
        <h3 className="font-semibold text-text-1">Reveal all cards?</h3>
        <p className="text-text-2 text-sm">Everyone will see every card at once. This can't be undone.</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="flex-1 bg-accent hover:bg-accent-hover text-white font-medium py-2 rounded transition-colors">
            Reveal
          </button>
          <button onClick={onCancel} className="flex-1 text-text-2 hover:text-text-1 border border-border rounded py-2 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

export default function AdminPanel({ adminToken, blurEnabled, timer, boardId, onSend }: Props) {
  const [duration, setDuration] = useState(30)  // seconds
  const [label, setLabel] = useState('')
  const [showRevealDialog, setShowRevealDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const timerRunning = timer.expires_at !== null && timer.paused_at === null
  const timerPaused = timer.expires_at !== null && timer.paused_at !== null

  function startTimer() {
    onSend({ type: 'admin:timer_start', admin_token: adminToken, duration_seconds: duration, label })
    setLabel('')
  }

  async function handleDeleteConfirm() {
    setDeleting(true)
    setShowDeleteDialog(false)
    try {
      await fetch(`/api/boards/${boardId}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken },
      })
    } finally {
      window.location.href = '/'
    }
  }

  function handleRevealConfirm() {
    setShowRevealDialog(false)
    // Play chime inside click handler (Safari gate)
    playChime()
    onSend({ type: 'admin:reveal', admin_token: adminToken })
  }

  return (
    <>
      {showDeleteDialog && (
        <DeleteDialog
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
      {showRevealDialog && (
        <RevealDialog
          onConfirm={handleRevealConfirm}
          onCancel={() => setShowRevealDialog(false)}
        />
      )}

      <div className="flex flex-col gap-4">
        {/* Blur toggle / Reveal */}
        <div className="flex flex-col gap-2">
          <p className="text-text-2 text-xs font-medium uppercase tracking-wide">Cards</p>
          {blurEnabled ? (
            <button
              onClick={() => setShowRevealDialog(true)}
              className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2 rounded text-sm transition-colors"
            >
              Reveal all cards
            </button>
          ) : (
            <button
              onClick={() => onSend({ type: 'admin:blur_toggle', admin_token: adminToken })}
              className="w-full border border-border hover:border-border-active text-text-2 hover:text-text-1 py-2 rounded text-sm transition-colors"
            >
              Hide cards again
            </button>
          )}
        </div>

        {/* Timer */}
        <div className="flex flex-col gap-2">
          <p className="text-text-2 text-xs font-medium uppercase tracking-wide">Timer</p>
          <TimerDisplay timer={timer} />

          {!timerRunning && !timerPaused ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-text-3">
                <span>Duration</span>
                <span>{formatDuration(duration)}</span>
              </div>
              <input
                type="range"
                min={30}
                max={3600}
                step={30}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Label (optional)"
                className="bg-base border border-border rounded px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-active"
              />
              <button
                onClick={startTimer}
                disabled={duration < 30}
                className="w-full bg-success/20 hover:bg-success/30 text-success font-medium py-1.5 rounded text-sm transition-colors disabled:opacity-40"
              >
                Start timer
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {timerRunning && (
                <button
                  onClick={() => onSend({ type: 'admin:timer_pause', admin_token: adminToken })}
                  className="flex-1 border border-border text-text-2 hover:text-text-1 py-1.5 rounded text-xs transition-colors"
                >
                  Pause
                </button>
              )}
              {timerPaused && (
                <button
                  onClick={() => onSend({ type: 'admin:timer_resume', admin_token: adminToken })}
                  className="flex-1 border border-border text-text-2 hover:text-text-1 py-1.5 rounded text-xs transition-colors"
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => onSend({ type: 'admin:timer_cancel', admin_token: adminToken })}
                className="flex-1 border border-border text-text-2 hover:text-danger py-1.5 rounded text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Export */}
        <div className="border-t border-border pt-3">
          <a
            href={`/api/boards/${window.location.pathname.split('/').pop()}/export.csv`}
            download
            onClick={e => {
              const boardId = window.location.pathname.split('/').pop()
              const url = `/api/boards/${boardId}/export.csv`
              e.preventDefault()
              const a = document.createElement('a')
              a.href = url
              a.setAttribute('download', `retro-${boardId}.csv`)
              const headers = new Headers({ 'x-admin-token': adminToken })
              fetch(url, { headers }).then(r => r.blob()).then(b => {
                a.href = URL.createObjectURL(b)
                a.click()
              })
            }}
            className="block text-center text-text-2 hover:text-text-1 text-xs py-1.5 rounded border border-border transition-colors"
          >
            Export CSV
          </a>
        </div>

        {/* Danger zone */}
        <div className="border-t border-danger/30 pt-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleting}
            className="w-full text-danger hover:text-danger/70 text-xs py-1.5 rounded border border-danger/30 hover:border-danger/50 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete board'}
          </button>
        </div>
      </div>
    </>
  )
}

function playChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 440
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  } catch { /* AudioContext blocked — acceptable */ }
}
