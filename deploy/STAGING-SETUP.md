# Staging Setup

One-time setup to bring `staging.anonretro.com` online. Run each phase in order.
Phases 0–1 run on your local machine; Phases 2–7 run on the server.

---

## Phase 0 — Create the staging branch (local)

```bash
git checkout -b staging
git push origin staging
```

All feature branches merge here first for live testing, then get promoted to `main` for prod.

---

## Phase 1 — Point DNS at the server (local / DNS provider)

In your DNS provider, add an A record:

```
staging.anonretro.com  →  <your server IP>  TTL 300
```

Do this first — certbot needs DNS to propagate before it can issue a cert.
Check propagation with: `dig staging.anonretro.com +short`

---

## Phase 2 — Create directories (server)

SSH into the server, then:

```bash
# App directories (same pattern as /app/anonretro)
sudo mkdir -p /app/anonretro-staging/{repo,releases}
sudo chown -R $USER:$USER /app/anonretro-staging

# Data directory — may already exist from prod; -p makes this safe to rerun
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

Get your **Clerk dev-instance** keys from https://dashboard.clerk.com (the development instance, not production).

```bash
cat > /app/anonretro-staging/.env << 'EOF'
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
CLERK_SECRET_KEY=sk_test_REPLACE_ME
METRICS_USER=REPLACE_ME
METRICS_PASSWORD=REPLACE_ME
EOF
chmod 600 /app/anonretro-staging/.env
```

`VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` should be the same value — the first is baked into the frontend bundle at build time, the second is read by the server at runtime.

`METRICS_USER` and `METRICS_PASSWORD` can be the same values you use for prod.

---

## Phase 5 — Install the nginx vhost (server)

```bash
# Copy the config from the repo
sudo cp /app/anonretro-staging/repo/deploy/nginx.staging.conf /etc/nginx/sites-available/anonretro-staging

# Enable it
sudo ln -s /etc/nginx/sites-available/anonretro-staging /etc/nginx/sites-enabled/anonretro-staging

# Create the basic auth password file — you'll be prompted to set a password
sudo htpasswd -c /etc/nginx/.htpasswd-staging staging

# Verify nginx config is valid
sudo nginx -t
```

---

## Phase 6 — Issue the TLS cert (server)

DNS from Phase 1 must have propagated before this step.

```bash
sudo certbot --nginx -d staging.anonretro.com
```

Certbot will edit `/etc/nginx/sites-available/anonretro-staging` in place to fill in the cert paths.
After it finishes:

```bash
sudo nginx -s reload
```

---

## Phase 7 — First deploy (server)

```bash
bash /app/anonretro-staging/repo/deploy/deploy.sh staging
```

This will:
1. Pull the `staging` branch
2. Build with your Clerk dev keys baked in
3. Start the `anonretro-staging` PM2 process on port 3001
4. Run the health check against port 3001
5. Call `pm2 save` so staging survives a server reboot

---

## Ongoing usage

Deploy staging:
```bash
bash /app/anonretro-staging/repo/deploy/deploy.sh staging
```

Rollback staging:
```bash
bash /app/anonretro-staging/repo/deploy/rollback.sh staging
# rollback to a specific release (see list printed by the script):
bash /app/anonretro-staging/repo/deploy/rollback.sh staging 2
```

Deploy prod (unchanged):
```bash
bash /app/anonretro/repo/deploy/deploy.sh prod
# or: bash /app/anonretro/repo/deploy/deploy.sh   (prod is the default)
```

PM2 process names: `anonretro` (prod, port 3000) and `anonretro-staging` (staging, port 3001).

---

## Promoting staging to prod

Once changes are tested on staging, merge the staging branch into main and deploy:

```bash
# local
git checkout main
git merge staging
git push origin main

# server
bash /app/anonretro/repo/deploy/deploy.sh prod
```
