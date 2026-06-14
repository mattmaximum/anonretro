# Staging Setup

One-time setup to bring `staging.anonretro.com` online. Run each phase in order.
Phases 0–1 run on your local machine; Phases 2–6 run on the server.

SSL is handled by Cloudflare — no certbot required.

---

## Phase 0 — Create the staging branch (local)

```bash
git checkout -b staging
git push origin staging
```

**Branching strategy:**

```
feat/xyz ──→ staging ──→ main
                ↓            ↓
     staging.anonretro   anonretro.com
```

- Feature branches are created from `main` and merged into `staging` for testing
- Once verified, `staging` is merged into `main` and deployed to prod
- After the merge, `staging` and `main` are identical — no drift
- Hotfixes committed directly to `main` must be synced back: `git push origin main:staging --force`

See `deploy/README.md` for the full workflow.

---

## Phase 1 — Point DNS at the server (local / Cloudflare)

In Cloudflare, add an A record for the `anonretro.com` zone:

```
Name: staging
Type: A
Value: <same IP as the anonretro.com A record>
TTL: Auto
Proxy: orange cloud (proxied) — same setting as prod
```

---

## Phase 2 — Create directories (server)

```bash
sudo mkdir -p /app/anonretro-staging/{repo,releases}
sudo chown -R $USER:$USER /app/anonretro-staging
sudo mkdir -p /var/data/anonretro
```

---

## Phase 3 — Clone the repo and check out staging (server)

```bash
git clone https://github.com/mattmaximum/anonretro.git /app/anonretro-staging/repo
git -C /app/anonretro-staging/repo checkout staging
```

---

## Phase 4 — Write the staging .env file (server)

Copy prod's `.env` as a starting point, then swap the Clerk keys:

```bash
cp /app/anonretro/.env /app/anonretro-staging/.env
chmod 600 /app/anonretro-staging/.env
nano /app/anonretro-staging/.env
```

In nano, make these changes:
- Set `VITE_CLERK_PUBLISHABLE_KEY` to your Clerk **dev instance** `pk_test_...` key
- Set `CLERK_PUBLISHABLE_KEY` to the same `pk_test_...` value
- Set `CLERK_SECRET_KEY` to your Clerk **dev instance** `sk_test_...` key
- **Remove** the `VITE_CLERK_PROXY_URL` line entirely (staging connects to Clerk FAPI directly)
- Leave `METRICS_USER` and `METRICS_PASSWORD` unchanged
- Set `VITE_LS_CHECKOUT_ANNUAL`, `VITE_LS_CHECKOUT_LIFETIME`, `VITE_LS_CHECKOUT_UPGRADE` to the **test mode** Lemon Squeezy checkout URLs
- Set `LEMON_SQUEEZY_WEBHOOK_SECRET` to the test mode signing secret (generate with `openssl rand -hex 20`)
- Set `LEMON_SQUEEZY_LIFETIME_VARIANT_ID` and `LEMON_SQUEEZY_UPGRADE_VARIANT_ID` to the test mode variant IDs

Clerk dev instance keys come from [dashboard.clerk.com](https://dashboard.clerk.com) — switch
to the Development instance to find them.

**Note:** Do NOT set `VITE_CLERK_PROXY_URL` in the staging `.env`. The Clerk proxy is for
prod only — dev instances don't support proxy URL configuration in the Clerk dashboard.

**Note:** `VITE_LS_*` vars are baked into the frontend bundle at build time. Test mode and
live mode have separate products with separate checkout URLs and variant IDs — staging uses
test mode, prod uses live mode. Set up a separate webhook in LS test mode pointing to
`https://staging.anonretro.com/api/webhooks/lemonsqueezy`.

---

## Phase 5 — Install the nginx vhost (server)

```bash
sudo cp /app/anonretro-staging/repo/deploy/nginx.staging.conf /etc/nginx/sites-available/anonretro-staging
sudo ln -s /etc/nginx/sites-available/anonretro-staging /etc/nginx/sites-enabled/anonretro-staging
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-staging staging
sudo nginx -t && sudo nginx -s reload
```

The `htpasswd` command sets the password for the `staging` user. This is the basic auth
gate shown once when first visiting `staging.anonretro.com`. The browser caches it for
the session — it won't prompt again during active testing.

---

## Phase 6 — First deploy (server)

```bash
bash /app/anonretro-staging/repo/deploy/deploy.sh staging
```

This will:
1. Pull the `staging` branch
2. Source `.env` and build with your Clerk dev keys baked in
3. Start the `anonretro-staging` PM2 process on port 3001
4. Run the health check against port 3001
5. Call `pm2 save` so staging survives a server reboot

Verify it's up:
```bash
curl -sf http://localhost:3001/api/health && echo "staging ok"
```

---

## Ongoing usage

Deploy staging:
```bash
bash /app/anonretro-staging/repo/deploy/deploy.sh staging
```

Rollback staging:
```bash
bash /app/anonretro-staging/repo/deploy/rollback.sh staging
bash /app/anonretro-staging/repo/deploy/rollback.sh staging 2   # specific release
```

Deploy prod:
```bash
bash /app/anonretro/repo/deploy/deploy.sh prod
```

---

## Standard feature workflow

```bash
# 1. Create feature branch from main
git checkout main && git pull
git checkout -b feat/my-feature

# 2. Do the work and commit

# 3. Merge into staging and deploy for testing
git checkout staging && git merge feat/my-feature
git push origin staging
bash /app/anonretro-staging/repo/deploy/deploy.sh staging

# 4. Verify on staging.anonretro.com

# 5. Promote to prod
git checkout main && git merge staging
git push origin main
bash /app/anonretro/repo/deploy/deploy.sh prod

# 6. Clean up feature branch
git branch -d feat/my-feature
git push origin --delete feat/my-feature
```

After step 5, `staging` and `main` are identical — no drift.

**Hotfix direct to main** (emergency only):
```bash
# after committing fix to main and pushing
git push origin main:staging --force   # keep staging in sync
```
