import { useState } from 'react'
import type { TimerState } from '@shared/messages'
import TimerDisplay from './TimerDisplay.js'

interface Props {
  adminToken: string
  blurEnabled: boolean
  locked: boolean
  timer: TimerState
  boardId: string
  onSend: (msg: object) => void
  onShare: () => void
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

function downloadExport(boardId: string, adminToken: string, fmt: 'csv' | 'json' | 'md') {
  const url = `/api/boards/${boardId}/export.${fmt}`
  fetch(url, { headers: { 'x-admin-token': adminToken } })
    .then(r => r.blob())
    .then(b => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.setAttribute('download', `retro-${boardId}.${fmt}`)
      a.click()
    })
}

export default function AdminPanel({ adminToken, blurEnabled, locked, timer, boardId, onSend, onShare }: Props) {
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
        {/* Share */}
        <button
          onClick={onShare}
          className="w-full border border-border hover:border-border-active text-text-2 hover:text-text-1 py-2 rounded text-sm transition-colors flex items-center justify-center gap-2"
        >
          <span>⬆</span> Share / QR Code
        </button>

        {/* Board — lock + reveal */}
        <div className="flex flex-col gap-2">
          <p className="text-text-2 text-xs font-medium uppercase tracking-wide">Board</p>
          <button
            onClick={() => onSend({ type: 'admin:lock_toggle', admin_token: adminToken })}
            className={locked
              ? 'w-full border border-border hover:border-border-active text-text-2 hover:text-text-1 py-2 rounded text-sm transition-colors'
              : 'w-full border border-warning/50 hover:border-warning/80 bg-warning/10 hover:bg-warning/20 text-warning font-medium py-2 rounded text-sm transition-colors'
            }
          >
            {locked ? 'Unlock board' : 'Lock board'}
          </button>
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
                max={1800}
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
                className="w-full border border-success/50 hover:border-success/80 bg-success/10 hover:bg-success/20 text-success font-medium py-1.5 rounded text-sm transition-colors disabled:opacity-40"
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
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-xs text-text-2">Export</p>
          <div className="flex gap-1.5">
            {(['csv', 'json', 'md'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => downloadExport(boardId, adminToken, fmt)}
                className="flex-1 text-center text-text-2 hover:text-text-1 text-xs py-1.5 rounded border border-border transition-colors uppercase tracking-wide"
              >
                {fmt}
              </button>
            ))}
          </div>
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
