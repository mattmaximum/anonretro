module.exports = {
  apps: [{
    name: 'anonretro-staging',
    script: 'dist/server/server/index.js',
    cwd: '/app/anonretro-staging/current',
    exec_mode: 'fork',      // cluster mode breaks import.meta.url in ESM
    instances: 1,           // SQLite is single-writer
    autorestart: true,
    restart_delay: 2000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DATABASE_PATH: '/var/data/anonretro/staging.db',
      ALLOWED_ORIGINS: 'https://staging.anonretro.com',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
      METRICS_USER: process.env.METRICS_USER,
      METRICS_PASSWORD: process.env.METRICS_PASSWORD,
      LEMON_SQUEEZY_WEBHOOK_SECRET: process.env.LEMON_SQUEEZY_WEBHOOK_SECRET,
      LEMON_SQUEEZY_LIFETIME_VARIANT_ID: process.env.LEMON_SQUEEZY_LIFETIME_VARIANT_ID,
      LEMON_SQUEEZY_UPGRADE_VARIANT_ID: process.env.LEMON_SQUEEZY_UPGRADE_VARIANT_ID,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      CONTACT_EMAIL: process.env.CONTACT_EMAIL,
      CONTACT_FROM: process.env.CONTACT_FROM,
    },
  }],
}
