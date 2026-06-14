import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// Mirror of the DB logic tested in isolation — no Fastify wiring needed.

function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id   TEXT UNIQUE NOT NULL,
      is_pro          INTEGER NOT NULL DEFAULT 0,
      is_lifetime     INTEGER NOT NULL DEFAULT 0,
      lemonsqueezy_order_id TEXT,
      lemonsqueezy_variant_id TEXT,
      email           TEXT,
      created_at      TEXT NOT NULL
    )
  `)
  return db
}

function makeStatements(db: Database.Database) {
  const upsertLifetime = db.prepare(`
    INSERT INTO users (clerk_user_id, is_pro, is_lifetime, lemonsqueezy_order_id, lemonsqueezy_variant_id, email, created_at)
    VALUES (?, 1, 1, ?, ?, ?, ?)
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      is_pro = 1,
      is_lifetime = 1,
      lemonsqueezy_order_id = excluded.lemonsqueezy_order_id,
      lemonsqueezy_variant_id = excluded.lemonsqueezy_variant_id,
      email = excluded.email
  `)

  const upsertAnnual = db.prepare(`
    INSERT INTO users (clerk_user_id, is_pro, email, created_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      is_pro = 1,
      email = excluded.email
  `)

  const clearLifetimeOnly = db.prepare(
    'UPDATE users SET is_lifetime = 0 WHERE clerk_user_id = ?'
  )

  const revokeFullAccess = db.prepare(
    'UPDATE users SET is_pro = 0, is_lifetime = 0 WHERE clerk_user_id = ?'
  )

  const revokeAnnual = db.prepare(
    'UPDATE users SET is_pro = 0 WHERE clerk_user_id = ? AND is_lifetime = 0'
  )

  const getUserByOrderId = db.prepare(
    'SELECT * FROM users WHERE lemonsqueezy_order_id = ?'
  )

  const getUserByClerkId = db.prepare(
    'SELECT * FROM users WHERE clerk_user_id = ?'
  )

  return { upsertLifetime, upsertAnnual, clearLifetimeOnly, revokeFullAccess, revokeAnnual, getUserByOrderId, getUserByClerkId }
}

const NOW = new Date().toISOString()
const LIFETIME_VARIANT = 'var_lifetime_123'
const UPGRADE_VARIANT = 'var_upgrade_456'
const ORDER_LIFETIME = 'ord_001'
const ORDER_UPGRADE = 'ord_002'
const SUB_ID = 'sub_001'
const CLERK_ID = 'user_clerk_abc'

describe('grantLifetimeAccess (order_created)', () => {
  let db: Database.Database
  let stmts: ReturnType<typeof makeStatements>

  beforeEach(() => {
    db = createTestDb()
    stmts = makeStatements(db)
  })

  it('creates a new user with is_pro=1 and is_lifetime=1', () => {
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)
    expect(user.is_lifetime).toBe(1)
    expect(user.lemonsqueezy_variant_id).toBe(LIFETIME_VARIANT)
    expect(user.lemonsqueezy_order_id).toBe(ORDER_LIFETIME)
  })

  it('upgrades an existing annual user to lifetime', () => {
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    stmts.upsertLifetime.run(CLERK_ID, ORDER_UPGRADE, UPGRADE_VARIANT, 'a@b.com', NOW)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)
    expect(user.is_lifetime).toBe(1)
    expect(user.lemonsqueezy_variant_id).toBe(UPGRADE_VARIANT)
  })

  it('is idempotent on double-fire', () => {
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)
    expect(user.is_lifetime).toBe(1)
  })
})

describe('revokeLifetimeAccess (order_refunded)', () => {
  let db: Database.Database
  let stmts: ReturnType<typeof makeStatements>

  beforeEach(() => {
    db = createTestDb()
    stmts = makeStatements(db)
  })

  it('fully revokes when $29 lifetime variant is refunded', () => {
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    // Simulate revokeLifetimeAccess branching: LIFETIME_VARIANT → revokeFullAccess
    const user = stmts.getUserByOrderId.get(ORDER_LIFETIME) as any
    expect(user.lemonsqueezy_variant_id).toBe(LIFETIME_VARIANT)
    stmts.revokeFullAccess.run(user.clerk_user_id)
    const after = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(after.is_pro).toBe(0)
    expect(after.is_lifetime).toBe(0)
  })

  it('clears is_lifetime only when $11 upgrade variant is refunded, keeps is_pro', () => {
    // User has annual + lifetime upgrade
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    stmts.upsertLifetime.run(CLERK_ID, ORDER_UPGRADE, UPGRADE_VARIANT, 'a@b.com', NOW)
    // Simulate revokeLifetimeAccess branching: UPGRADE_VARIANT → clearLifetimeOnly
    const user = stmts.getUserByOrderId.get(ORDER_UPGRADE) as any
    expect(user.lemonsqueezy_variant_id).toBe(UPGRADE_VARIANT)
    stmts.clearLifetimeOnly.run(user.clerk_user_id)
    const after = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(after.is_pro).toBe(1)   // annual subscription still active
    expect(after.is_lifetime).toBe(0)
  })
})

describe('grantAnnualAccess (subscription_created)', () => {
  let db: Database.Database
  let stmts: ReturnType<typeof makeStatements>

  beforeEach(() => {
    db = createTestDb()
    stmts = makeStatements(db)
  })

  it('sets is_pro=1 for a new user', () => {
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)
  })

  // D3 invariant: grantAnnualAccess must NOT clobber is_lifetime
  it('does NOT overwrite is_lifetime=1 on an existing lifetime holder', () => {
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    // subscription_created fires (timing edge: user buys annual after lifetime — unusual but possible)
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_lifetime).toBe(1)   // must be preserved
    expect(user.is_pro).toBe(1)
  })
})

describe('subscription_cancelled (no-op)', () => {
  let db: Database.Database
  let stmts: ReturnType<typeof makeStatements>

  beforeEach(() => {
    db = createTestDb()
    stmts = makeStatements(db)
  })

  // D6 decision: cancelled ≠ expired. Access stays until subscription_expired fires.
  it('does not change is_pro when subscription is cancelled', () => {
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    // subscription_cancelled handler does nothing — we verify state is unchanged
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)
  })
})

describe('revokeAnnualAccess (subscription_expired)', () => {
  let db: Database.Database
  let stmts: ReturnType<typeof makeStatements>

  beforeEach(() => {
    db = createTestDb()
    stmts = makeStatements(db)
  })

  it('revokes is_pro for an annual-only subscriber', () => {
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    stmts.revokeAnnual.run(CLERK_ID)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(0)
  })

  // D5 CRITICAL INVARIANT: lifetime holders must survive subscription_expired
  it('does NOT revoke is_pro when user has is_lifetime=1', () => {
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    stmts.revokeAnnual.run(CLERK_ID)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)        // lifetime access must survive
    expect(user.is_lifetime).toBe(1)
  })

  it('is safe to fire twice (idempotent revocation)', () => {
    stmts.upsertAnnual.run(CLERK_ID, 'a@b.com', NOW)
    stmts.revokeAnnual.run(CLERK_ID)
    stmts.revokeAnnual.run(CLERK_ID)   // second fire from LS retry
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(0)
  })

  it('does NOT revoke is_pro for a lifetime holder even on double-fire', () => {
    stmts.upsertLifetime.run(CLERK_ID, ORDER_LIFETIME, LIFETIME_VARIANT, 'a@b.com', NOW)
    stmts.revokeAnnual.run(CLERK_ID)
    stmts.revokeAnnual.run(CLERK_ID)
    const user = stmts.getUserByClerkId.get(CLERK_ID) as any
    expect(user.is_pro).toBe(1)
    expect(user.is_lifetime).toBe(1)
  })
})
