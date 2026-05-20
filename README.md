# AnonRetro

Anonymous retrospectives with no accounts, no anchoring bias.

Cards are hidden from everyone (including the facilitator) until the reveal moment. Hiding is enforced server-side — non-owners receive `content: null` over WebSocket, so screen readers and devtools inspection can't leak other people's cards.

---

## Quick Start

**Requirements:** Node 22+ (or 26), npm

```bash
git clone https://github.com/mattmaximum/anonretro
cd anonretro
npm install
npm run dev
```

Open **http://localhost:5173** — create a board, share the link with your team, and run your retro.

The dev server runs two processes concurrently:
- `tsx watch` — Fastify API + WebSocket on `:3000`
- `vite` — React frontend on `:5173` (proxies `/api` and `/ws` to `:3000`)

**Other commands:**

```bash
npm test          # 26 unit tests (vitest)
npm run build     # compile server (tsc) + bundle client (vite)
npm start         # serve production build on :3000
```

---

## Features

**Board**
- Four retro formats: Mad / Sad / Glad · 4Ls (Liked / Learned / Lacked / Longed For) · Start / Stop / Continue · Well / Unwell / Actions
- Cards are blurred for all participants during the writing phase — you can only see your own cards
- Blur is enforced at the data layer (server sends `content: null`), not just CSS — screen readers and browser devtools can't see other people's cards
- Cards persist across page refreshes via localStorage token + server re-join

**Real-time**
- WebSocket sync across all connected participants
- Reconnects automatically with exponential backoff (1s → 2s → 4s → max 30s)
- Connection status banner (reconnecting / dead)
- Live presence bar showing all connected participants as colored avatar circles

**Identity**
- No accounts. Each participant gets a random color + animal identity (e.g. "Violet Stork") assigned on join
- Up to 100 participants per board (580-combination identity pool: 10 colors × 58 animals)
- Identity is stored in localStorage and re-used on reconnect

**Voting**
- Upvote any revealed card (including your own)
- Vote counts are authoritative — computed from a `SELECT COUNT(*)` inside the toggle transaction, never incremented in application code
- Optimistic UI update on click, confirmed by server broadcast

**Facilitator (admin) controls**
- Reveal all cards at once with a staggered fade-in animation + chime
- Hide cards again after reveal
- Timer: set duration (1–60 min) with optional label, pause, resume, cancel
- Timer is server-led — clients count down from `expires_at`, no server ticks broadcast
- Timer survives server restarts (`restoreTimers()` re-arms from SQLite on startup)
- Export all cards to CSV (includes column, content, vote count, author)

**Mobile**
- Column tabs with unread badge counts
- Admin controls in a FAB (bottom-right gear icon) that opens a bottom sheet

**Share**
- Copy-link as the primary action
- QR code displayed on desktop (hidden on mobile — facilitator can't scan their own screen)
- Admin token shown for recovery (tied to the creating browser's localStorage)

**Retention**
- Boards expire after 24 hours
- Expiry countdown shown in the header
- Eviction runs when the board count exceeds 5,000 — oldest boards deleted first, skipping any board with an active running timer

**Design**
- Twilight dark theme: warm purple-gray base, soft violet accent (`#8B83F4`)
- WCAG-compliant avatar contrast (luminance-computed text color per background)
- Tailwind CSS, Inter font

---

## Limitations

- **Single-writer SQLite** — one server instance only. Horizontal scaling requires replacing SQLite with Postgres and the WebSocket registry with Redis pub/sub.
- **No persistence after expiry** — boards are hard-deleted at 24h. There is no archive or export reminder.
- **No message history on reconnect** — a participant who disconnects and reconnects gets the current board state but misses any reveal animation that fired while they were offline.
- **Identity is browser-local** — clearing localStorage loses your token. You rejoin as a new participant with a new identity, and your old cards become orphaned (still visible, but no longer editable by you).
- **Admin token is browser-local** — if the facilitator clears localStorage or switches browsers, they lose admin access. The token can be recovered by copying it from the Share modal before closing it.
- **No moderation** — any participant can edit or delete their own cards; only the admin can delete others' cards (via the server — there is no admin UI for deleting others' cards in the current build).
- **Rate limit is per-token, in-memory** — 10 card additions per minute per participant. Resets on server restart. Not shared across future horizontal instances.
- **WebSocket only** — no HTTP long-poll fallback. Environments that block WebSocket (some corporate proxies) won't work.
- **No end-to-end encryption** — cards are stored in plaintext in SQLite and transmitted over TLS. The server operator can read all card content.

---

## Deploy

See [`deploy/`](deploy/) for nginx config, pm2 ecosystem file, and setup/deploy shell scripts.

The short version for a fresh Ubuntu 22.04 VPS:

```bash
sudo bash deploy/setup.sh          # install Node, nginx, pm2, certbot
# clone repo, edit ecosystem.config.cjs (set ALLOWED_ORIGINS to your domain)
bash deploy/deploy.sh              # build + start with pm2
sudo cp deploy/nginx.conf /etc/nginx/sites-available/anonretro
# edit nginx.conf to replace yourdomain.com
sudo ln -s /etc/nginx/sites-available/anonretro /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js |
| API server | Fastify + @fastify/websocket |
| Database | SQLite (better-sqlite3, WAL mode) |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Types | TypeScript throughout (shared types between server and client) |
| Tests | Vitest (unit tests for eviction, blur, vote, timer, join logic) |
| Process manager | pm2 |
| Reverse proxy | nginx + Let's Encrypt |
