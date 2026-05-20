import { useEffect, useRef, useState } from 'react'
import type { TimerState } from '@shared/messages'

interface Props {
  timer: TimerState
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60)
  const s = Math.abs(seconds) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function TimerDisplay({ timer }: Props) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const wasExpiredRef = useRef(false)

  // Play chime exactly once when the countdown crosses zero
  useEffect(() => {
    const expired = remaining !== null && remaining <= 0
    if (expired && !wasExpiredRef.current) {
      playTimerChime()
    }
    wasExpiredRef.current = expired
  }, [remaining])

  useEffect(() => {
    if (!timer.expires_at) { setRemaining(null); return }

    if (timer.paused_at) {
      setRemaining(timer.expires_at - timer.paused_at)
      return
    }

    const tick = () => {
      const r = Math.floor((timer.expires_at! * 1000 - Date.now()) / 1000)
      setRemaining(r)
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [timer.expires_at, timer.paused_at])

  // Reset expired tracking when a new timer starts
  useEffect(() => {
    if (timer.expires_at === null) wasExpiredRef.current = false
  }, [timer.expires_at])

  if (remaining === null) return null

  const expired = remaining <= 0
  const urgent = remaining <= 60 && !expired

  return (
    <div className="flex flex-col gap-0.5">
      {timer.label && (
        <p className="text-text-3 text-xs">{timer.label}</p>
      )}
      <p
        className={`text-2xl font-semibold tabular-nums ${
          expired ? 'text-danger' :
          urgent ? 'text-warning animate-pulse-slow' :
          'text-success'
        }`}
      >
        {expired ? "Time's up" : (timer.paused_at ? '⏸ ' : '') + formatTime(remaining)}
      </p>
    </div>
  )
}

function playTimerChime() {
  try {
    const ctx = new AudioContext()
    const notes = [523, 392] // C5 → G4 — descending two-tone
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  } catch { /* AudioContext blocked — silent fallback */ }
}
