# anonretro Deployment

Release-based deployment (Capistrano-style). Achieves zero-downtime deploys and instant
rollback without true blue/green — which isn't viable here because SQLite is single-writer.

## Directory structure on the VPS

```
/app/anonretro/
  repo/                        ← git working directory (pull happens here)
  releases/
    20260603_194102/           ← each deploy gets a timestamped directory
    20260603_210000/           ← full build + node_modules inside
  current -> releases/20260603_210000   ← symlink, points to active release

/var/data/anonretro/anonretro.db       ← SQLite DB, lives outside releases
```

The database lives at a fixed path outside all releases. It survives deploys and rollbacks.

## How a deploy works (`deploy/deploy.sh`)

1. `git pull` into `/app/anonretro/repo`
2. `rsync` source into a new timestamped release dir (excludes `node_modules`, `dist`, `data`, `.git`)
3. `npm ci && npm run build && npm prune --omit=dev` inside the release dir
4. Record the current symlink target (for auto-rollback)
5. Atomically switch `/app/anonretro/current` symlink to the new release
6. `pm2 reload ecosystem.config.cjs --update-env` — graceful zero-downtime handoff
7. Smoke test `GET /api/health` after 4s — auto-rolls back symlink + reloads if it fails
8. Prune releases older than the 5 most recent

## How rollback works (`deploy/rollback.sh`)

Re-points the symlink to a previous release + `pm2 reload`. No rebuild required. Takes ~5 seconds.

```bash
# Roll back to the previous release (default)
bash deploy/rollback.sh

# Roll back to a specific release by index
bash deploy/rollback.sh 2   # second most recent
```

The script lists all releases on disk with the active one marked, so you can see what
you're rolling back to before it happens.

## Common operations

```bash
# Deploy from local machine (runs on the VPS via SSH or directly on VPS)
bash deploy/deploy.sh

# Check current release and PM2 status
pm2 status anonretro
readlink /app/anonretro/current

# List all releases
ls -lt /app/anonretro/releases/

# Tail logs
pm2 logs anonretro --lines 100
```

## Key implementation decisions

| Decision | Why |
|---|---|
| `exec_mode: 'fork'` in PM2 | ESM modules (`"type": "module"`) break `import.meta.url` in PM2 cluster mode, causing static files to 404 |
| `cwd: '/app/anonretro/current'` in PM2 | PM2 resolves the script path through the symlink, so it always runs the active release |
| SQLite DB outside releases | `/var/data/anonretro/anonretro.db` never moves — survives deploys and rollbacks |
| `pm2 reload` not `pm2 restart` | Reload does a graceful handoff; restart kills first (risks an orphan-process bug) |
| `instances: 1` in PM2 | SQLite is single-writer; multiple instances would corrupt the DB |
| Smoke test before pruning | If the new release is broken, auto-rollback fires before old releases are deleted |
| `rsync` not `cp -r` | Faster incremental copy; excludes large dirs cleanly with `--exclude` |

## Files

| File | Purpose |
|---|---|
| `deploy/deploy.sh` | Main deploy script |
| `deploy/rollback.sh` | Manual rollback to any previous release |
| `deploy/setup.sh` | First-time VPS provisioning |
| `deploy/nginx.conf` | nginx reverse proxy config |
| `ecosystem.config.cjs` | PM2 process config (CJS because PM2 doesn't support ESM config files) |
