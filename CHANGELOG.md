# Changelog

All notable changes to AnonRetro are documented here.

Versions follow [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
- **PATCH** — bug fixes and small improvements
- **MINOR** — new features, backward compatible
- **MAJOR** — breaking changes or significant milestones (1.0 = first paying customer, paid flow complete)

---

## [0.3.0] — 2026-06-14

### Added

- **Annual subscription ($19/yr)** — new pricing option alongside lifetime. Subscribers get unlimited boards; access is revoked when the subscription expires (not when cancelled, so the billing period is honoured).
- **Lifetime license ($29 one-time)** — replaces the previous single-product setup with a proper two-option checkout showing annual on the left and lifetime (with "Best value" badge) on the right.
- **Annual → lifetime upgrade ($11)** — annual subscribers see a dismissable dashboard banner offering a one-time $11 upgrade to lifetime. Lifetime holders never see annual renewal prompts again.
- **Five webhook handlers** — `order_created`, `order_refunded`, `subscription_created`, `subscription_cancelled` (no-op, access continues until period end), and `subscription_expired` now each have a named handler. Refund logic branches on variant ID: $29 refund revokes all access; $11 refund removes lifetime status but preserves annual access.
- **Webhook test suite** — 12 new tests in `test/server/webhook.test.ts` covering all handlers and the critical invariant: lifetime holders keep access even when a subscription_expired event fires.

### Changed

- **Free tier reduced to 1 active board** (was 3). The free use case is running a single retro and moving on; the upgrade prompt appears at the board-creation wall rather than as a standing dashboard banner.
- **Upgrade modal redesigned** — two-column layout showing annual and lifetime side by side, driven by `VITE_LS_CHECKOUT_ANNUAL` and `VITE_LS_CHECKOUT_LIFETIME` env vars (replaces single `VITE_LEMON_SQUEEZY_CHECKOUT_URL`).
- **PM2 config** — `ecosystem.config.cjs` now passes `LEMON_SQUEEZY_WEBHOOK_SECRET`, `LEMON_SQUEEZY_LIFETIME_VARIANT_ID`, and `LEMON_SQUEEZY_UPGRADE_VARIANT_ID` to the server process so webhooks work after deploy.
- **About page** copy updated to reflect 1-board free tier and both pricing options.

---

## [0.2.0] — 2026-06-03

### Added

- **Multi-format export** — facilitators can now export a board as CSV, JSON, or Markdown from the admin panel. All three formats include board title, format name, and export date. Cards are sorted by vote count (highest first) within each column.
  - **CSV** — compatible with Excel/Sheets; includes BOM for correct UTF-8 rendering
  - **JSON** — structured `{ board, columns[] }` payload; useful for piping into Notion, Linear, Jira, or internal tooling
  - **Markdown** — `## Column` / `- card (N votes) — author` structure; paste directly into Confluence, GitHub Discussions, or a team Slack
- **Vote sorting in exports** — highest-voted cards appear first within each column across all export formats
- **Board metadata in exports** — board name, format, and export date included in all formats so exported files are self-contained

### Changed

- Export section in the admin panel replaced with a `CSV / JSON / MD` button row
- `/api/health` exempt from rate limiting so uptime monitoring IPs cannot accidentally trip it
- `/api/health` returns `503` with `{ status: "error", reason: "..." }` on DB failure (was an unhandled 500); UptimeRobot keyword checks now fail correctly on DB outage

---

## [0.1.0] — 2026-06-03

### What this is

AnonRetro is a real-time retrospective tool built to eliminate anchoring bias. Cards stay hidden until the facilitator reveals them — so the first voice doesn't set the agenda. Everyone writes independently, everything surfaces at once.

Hiding is enforced at the data layer: the server sends `content: null` to non-owners over WebSocket. It's not CSS. Participants join via a shared link with no account required; only the facilitator needs one.

Built as a side project to solve a real pain point, and designed to cover its own hosting costs via a freemium model ($29 lifetime license).

### Features at launch

**Board**
- Four retro formats: Mad / Sad / Glad · 4Ls · Start / Stop / Continue · Well / Unwell / Actions
- Server-enforced card blur — `content: null` sent to non-owners, not just CSS hiding
- Cards persist across page refreshes via localStorage token + server re-join

**Real-time**
- WebSocket sync for all connected participants
- Automatic reconnection with exponential backoff
- Live presence bar showing connected participants as colored avatar circles
- Connection status banner

**Identity**
- No account required for participants — random color + animal assigned on join (e.g. "Violet Stork")
- Up to 100 participants per board (580-combination pool)
- Even color distribution across participants

**Facilitator controls**
- Reveal all cards with staggered animation and chime
- Re-hide cards after reveal
- Lock board (prevent new cards and edits)
- Timer (1–60 min) with pause, resume, cancel — server-led, survives restarts
- Export all cards to CSV
- Rename board inline — syncs to all participants via WebSocket in real time
- Delete board (hard delete)

**Voting**
- Upvote any revealed card
- Server-authoritative vote counts (SELECT COUNT inside toggle transaction)

**Accounts and access control**
- Facilitators sign in via Clerk (email/password)
- Free tier: up to 3 active boards
- Paid tier: unlimited boards (Lemon Squeezy, lifetime license)
- Dashboard at `/dashboard`: manage boards, rename, delete, view expiration

**Retention**
- Boards hard-deleted after 30 days of inactivity
- Expiration countdown in board header (`28d`, or `6d 14h` under 7 days)
- Purge job runs every 6 hours
- Safety net eviction at 5,000 boards

**Infrastructure**
- Fastify 5 + SQLite (WAL mode)
- Release-based zero-downtime deployment (Capistrano-style symlink swap)
- Instant rollback to any of the last 5 releases (~5 seconds, no rebuild)
- Automatic smoke test on deploy — rolls back if `/api/health` fails
- Rate limiting: 60 req/min per IP, Cloudflare-aware
- Light / dark mode (respects OS preference)

---

<!-- Add new versions above this line, newest first -->
