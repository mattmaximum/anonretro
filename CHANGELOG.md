# Changelog

All notable changes to AnonRetro are documented here.

Versions follow [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
- **PATCH** — bug fixes and small improvements
- **MINOR** — new features, backward compatible
- **MAJOR** — breaking changes or significant milestones (1.0 = first paying customer, paid flow complete)

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
