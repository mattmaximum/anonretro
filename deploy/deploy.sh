#!/bin/bash
set -euo pipefail

ENV="${1:-prod}"

case "$ENV" in
  prod)
    APP_DIR="/app/anonretro"
    PORT=3000
    PM2_APP_NAME="anonretro"
    BRANCH="main"
    ENV_FILE="$APP_DIR/.env"
    ECOSYSTEM_FILE="ecosystem.config.cjs"
    ;;
  staging)
    APP_DIR="/app/anonretro-staging"
    PORT=3001
    PM2_APP_NAME="anonretro-staging"
    BRANCH="staging"
    ENV_FILE="$APP_DIR/.env"
    ECOSYSTEM_FILE="ecosystem.staging.config.cjs"
    ;;
  *)
    echo "Usage: $0 [prod|staging]"
    exit 1
    ;;
esac

REPO_DIR="$APP_DIR/repo"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="$RELEASES_DIR/$TIMESTAMP"
KEEP_RELEASES=5

echo "=== Deploy $ENV $TIMESTAMP ==="

# 1. Pull latest code into the repo, locked to the correct branch
echo "→ Pulling latest code ($BRANCH)"
git -C "$REPO_DIR" fetch origin
git -C "$REPO_DIR" checkout "$BRANCH"
git -C "$REPO_DIR" pull origin "$BRANCH"

# 2. Create release directory and sync source (no node_modules, dist, or data)
echo "→ Creating release directory"
mkdir -p "$RELEASE_DIR"
rsync -a \
  --exclude=node_modules \
  --exclude=dist \
  --exclude='.git' \
  --exclude=data \
  --exclude='.env' \
  "$REPO_DIR/" "$RELEASE_DIR/"

# 3. Install dependencies and build inside the release directory
echo "→ Installing dependencies"
cd "$RELEASE_DIR"
npm ci

# Source .env so VITE_ vars (baked into the frontend bundle) are available at build time
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

echo "→ Building"
npm run build

# Remove devDependencies from the release to save disk space
npm prune --omit=dev

# 4. Record current release before switching (for auto-rollback)
PREVIOUS_RELEASE=$(readlink "$CURRENT_LINK" 2>/dev/null || echo "")

# 5. Atomically switch the symlink to the new release
echo "→ Switching current → $RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

# 6. Reload (or start) via PM2
echo "→ Reloading PM2"
ECOSYSTEM="$CURRENT_LINK/$ECOSYSTEM_FILE"
if pm2 describe "$PM2_APP_NAME" &>/dev/null; then
  pm2 reload "$ECOSYSTEM" --update-env
else
  pm2 start "$ECOSYSTEM"
fi

# 7. Smoke test — auto-rollback on failure
echo "→ Smoke testing /api/health..."
sleep 4
if curl -sf "http://localhost:$PORT/api/health" > /dev/null; then
  echo "✓ Health check passed"
  pm2 save
else
  echo "✗ Health check failed — rolling back"
  if [ -n "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
    pm2 reload "$ECOSYSTEM" --update-env
    sleep 3
    echo "✓ Rolled back to $(basename "$PREVIOUS_RELEASE")"
  else
    echo "No previous release to roll back to"
  fi
  exit 1
fi

# 8. Prune releases older than the most recent KEEP_RELEASES
echo "→ Pruning old releases (keeping last $KEEP_RELEASES)"
ls -dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo ""
echo "=== Done: $(basename "$RELEASE_DIR") is live ($ENV) ==="
pm2 status "$PM2_APP_NAME"
