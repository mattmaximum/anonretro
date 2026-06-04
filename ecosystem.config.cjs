module.exports = {
  apps: [{
    name: 'anonretro',
    script: 'dist/server/server/index.js',
    cwd: '/app/anonretro/current',
    exec_mode: 'fork',      // cluster mode breaks import.meta.url in ESM
    instances: 1,           // SQLite is single-writer
    autorestart: true,
    restart_delay: 2000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_PATH: '/var/data/anonretro/anonretro.db',
      ALLOWED_ORIGINS: 'https://anonretro.com,https://www.anonretro.com',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
    },
  }],
}
