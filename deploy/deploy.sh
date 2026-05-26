#!/bin/bash
# Run from the repo root on the server: bash deploy/deploy.sh
set -e

echo "→ Pulling latest code"
git pull

echo "→ Installing dependencies"
npm ci --omit=dev --ignore-scripts
npm ci --include=dev

echo "→ Building"
npm run build

echo "→ Ensuring PM2 is installed"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  pm2 startup
fi

echo "→ Starting or reloading app"
if pm2 describe anonretro &>/dev/null; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

echo "→ Saving PM2 process list"
pm2 save

echo "→ Done"
pm2 status anonretro
