import { useEffect, useRef, useCallback } from 'react'
import type { OutboundMessage } from '@shared/messages'

type Handler = (msg: OutboundMessage) => void

const WS_URL = (boardId: string, token: string) => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws?board=${boardId}&token=${token}`
}

export function useWebSocket(boardId: string, token: string | null, onMessage: Handler, onClose: (code: number) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1000)
  const deadRef = useRef(false)

  const connect = useCallback(() => {
    if (!token || deadRef.current) return

    const ws = new WebSocket(WS_URL(boardId, token))
    wsRef.current = ws

    ws.onopen = () => { backoffRef.current = 1000 }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as OutboundMessage
        onMessage(msg)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = (e) => {
      if (e.code === 4001 || e.code === 4004) {
        deadRef.current = true
        onClose(e.code)
        return
      }
      // Exponential backoff reconnect
      const delay = Math.min(backoffRef.current, 30_000)
      backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
      setTimeout(connect, delay)
    }
  }, [boardId, token, onMessage, onClose])

  useEffect(() => {
    deadRef.current = false
    connect()
    return () => {
      deadRef.current = true
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((msg: object) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  return { send }
}
