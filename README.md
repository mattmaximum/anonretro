# AnonRetro

Anonymous retrospectives for teams. Participants join instantly and anonymously — no account required. Cards stay hidden until you reveal them — no anchoring, no groupthink.

Hiding is enforced server-side: non-owners receive `content: null` over WebSocket, so devtools and screen readers can't leak other people's cards. It's not CSS.

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
| `VITE_LS_CHECKOUT_ANNUAL` | Production | Lemon Squeezy annual checkout URL — baked into frontend bundle |
| `VITE_LS_CHECKOUT_LIFETIME` | Production | Lemon Squeezy lifetime checkout URL — baked into frontend bundle |
| `VITE_LS_CHECKOUT_UPGRADE` | Production | Lemon Squeezy annual→lifetime upgrade checkout URL — baked into frontend bundle |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Production | HMAC secret for verifying incoming LS webhook signatures |
| `LEMON_SQUEEZY_LIFETIME_VARIANT_ID` | Production | LS variant ID for the $29 lifetime product — used to branch refund logic |
| `LEMON_SQUEEZY_UPGRADE_VARIANT_ID` | Production | LS variant ID for the $11 upgrade product — used to branch refund logic |
| `RESEND_API_KEY` | Production | Resend API key for sending contact form emails (`re_...`) |
| `CONTACT_EMAIL` | Production | Destination address for contact form submissions (owner's email) |
| `CONTACT_FROM` | No | From address for contact form emails (default: `contact@anonretro.com`) |

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
- Freemium: free tier allows 1 active board; paid tier removes the limit
- Payments via [Lemon Squeezy](https://lemonsqueezy.com) (Merchant of Record — handles VAT/GST globally): Annual ($19/yr), Lifetime ($29 once), Annual→Lifetime upgrade ($11 once)
- Dashboard at `/dashboard`: view all boards, rename, delete, see expiration countdown

### Retention

- Boards hard-deleted after **30 days of inactivity**
- Expiration countdown shown in the board header (e.g. `Expires in 28d`, or `6d 14h` under 7 days)
- Purge job runs every 6 hours
- Eviction safety net: if board count exceeds 5,000, oldest inactive boards are deleted first

### Mobile

- Column tabs with unread badge counts
- Admin controls in a FAB (bottom-right) opening a bottom sheet

### Contact form

- `/contact` — name, email, category (Billing / Support / Feature Request / General), message
- Submissions sent via [Resend](https://resend.com) to the owner; `reply_to` set to sender so replies go directly back — owner email never exposed in the app
- Rate-limited to 5 req/10 min per IP

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
| Types | TypeScript throughout (shared client/server types) |
| Tests | Vitest (unit tests for eviction, blur, vote, timer, join logic) |
| Process manager | pm2 (fork mode — required for ESM + `import.meta.url`) |
| Reverse proxy | nginx (origin) + Cloudflare (TLS, DDoS, caching) |
| Hosting | Hetzner VPS (2 GB RAM, Ubuntu) |
| Auth | Clerk (JWT verification, email/password, webhooks) |
| Payments | Lemon Squeezy (Merchant of Record — handles VAT/GST globally) |
| Transactional email | Resend (contact form — sends from `contact@anonretro.com`) |

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

## Infrastructure & deployment

### Hosting

Runs on a single Hetzner VPS (2 GB RAM, Ubuntu). Cloudflare sits in front for
DDoS protection, TLS termination, and caching — the origin speaks plain HTTP to Cloudflare,
which handles HTTPS to the browser. nginx reverse-proxies to two Node.js processes: prod on
port 3000 (`anonretro.com`) and staging on port 3001 (`staging.anonretro.com`).

### Deployment pipeline

Capistrano-style release management, implemented as a single parameterized bash script:

1. `git pull` the target branch into a shared repo directory
2. `rsync` source into a new timestamped release directory (e.g. `releases/20260605_211125/`)
3. `npm ci` + build (TypeScript + Vite — `VITE_*` env vars baked into the JS bundle here)
4. Atomically switch the `current` symlink to the new release
5. `pm2 reload` for a graceful zero-downtime handoff
6. Smoke-test `GET /api/health` — auto-rolls back to the previous release on failure
7. Prune releases older than the 5 most recent

Rollback re-points the symlink and reloads pm2 — no rebuild, ~5 seconds.

### Two-environment setup

Both environments live on the same VPS and share the same deploy scripts. The branch
and port are the only differences between them:

| | Prod | Staging |
|---|---|---|
| Domain | `anonretro.com` | `staging.anonretro.com` |
| Branch | `main` | `staging` |
| Port | 3000 | 3001 |
| Clerk keys | `pk_live_` / `sk_live_` | `pk_test_` / `sk_test_` |
| Clerk proxy | Enabled (`VITE_CLERK_PROXY_URL=/clerk`) | Disabled |
| Auth gate | None | nginx basic auth |

Changes flow staging → prod: merge `staging` into `main`, push, deploy prod.

### Identity (Clerk)

Facilitator sign-up and sign-in use [Clerk](https://clerk.com). Clerk JWTs are verified
server-side on every authenticated request (`@clerk/backend`). Participants never need an
account — they get a random color+animal identity on join.

On production, Clerk traffic is routed through a first-party proxy at `/clerk/*` rather
than Clerk's own CDN subdomain. This keeps auth requests indistinguishable from first-party
traffic and avoids ad-blocker interference. The proxy is a custom Fastify route that uses
Node's `fetch` with redirect-following and rewrites `Set-Cookie` domain attributes so
session cookies scope correctly to `anonretro.com`.

### Databases

SQLite files live at fixed paths outside the release directories
(`/var/data/anonretro/anonretro.db` and `staging.db`) so they survive deploys and rollbacks.
WAL mode enables concurrent reads alongside the single writer.

### Payments

[Lemon Squeezy](https://lemonsqueezy.com) is the Merchant of Record — they handle VAT, GST,
and sales tax globally. Three products:

| Product | Price | Type |
|---|---|---|
| Annual | $19/yr | Subscription — access revoked on expiry, not on cancel |
| Lifetime | $29 | One-time — permanent access |
| Annual → Lifetime upgrade | $11 | One-time — converts annual to lifetime |

Webhooks hit `/api/webhooks/lemonsqueezy`. The server verifies the `X-Signature` header with
HMAC-SHA256 using `LEMON_SQUEEZY_WEBHOOK_SECRET`. Five event handlers:

- `order_created` — grants lifetime/upgrade access (skips subscription orders)
- `order_refunded` — revokes access immediately, branching on variant ID
- `subscription_created` — grants annual access
- `subscription_cancelled` — no-op (access continues until period end)
- `subscription_expired` — revokes annual access (guards `is_lifetime` so lifetime holders are unaffected)

Users have two DB columns: `is_pro` (unlimited boards) and `is_lifetime` (permanent, survives subscription expiry).

---

See [`deploy/README.md`](deploy/README.md) for the full ops runbook.

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
