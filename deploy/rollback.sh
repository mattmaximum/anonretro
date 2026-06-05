#!/bin/bash
set -euo pipefail

ENV="${1:-prod}"

case "$ENV" in
  prod)
    APP_DIR="/app/anonretro"
    PORT=3000
    PM2_APP_NAME="anonretro"
    ECOSYSTEM_FILE="ecosystem.config.cjs"
    ;;
  staging)
    APP_DIR="/app/anonretro-staging"
    PORT=3001
    PM2_APP_NAME="anonretro-staging"
    ECOSYSTEM_FILE="ecosystem.staging.config.cjs"
    ;;
  *)
    echo "Usage: $0 [prod|staging] [release_index]"
    exit 1
    ;;
esac

RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"

# Collect releases newest-first
mapfile -t RELEASES < <(ls -dt "$RELEASES_DIR"/*/ 2>/dev/null | sed 's|/$||')

if [ ${#RELEASES[@]} -lt 2 ]; then
  echo "Only one release on disk — nothing to roll back to."
  exit 1
fi

CURRENT=$(readlink "$CURRENT_LINK" 2>/dev/null | sed 's|/$||')

echo "Releases on disk ($ENV):"
for i in "${!RELEASES[@]}"; do
  LABEL=""
  [ "${RELEASES[$i]}" = "$CURRENT" ] && LABEL="  ← active"
  printf "  %d. %s%s\n" "$((i + 1))" "$(basename "${RELEASES[$i]}")" "$LABEL"
done
echo ""

# Determine target — optional second argument is the release index
if [ -n "${2:-}" ]; then
  IDX=$(($2 - 1))
  TARGET="${RELEASES[$IDX]}"
else
  TARGET=""
  for release in "${RELEASES[@]}"; do
    if [ "$release" != "$CURRENT" ]; then
      TARGET="$release"
      break
    fi
  done
fi

if [ -z "$TARGET" ]; then
  echo "Could not determine rollback target."
  exit 1
fi

if [ "$TARGET" = "$CURRENT" ]; then
  echo "$(basename "$TARGET") is already active — nothing to do."
  exit 0
fi

echo "Rolling back ($ENV): $(basename "$CURRENT") → $(basename "$TARGET")"
ln -sfn "$TARGET" "$CURRENT_LINK"
pm2 reload "$CURRENT_LINK/$ECOSYSTEM_FILE" --update-env

echo "→ Waiting for process to reload..."
sleep 4
if curl -sf "http://localhost:$PORT/api/health" > /dev/null; then
  echo "✓ Rollback successful — $(basename "$TARGET") is live"
  pm2 status "$PM2_APP_NAME"
else
  echo "✗ Health check failed after rollback"
  exit 1
fi
