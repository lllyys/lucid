---
branch: feat/feature-9-wi-8b-sqlite-store
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 2
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-8b (server SQLite sync store)

The correctness core of the self-hosted server: `createSyncStore(path=':memory:')` → `applyOps` /
`changesSince` / `purge` / `close`, backed by `node:sqlite`. The SERVER-side half of the
optimistic-concurrency contract — server-assigned monotonic `rev` is the ordering authority, conflicts
return the authoritative entity. Files: NEW `server/src/db.ts`, `server/src/types.ts`,
`server/src/db.test.ts`.

## Auditor note (rule-47 fallback)

Codex's quota is exhausted (until ~Jun 18 11:38). Both rounds used a fresh independent read-only Claude
`auditor` subagent (separate context from the implementer — preserves the rule-48 boundary). The
implementation was drafted by a fresh-context general-purpose subagent and reviewed + tightened +
gate-verified by the orchestrator (rule 48).

## Round 1 — NEEDS WORK (1 Medium; 2 Low informational)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | the store is the UNTRUSTED server boundary but `applyOps` stored `updatedAt`/`deletedAt`/`type`/`payload` verbatim with no validation — a malformed op (e.g. `updatedAt:-1`, fractional, negative `deletedAt`, bad type, non-object payload) would persist and later be re-emitted on the CONFLICT path as a `server` SyncEntity that FAILS the client's `isSyncEntity` guard, mismapping a real conflict to `badRequest`. | **FIXED** — added `assertValidOp` (+ a local `isNonNegInt`) run over the whole batch BEFORE `BEGIN IMMEDIATE`; a malformed op throws → the batch is rejected atomically (nothing persisted) → the WI-8c HTTP layer maps the throw to 400. Validates exactly the op-sourced fields that reach a re-emitted entity (type ∈ valid set, payload non-array object, updatedAt/deletedAt non-neg-int, id string, baseRev non-neg-int), each with the same predicate as the client guard. +10 tests. |

Round-1 affirmed correct: atomic monotonic rev (`COALESCE(MAX(rev),0)+1` per applied op inside one `BEGIN IMMEDIATE`/`COMMIT`, ROLLBACK on throw); first applied rev is **1** (satisfies the client's `isPosInt` ≥1); conflict returns the authoritative entity with `server.id === op.id`; `changesSince` filters `rev>since` ASC + `maxRev`=MAX(rev) or `since` if empty; all values bound via prepared-statement params (no SQL injection); bigint→number coercion safe for the in-range columns; lucid compliance (no `any`, <300 lines, node:sqlite only, no cross-import from src/, strict + noUncheckedIndexedAccess).

## Round 2 — verdict: CLEAN

> "The Medium from round 1 is closed. … `assertValidOp` guards every op-sourced field that reaches the
> conflict-re-emit path with the same predicate the client uses … Throw-before-transaction is the right
> mechanism … no row is written and there is no open transaction to roll back … boundary cases correct
> (`updatedAt:0`/`deletedAt:0` accepted, `-1`/`0.5` rejected) … no regression, no false rejection (the
> client's own `isPushOp` uses the identical conjunct set, so any op the client sends passes) … a
> null/undefined/primitive op falls to the throw with no spurious TypeError (short-circuit + optional
> chaining). CLEAN."

### Low / informational findings — accepted with rationale (non-blocking)

- **L1**: `assertValidOp(op: PushOp)` is typed as already-`PushOp` though it validates untrusted input —
  consider `op: unknown`. **Accepted**: the runtime defense is sound regardless (it treats `op` as
  possibly null/non-object); `applyOps`'s typed contract is `PushOp[]`, and the actual JSON-parse
  boundary is WI-8c (which converts `unknown` → the typed batch). Changing the signature adds narrowing
  boilerplate for no runtime gain; not refactoring post-CLEAN to avoid un-audited changes.
- **L2**: the 400 error message names the op id but not the offending field. **Accepted**: coarse-but-safe
  (deliberately does not echo payload/secrets); WI-8c decides how much to surface.
- **L3**: `isNonNegInt` is duplicated (server `db.ts` + client `src/lib/guards.ts`). **Accepted**: the
  duplication is deliberate and documented — the server is a separate deployable that must not import
  client code (`types.ts` header).

`cd server && pnpm test` → 28 passed (2 files); `cd server && pnpm typecheck` → green (strict +
noUncheckedIndexedAccess). Root `pnpm check:all` unaffected (server excluded): 68 files / 917 tests / 100%.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium; 3 Low accepted with rationale.
