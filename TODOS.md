# TODOs

Deferred items captured during code review. Pick up as drive-bys when touching the relevant file.

---

## P3 — Verify accounts.anonretro.com CNAME in Clerk dashboard

**Where:** Clerk Dashboard → Configure → Domains → Account portal

`accounts.anonretro.com` shows as Unverified. The CNAME record is in Cloudflare
(`accounts` → `accounts.clerk.services`, DNS-only). Clerk's checker couldn't verify it
at setup time due to DNS propagation lag. Run "Verify configuration" in the Clerk
dashboard to pick it up — should pass now that DNS is stable.

**Impact:** The hosted Clerk account management page (`accounts.anonretro.com`) won't
work until verified. Sign-in, sign-up, and auth are unaffected.

**When:** Next time you're in the Clerk dashboard for any reason.

---

## P3 — export.ts: type getBoardData with proper Fastify types

**File:** `src/server/routes/export.ts:99`

`getBoardData(req: any, reply: any)` bypasses the Fastify type system. TypeScript won't catch a param typo (e.g. `req.params.idx` instead of `req.params.id`) until runtime.

**Fix:** Type as `FastifyRequest<{ Params: { id: string } }>` and `FastifyReply`. ~5 minutes.

**When:** Next time `export.ts` is touched for any reason.
