/**
 * AnonRetro admin CLI
 *
 * Usage (run on the VPS from the repo or release dir):
 *   npx tsx scripts/admin.ts list
 *   npx tsx scripts/admin.ts gift <clerk_user_id>
 *   npx tsx scripts/admin.ts revoke <clerk_user_id>
 *
 * Finding a Clerk user ID:
 *   Go to dashboard.clerk.com → your app → Users → click the user → copy the ID (starts with "user_")
 *
 * DATABASE_PATH is read from the environment (defaults to ./data/anonretro.db).
 * On the VPS, run:
 *   DATABASE_PATH=/var/data/anonretro/anonretro.db npx tsx scripts/admin.ts list
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'anonretro.db')

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at: ${DB_PATH}`)
  console.error('Set DATABASE_PATH env var to the correct path.')
  process.exit(1)
}

const db = new Database(DB_PATH, { readonly: false })

const [,, command, arg] = process.argv

switch (command) {
  case 'list':
    listProUsers()
    break

  case 'gift':
    if (!arg) { console.error('Usage: admin.ts gift <clerk_user_id>'); process.exit(1) }
    giftLicense(arg)
    break

  case 'revoke':
    if (!arg) { console.error('Usage: admin.ts revoke <clerk_user_id>'); process.exit(1) }
    revokeLicense(arg)
    break

  default:
    console.log(`
AnonRetro Admin CLI

Commands:
  list                   Show all users with pro access
  gift <clerk_user_id>   Grant pro access to a user
  revoke <clerk_user_id> Revoke pro access from a user

Find a Clerk user ID at dashboard.clerk.com → Users → click user → copy ID (user_...)
    `.trim())
    break
}

db.close()

// ─────────────────────────────────────────────────────────────────────────────

function listProUsers() {
  const rows = db.prepare(
    'SELECT clerk_user_id, email, lemonsqueezy_order_id, created_at FROM users WHERE is_pro = 1'
  ).all() as Array<{ clerk_user_id: string; email: string | null; lemonsqueezy_order_id: string | null; created_at: string }>

  if (rows.length === 0) {
    console.log('No pro users.')
    return
  }

  console.log(`\nPro users (${rows.length}):\n`)
  for (const row of rows) {
    console.log(`  Clerk ID : ${row.clerk_user_id}`)
    console.log(`  Email    : ${row.email ?? '(not recorded)'}`)
    console.log(`  Order ID : ${row.lemonsqueezy_order_id ?? '(gifted — no order)'}`)
    console.log(`  Since    : ${row.created_at}`)
    console.log()
  }
}

function giftLicense(clerkUserId: string) {
  const user = db.prepare('SELECT * FROM users WHERE clerk_user_id = ?').get(clerkUserId) as
    | { clerk_user_id: string; is_pro: number; email: string | null }
    | undefined

  if (!user) {
    console.error(`User not found: ${clerkUserId}`)
    console.error('The user must sign in to anonretro.com at least once before a license can be gifted.')
    process.exit(1)
  }

  if (user.is_pro === 1) {
    console.log(`${clerkUserId} (${user.email ?? 'no email'}) already has pro access.`)
    process.exit(0)
  }

  db.prepare(
    'UPDATE users SET is_pro = 1 WHERE clerk_user_id = ?'
  ).run(clerkUserId)

  console.log(`✓ Pro access granted to ${clerkUserId} (${user.email ?? 'no email'}).`)
}

function revokeLicense(clerkUserId: string) {
  const user = db.prepare('SELECT * FROM users WHERE clerk_user_id = ?').get(clerkUserId) as
    | { clerk_user_id: string; is_pro: number; email: string | null }
    | undefined

  if (!user) {
    console.error(`User not found: ${clerkUserId}`)
    process.exit(1)
  }

  if (user.is_pro === 0) {
    console.log(`${clerkUserId} (${user.email ?? 'no email'}) does not have pro access.`)
    process.exit(0)
  }

  db.prepare(
    'UPDATE users SET is_pro = 0 WHERE clerk_user_id = ?'
  ).run(clerkUserId)

  console.log(`✓ Pro access revoked from ${clerkUserId} (${user.email ?? 'no email'}).`)
}
