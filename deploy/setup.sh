#!/bin/bash
# One-time server setup on a fresh Ubuntu 22.04 VPS.
# Run as root or with sudo.
set -e

# Build tools (needed for better-sqlite3 native compilation)
apt-get update
apt-get install -y build-essential python3 nginx certbot python3-certbot-nginx rsync

# Node 22 LTS (stable prebuilts for better-sqlite3)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# pm2
npm install -g pm2

# DB directory
mkdir -p /var/data/anonretro
chown $SUDO_USER:$SUDO_USER /var/data/anonretro

# App directory structure for release-based deploys
mkdir -p /app/anonretro/releases
chown -R $SUDO_USER:$SUDO_USER /app/anonretro

echo "Node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"
echo ""
echo "Next steps:"
echo "  1. Clone repo:   git clone <your-repo-url> /app/anonretro/repo"
echo "  2. First deploy: bash /app/anonretro/repo/deploy/deploy.sh"
echo "  3. PM2 startup:  pm2 startup  (then run the printed command)"
echo "  4. SSL:          certbot --nginx -d anonretro.com -d www.anonretro.com"
