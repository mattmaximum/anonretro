# anonretro Deployment

Release-based deployment (Capistrano-style). Achieves zero-downtime deploys and instant
rollback without true blue/green — which isn't viable here because SQLite is single-writer.

Two environments on the same VPS: **prod** (`anonretro.com`, port 3000) and **staging**
(`staging.anonretro.com`, port 3001). Both use the same parameterized scripts.

---

## Branching strategy

```
feat/xyz ──→ staging ──→ main
                ↓            ↓
     staging.anonretro   anonretro.com
```

**Three branches, two rules:**

| Branch | Purpose | Who deploys it |
|---|---|---|
| `feat/xyz` | Isolated feature work — branched from `main` | Nobody (local only) |
| `staging` | What the staging server runs — test before promoting | `deploy.sh staging` |
| `main` | Production — only receives merges from `staging` | `deploy.sh prod` |

**Rule 1 — All code flows through staging before main.**
Never merge a feature branch directly into `main`. Always merge into `staging` first, deploy, verify, then merge `staging` → `main`.

**Rule 2 — Hotfixes go to both.**
If a fix must go straight to `main` (emergency), immediately sync staging afterward:
```bash
git push origin main:staging --force
```

**Standard workflow for a new feature:**

```bash
# 1. Branch from main
git checkout main && git pull
git checkout -b feat/my-feature

# 2. Do the work, commit locally

# 3. Merge into staging and test
git checkout staging && git merge feat/my-feature
git push origin staging
# → deploy staging server and verify

# 4. Promote to prod
git checkout main && git merge staging
git push origin main
# → deploy prod server

# 5. Clean up
git branch -d feat/my-feature
git push origin --delete feat/my-feature
```

After step 4, `staging` and `main` are identical — no drift.

---

## Directory structure on the VPS

```
/app/anonretro/                              ← prod
  repo/                                      ← git working directory (main branch)
  releases/
    20260603_194102/                         ← each deploy gets a timestamped directory
    20260603_210000/                         ← full build + node_modules inside
  current -> releases/20260603_210000        ← symlink, points to active release
  .env                                       ← prod secrets (Clerk live keys, metrics creds)

/app/anonretro-staging/                      ← staging
  repo/                                      ← git working directory (staging branch)
  releases/
  current -> releases/...
  .env                                       ← staging secrets (Clerk dev keys, same metrics creds)

/var/data/anonretro/
  anonretro.db                               ← prod SQLite DB
  staging.db                                 ← staging SQLite DB
```

The databases live at fixed paths outside all releases. They survive deploys and rollbacks.

---

## Environment files

Each environment has a `.env` file that is sourced by the deploy script before `npm run build`.
This is how `VITE_CLERK_PUBLISHABLE_KEY` gets baked into the frontend bundle.

| Variable | Prod | Staging |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | `pk_test_...` |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_...` | `pk_test_...` |
| `CLERK_SECRET_KEY` | `sk_live_...` | `sk_test_...` |
| `VITE_CLERK_PROXY_URL` | `/clerk` | _(not set — uses Clerk FAPI directly)_ |
| `METRICS_USER` / `METRICS_PASSWORD` | set | same values as prod |
| `VITE_LS_CHECKOUT_ANNUAL` | live checkout URL | test checkout URL |
| `VITE_LS_CHECKOUT_LIFETIME` | live checkout URL | test checkout URL |
| `VITE_LS_CHECKOUT_UPGRADE` | live checkout URL | test checkout URL |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | live signing secret | test signing secret |
| `LEMON_SQUEEZY_LIFETIME_VARIANT_ID` | live variant ID | test variant ID |
| `LEMON_SQUEEZY_UPGRADE_VARIANT_ID` | live variant ID | test variant ID |

Prod keys come from the Clerk **production** instance. Staging keys come from the Clerk
**development** instance (`pk_test_` / `sk_test_`).

`VITE_CLERK_PROXY_URL` must be set for prod so the Clerk anti-adblock proxy stays active.
Staging omits it because Clerk dev instances don't support proxy URL configuration.

`VITE_LS_*` vars are baked into the frontend bundle at build time. Changing them requires
a full redeploy — `pm2 reload` alone is not sufficient.

### Lemon Squeezy webhook setup

Create a webhook in the LS dashboard (separate webhooks for live and test mode):

- **URL:** `https://anonretro.com/api/webhooks/lemonsqueezy` (prod) or `https://staging.anonretro.com/api/webhooks/lemonsqueezy` (staging)
- **Signing secret:** generate with `openssl rand -hex 20` (max 40 chars) — set as `LEMON_SQUEEZY_WEBHOOK_SECRET`
- **Events:** `order_created`, `order_refunded`, `subscription_created`, `subscription_cancelled`, `subscription_expired`

Test mode and live mode webhooks are separate — staging uses test mode, prod uses live mode.

---

## How a deploy works (`deploy/deploy.sh [prod|staging]`)

1. `git fetch origin && git checkout $BRANCH && git pull origin $BRANCH` — branch-locked pull
2. `rsync` source into a new timestamped release dir (excludes `node_modules`, `dist`, `data`, `.git`)
3. `npm ci`
4. Source `.env` so `VITE_*` vars are available to Vite at build time
5. `npm run build && npm prune --omit=dev`
6. Record current symlink target (for auto-rollback)
7. Atomically switch `current` symlink to the new release
8. `pm2 reload ecosystem.config.cjs --update-env` (or `pm2 start` on first deploy)
9. Smoke test `GET /api/health` on the correct port after 4s — auto-rolls back if it fails
10. `pm2 save` — persists process list for server reboots
11. Prune releases older than the 5 most recent

---

## How rollback works (`deploy/rollback.sh [prod|staging] [index]`)

Re-points the symlink to a previous release + `pm2 reload`. No rebuild required. Takes ~5 seconds.

The script lists all releases with the active one marked before switching.

---

## Common operations

```bash
# Merge feature into staging and deploy
git checkout staging && git merge feat/my-feature && git push origin staging
bash /app/anonretro-staging/repo/deploy/deploy.sh staging

# Promote staging → prod (local then server)
git checkout main && git merge staging && git push origin main
bash /app/anonretro/repo/deploy/deploy.sh prod

# Sync staging to main after a hotfix (prevents drift)
git push origin main:staging --force

# Rollback staging (previous release)
bash /app/anonretro-staging/repo/deploy/rollback.sh staging

# Rollback prod (previous release)
bash /app/anonretro/repo/deploy/rollback.sh prod

# Rollback to a specific release (pass the index shown by the script)
bash /app/anonretro/repo/deploy/rollback.sh prod 2
bash /app/anonretro-staging/repo/deploy/rollback.sh staging 2

# Check status
pm2 list
curl -sf http://localhost:3000/api/health && echo "prod ok"
curl -sf http://localhost:3001/api/health && echo "staging ok"

# Tail logs
pm2 logs anonretro --lines 100
pm2 logs anonretro-staging --lines 100

# List releases
ls -lt /app/anonretro/releases/
ls -lt /app/anonretro-staging/releases/
```

---

## Server reboots

PM2 startup must be configured once so both processes survive reboots:

```bash
pm2 startup    # prints a command — run that command
pm2 save       # persists current process list
```

After any reboot, verify:
```bash
pm2 list
curl -sf http://localhost:3000/api/health && echo "prod ok"
curl -sf http://localhost:3001/api/health && echo "staging ok"
```

---

## Clerk production setup

Production auth runs through a custom first-party proxy (`src/server/routes/clerk-proxy.ts`)
that forwards `/clerk/*` requests to Clerk's Frontend API. This keeps Clerk traffic
indistinguishable from first-party requests and bypasses ad blockers.

### DNS records (Cloudflare, DNS-only mode — no orange cloud)

| Type | Name | Value |
|---|---|---|
| CNAME | `clerk` | `frontend-api.clerk.services` |
| CNAME | `accounts` | `accounts.clerk.services` |
| CNAME | `clkmail` | `mail.p8j7hj7bn9j0.clerk.services` |
| CNAME | `clk._domainkey` | `dkim1.p8j7hj7bn9j0.clerk.services` |
| CNAME | `clk2._domainkey` | `dkim2.p8j7hj7bn9j0.clerk.services` |

All records must be **DNS-only** (grey cloud), not proxied. Clerk's verification checker
queries authoritative nameservers directly; Cloudflare proxying breaks it.

### Clerk dashboard (Configure → Domains)

- `anonretro.com` — primary domain, Verified
- `clerk.anonretro.com` — Frontend API CNAME, Optional (proxy takes precedence when set)
- Proxy configuration — **leave deleted**. When the Clerk dashboard proxy is set, Clerk's
  Cloudflare worker redirects all `clerk.anonretro.com` requests to the proxy URL. This
  causes a 301 self-redirect loop in the server-side proxy. Without it, `clerk.anonretro.com`
  serves content normally (307 version-resolution redirect, CORS open).
- `accounts.anonretro.com` — account portal CNAME, Unverified (cosmetic — doesn't affect auth)

### How the proxy works

`clerk-proxy.ts` decodes the publishable key to get the FAPI host (`clerk.anonretro.com`),
then uses Node's built-in `fetch` with `redirect: 'follow'` to proxy all `/clerk/*` requests:

1. Browser → `anonretro.com/clerk/...` (same-origin, no CORS)
2. Server fetch → `clerk.anonretro.com/...` (follows 307 version-resolution redirect server-side)
3. Response returned to browser with `Domain=` stripped from `Set-Cookie` headers

Stripping `Domain=clerk.anonretro.com` from cookies is critical — without it the browser
scopes session cookies to the wrong host and treats every subsequent request as signed out.

A root-level Fastify `addContentTypeParser('*', ...)` in `index.ts` is required so Clerk's
`application/x-www-form-urlencoded` POST requests (session token refresh, sign-up) reach
the proxy handler instead of returning 415.

### Staging vs prod

Staging uses Clerk dev keys (`pk_test_` / `sk_test_`) and **does not** set
`VITE_CLERK_PROXY_URL`. Clerk dev instances don't support proxy URL configuration,
so staging connects to the Clerk dev FAPI directly without going through the proxy.

---

## Key implementation decisions

| Decision | Why |
|---|---|
| `exec_mode: 'fork'` in PM2 | ESM modules break `import.meta.url` in PM2 cluster mode, causing static files to 404 |
| `cwd` hardcoded in ecosystem config | PM2 resolves the script path through the symlink; must point to the correct env's `current` dir |
| SQLite DBs outside releases | `/var/data/anonretro/*.db` never move — survive deploys and rollbacks |
| `pm2 reload` not `pm2 restart` | Reload does a graceful handoff; restart kills first |
| `instances: 1` in PM2 | SQLite is single-writer; multiple instances would corrupt the DB |
| Source `.env` before build | `VITE_*` vars are baked into the JS bundle by Vite — not available at runtime, only at build time |
| Smoke test before pruning | If the new release is broken, auto-rollback fires before old releases are deleted |
| No Clerk proxy on staging | Clerk dev instances don't support proxy URL config in the dashboard — frontend connects to FAPI directly |

---

## Files

| File | Purpose |
|---|---|
| `deploy/deploy.sh` | Parameterized deploy script — accepts `prod` or `staging` |
| `deploy/rollback.sh` | Parameterized rollback script — accepts `prod` or `staging` |
| `deploy/setup.sh` | First-time VPS provisioning |
| `deploy/nginx.conf` | nginx vhost for prod (Cloudflare → port 3000) |
| `deploy/nginx.staging.conf` | nginx vhost for staging (basic auth gate → port 3001) |
| `deploy/STAGING-SETUP.md` | One-time staging environment setup checklist |
| `ecosystem.config.cjs` | PM2 config for prod |
| `ecosystem.staging.config.cjs` | PM2 config for staging |
