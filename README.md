# AnonRetro

You create an account, share a link, and your team joins instantly — no sign-up and everyone's anonymous.

Cards stay hidden until the facilitator reveals them, so the first voice doesn't set the agenda. Hiding is enforced server-side: non-owners receive `content: null` over WebSocket, so devtools and screen readers can't leak other people's cards. It's not CSS.

Live at **[anonretro.com](https://anonretro.com)**

---

## What it is

When people can see each other's cards as they're written, they anchor on the first thing posted. The loudest voice sets the tone before the conversation starts. AnonRetro eliminates that: everyone writes independently, cards are hidden until reveal, and everything surfaces at once.

Participants join via a shared link with no account required. The facilitator (board creator) needs an account. Boards hard-delete after 30 days of inactivity.

---

## Quick start

**Requirements:** Node 22+, npm

```bash
git clone https://github.com/mattmaximum/anonretro
cd anonretro
cp .env.example .env   # see env vars section below
npm install
npm run dev
```

Open **http://localhost:5173**

The dev server runs two processes:
- `tsx watch` — Fastify API + WebSocket on `:3000`
- `vite` — React frontend on `:5173` (proxies `/api` and `/ws` to `:3000`)

```bash
npm test          # vitest unit tests
npm run build     # tsc + vite bundle
npm start         # serve production build on :3000
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `DATABASE_PATH` | No | SQLite file path (default: `./data/anonretro.db`) |
| `ALLOWED_ORIGINS` | Production | Comma-separated allowed CORS/WS origins |
| `CLERK_SECRET_KEY` | Production | Clerk backend key — auth is skipped if unset (dev mode) |
| `CLERK_PUBLISHABLE_KEY` | Production | Clerk publishable key — used server-side to derive the FAPI URL for the proxy |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production | Same key — baked into the frontend bundle at build time by Vite |
| `VITE_CLERK_PROXY_URL` | Prod only | Set to `/clerk` on prod; omit on staging. Enables the Clerk anti-adblock proxy. |
| `METRICS_USER` / `METRICS_PASSWORD` | No | Basic auth for `/api/metrics` |

Auth is intentionally a no-op in development when `CLERK_SECRET_KEY` is not set — you can create boards freely without signing in.

---

## Features

### Board

- Four retro formats: **Mad / Sad / Glad** · **4Ls** (Liked, Learned, Lacked, Longed For) · **Start / Stop / Continue** · **Well / Unwell / Actions**
- Cards blurred for all participants during the writing phase — you can only see your own
- Blur enforced at the data layer (server sends `content: null`), not CSS — devtools can't leak cards
- Cards persist across refreshes via localStorage token + server re-join

### Real-time

- WebSocket sync across all connected participants
- Reconnects with exponential backoff (1s → 2s → 4s → max 30s)
- Connection status banner (reconnecting / dead)
- Live presence bar — connected participants shown as colored avatar circles

### Identity

- Participants get a random color + animal identity (e.g. "Violet Stork") on join — no account required
- Up to 100 participants per board (580-combination pool: 10 colors × 58 animals)
- Even color distribution — all colors cycle before any repeats
- Identity stored in localStorage and re-used on reconnect

### Facilitator controls

- Reveal all cards at once with staggered fade-in animation + chime
- Re-hide cards after reveal
- Lock board (prevents new cards and edits)
- Timer: set duration (1–60 min) with optional label, pause, resume, cancel
- Timer is server-led — clients count down from `expires_at`, no server ticks broadcast
- Timer survives server restarts (`restoreTimers()` re-arms from SQLite on startup)
- Export all cards to **CSV**, **JSON**, or **Markdown** — cards sorted by votes within each column, board name and format included in every export
- Rename board in real time — title change broadcasts to all participants instantly
- Delete board (hard delete, immediate)

### Voting

- Upvote any revealed card
- Vote counts computed server-side in a transaction — never incremented in application code
- Optimistic UI update on click, confirmed by server broadcast

### Accounts (facilitators only)

- Board creators sign in via [Clerk](https://clerk.com) (email/password)
- Participants never need an account
- Freemium: free tier allows up to 3 active boards; paid tier removes the limit
- Payments via [Lemon Squeezy](https://lemonsqueezy.com) (Merchant of Record — handles VAT/GST globally)
- Dashboard at `/dashboard`: view all boards, rename, delete, see expiration countdown

### Retention

- Boards hard-deleted after **30 days of inactivity**
- Expiration countdown shown in the board header (e.g. `Expires in 28d`, or `6d 14h` under 7 days)
- Purge job runs every 6 hours
- Eviction safety net: if board count exceeds 5,000, oldest inactive boards are deleted first

### Mobile

- Column tabs with unread badge counts
- Admin controls in a FAB (bottom-right) opening a bottom sheet

### Other

- Light / dark mode toggle (respects OS preference on first visit)
- Rate limiting: 60 req/min per IP, Cloudflare-aware (`cf-connecting-ip` header)
- Share modal with copy link and QR code (QR hidden on mobile)

---

## Architecture

```
src/
  client/       React 18 + Vite frontend
  server/       Fastify API + WebSocket server
    routes/     REST endpoints (boards, export, metrics, me)
    lib/        Auth helper (Clerk JWT verification)
    ws.ts       WebSocket connection handler + broadcaster
    db.ts       SQLite schema, migrations, prepared statements
  shared/       Types shared between client and server (messages, formats)
```

### Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22+ |
| API server | Fastify 5 + @fastify/websocket |
| Database | SQLite (better-sqlite3, WAL mode) |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3, Inter font |
| Auth | Clerk (@clerk/backend, @clerk/react) |
| Payments | Lemon Squeezy |
| Types | TypeScript throughout (shared client/server types) |
| Tests | Vitest (unit tests for eviction, blur, vote, timer, join logic) |
| Process manager | pm2 (fork mode — required for ESM + `import.meta.url`) |
| Reverse proxy | nginx + Let's Encrypt |

### Key design decisions

**SQLite over Postgres** — single server, single writer, zero ops overhead. WAL mode enables concurrent reads. Horizontal scaling would require Postgres + Redis pub/sub for the WebSocket registry.

**Server-enforced blur** — hiding cards in CSS is trivially bypassable. The server sends `content: null` for cards the requesting participant doesn't own. The frontend has nothing to hide.

**Admin token in localStorage** — no session management. The facilitator's admin token is a random 32-byte hex string stored locally. Simple and stateless; the tradeoff is that clearing localStorage or switching browsers loses admin access.

**pm2 fork mode** — ESM modules with `import.meta.url` break in pm2 cluster mode (static file paths resolve incorrectly). Single instance is appropriate anyway given SQLite's single-writer constraint.

**Release-based deployment** — each deploy creates a timestamped release directory. A symlink (`current →`) is atomically switched after a successful build and smoke test. Rollback re-points the symlink to the previous release and reloads pm2 — no rebuild needed, ~5 seconds.

---

## Limitations

- **Single-writer SQLite** — one server instance only
- **No message history on reconnect** — rejoining gets current board state but misses reveal animations that fired while offline
- **Identity is browser-local** — clearing localStorage orphans your cards (still visible, no longer editable)
- **Admin token is browser-local** — losing localStorage = losing admin access (recoverable from Share modal before closing)
- **No end-to-end encryption** — cards stored in plaintext SQLite, transmitted over TLS
- **WebSocket only** — no HTTP long-poll fallback; some corporate proxies block WebSocket

---

## Deploy

See [`deploy/README.md`](deploy/README.md) for the full deployment guide.

Two environments on the same VPS — prod (`anonretro.com`) and staging (`staging.anonretro.com`).
SSL is handled by Cloudflare. Both use the same parameterized scripts.

**Deploy staging:**
```bash
bash /app/anonretro-staging/repo/deploy/deploy.sh staging
```

**Promote staging → prod:**
```bash
# local
git checkout main && git merge staging && git push origin main
# server
bash /app/anonretro/repo/deploy/deploy.sh prod
```

**Rollback:**
```bash
bash /app/anonretro/repo/deploy/rollback.sh prod        # prod, previous release
bash /app/anonretro-staging/repo/deploy/rollback.sh staging   # staging, previous release
bash /app/anonretro/repo/deploy/rollback.sh prod 2      # prod, specific release by index
```

For first-time staging setup see [`deploy/STAGING-SETUP.md`](deploy/STAGING-SETUP.md).

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

---

## License

[MIT + Commons Clause](LICENSE) — free to read, fork, and self-host for personal or internal non-commercial use. Commercial use (running it as a paid service, selling access, etc.) requires written permission.
