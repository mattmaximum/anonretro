module.exports = {
  apps: [{
    name: 'anonretro',
    script: 'dist/server/server/index.js',
    cwd: '/app/anonretro/current',
    instances: 1,           // SQLite is single-writer
    autorestart: true,
    restart_delay: 2000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_PATH: '/var/data/anonretro/anonretro.db',
      ALLOWED_ORIGINS: 'https://anonretro.com,https://www.anonretro.com',
    },
  }],
}
