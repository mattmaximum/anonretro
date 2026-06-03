#!/bin/bash
set -euo pipefail

APP_DIR="/app/anonretro"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"

# Collect releases newest-first
mapfile -t RELEASES < <(ls -dt "$RELEASES_DIR"/*/ 2>/dev/null | sed 's|/$||')

if [ ${#RELEASES[@]} -lt 2 ]; then
  echo "Only one release on disk — nothing to roll back to."
  exit 1
fi

CURRENT=$(readlink "$CURRENT_LINK" 2>/dev/null | sed 's|/$||')

echo "Releases on disk:"
for i in "${!RELEASES[@]}"; do
  LABEL=""
  [ "${RELEASES[$i]}" = "$CURRENT" ] && LABEL="  ← active"
  printf "  %d. %s%s\n" "$((i + 1))" "$(basename "${RELEASES[$i]}")" "$LABEL"
done
echo ""

# Determine target
if [ -n "${1:-}" ]; then
  # Explicit index passed as argument
  IDX=$((${1} - 1))
  TARGET="${RELEASES[$IDX]}"
else
  # Default: the release immediately before the current one
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

echo "Rolling back: $(basename "$CURRENT") → $(basename "$TARGET")"
ln -sfn "$TARGET" "$CURRENT_LINK"
pm2 reload "$CURRENT_LINK/ecosystem.config.cjs" --update-env

echo "→ Waiting for process to reload..."
sleep 4
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✓ Rollback successful — $(basename "$TARGET") is live"
  pm2 status anonretro
else
  echo "✗ Health check failed after rollback"
  exit 1
fi
