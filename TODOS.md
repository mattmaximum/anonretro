# TODOs

Deferred items captured during code review. Pick up as drive-bys when touching the relevant file.

---

## P3 — export.ts: type getBoardData with proper Fastify types

**File:** `src/server/routes/export.ts:99`

`getBoardData(req: any, reply: any)` bypasses the Fastify type system. TypeScript won't catch a param typo (e.g. `req.params.idx` instead of `req.params.id`) until runtime.

**Fix:** Type as `FastifyRequest<{ Params: { id: string } }>` and `FastifyReply`. ~5 minutes.

**When:** Next time `export.ts` is touched for any reason.
