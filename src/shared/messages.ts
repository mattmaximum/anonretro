import { z } from 'zod'

// ── Inbound (client → server) ────────────────────────────────────────────────

export const InboundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card:add'),    column_id: z.string(), content: z.string().min(1).max(500) }),
  z.object({ type: z.literal('card:edit'),   id: z.string(),        content: z.string().min(1).max(500) }),
  z.object({ type: z.literal('card:delete'), id: z.string() }),
  z.object({ type: z.literal('vote:toggle'), card_id: z.string() }),
  z.object({ type: z.literal('admin:blur_toggle'),   admin_token: z.string() }),
  z.object({ type: z.literal('admin:reveal'),        admin_token: z.string() }),
  z.object({ type: z.literal('admin:timer_start'),   admin_token: z.string(), duration_seconds: z.number().int().min(1).max(3600), label: z.string().max(80) }),
  z.object({ type: z.literal('admin:timer_pause'),   admin_token: z.string() }),
  z.object({ type: z.literal('admin:timer_resume'),  admin_token: z.string() }),
  z.object({ type: z.literal('admin:timer_cancel'),  admin_token: z.string() }),
])

export type InboundMessage = z.infer<typeof InboundSchema>

// ── Outbound (server → client) ───────────────────────────────────────────────

export interface CardData {
  id: string
  column_id: string
  content: string         // scrambled (first 3 words + …) when blurred for this recipient
  blur: boolean
  votes: number
  author: string | null   // "Color Animal" — always sent, never scrambled
  is_own: boolean
  created_at: number
}

export interface ParticipantData {
  color: string
  animal: string
}

export interface TimerState {
  expires_at: number | null
  paused_at: number | null
  label: string | null
}

export type OutboundMessage =
  | { type: 'board_state'; blur_enabled: boolean; cards: CardData[]; participants: ParticipantData[]; timer: TimerState; is_admin: boolean; format: string; title: string; created_at: number; my_voted_card_ids: string[] }
  | { type: 'card_update'; card: CardData }
  | { type: 'card_deleted'; id: string }
  | { type: 'presence'; participants: ParticipantData[] }
  | { type: 'reveal'; sequence: string[] }
  | { type: 'blur_changed'; blur_enabled: boolean }
  | { type: 'timer:started';   expires_at: number; label: string }
  | { type: 'timer:paused';    paused_at: number;  remaining_seconds: number }
  | { type: 'timer:resumed';   expires_at: number }
  | { type: 'timer:cancelled' }
  | { type: 'timer:expired' }
  | { type: 'board_deleted' }
  | { type: 'error'; code: 'INVALID_MESSAGE' | 'RATE_LIMITED' | 'NOT_OWNER' | 'NOT_ADMIN' | 'BOARD_EXPIRED' | 'BOARD_NOT_FOUND' }
