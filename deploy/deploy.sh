#!/bin/bash
# Run from the repo root on the server: bash deploy/deploy.sh
set -e

echo "→ Installing dependencies"
npm ci --omit=dev --ignore-scripts
npm ci --include=dev   # need devDeps for the build step

echo "→ Building"
npm run build

echo "→ Restarting"
pm2 reload ecosystem.config.cjs --update-env

echo "→ Done"
pm2 status anonretro
