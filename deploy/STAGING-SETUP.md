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

All feature branches merge here first for live testing, then get promoted to `main` for prod.

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

Clerk dev instance keys come from [dashboard.clerk.com](https://dashboard.clerk.com) — switch
to the Development instance to find them.

**Note:** Do NOT set `VITE_CLERK_PROXY_URL` in the staging `.env`. The Clerk proxy is for
prod only — dev instances don't support proxy URL configuration in the Clerk dashboard.

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

## Promoting staging to prod

Once changes are tested on staging, merge to main and deploy prod:

```bash
# local
git checkout main
git merge staging
git push origin main

# server
bash /app/anonretro/repo/deploy/deploy.sh prod
```
