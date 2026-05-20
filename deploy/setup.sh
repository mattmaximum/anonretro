#!/bin/bash
# One-time server setup on a fresh Ubuntu 22.04 Hetzner CX11.
# Run as root or with sudo.
set -e

# Build tools (needed for better-sqlite3 native compilation)
apt-get update
apt-get install -y build-essential python3 nginx certbot python3-certbot-nginx

# Node 22 LTS (stable prebuilts for better-sqlite3)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# pm2
npm install -g pm2

# DB directory
mkdir -p /var/data/anonretro
chown $SUDO_USER:$SUDO_USER /var/data/anonretro

echo "Node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"
echo "Next: clone repo, copy ecosystem.config.cjs, update ALLOWED_ORIGINS, run deploy.sh, then certbot."
