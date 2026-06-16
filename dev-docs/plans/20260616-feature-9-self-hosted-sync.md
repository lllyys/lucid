# Feature #9 — Self-hosted server-side persistence + sync

> **Status:** PLANNED (Gate-1 + Gate-2 CLEAN; Phase-0 spike PASSED) · GH: #45 · Size: **Large** (10 WIs + a server package)
> Cross-model input: Codex review (defer→build-with-spike; per-entity conflict is the core; real/recoverable
> identity; keys stay client-side) + a 6-agent design workflow (option panel → synthesis → adversarial
> review). The adversarial review returned **NEEDS_REVISION** — this plan is the design **as corrected**.

## Problem

Sessions, task history, glossary, and polish keywords persist to **localStorage only** (per-device, lost
on cache-clear, no cross-device sync). The user wants this data durable + synced on **their own
self-hosted server** (NOT a cloud BaaS). Provider API keys stay client-side/in-memory (rule 65 §5) — this
feature syncs DATA only.

## ADR — chosen architecture (with the two USER decisions flagged)

**Stack:** a thin self-hosted **Hono server** (Node 22+/Bun) + **SQLite** (prefer built-in `node:sqlite`,
fallback `better-sqlite3` — the Phase-0 spike decides on the deploy-min Node), in a **separate `server/`
workspace package** (never bundled into the browser, never in `pnpm check:all`). The browser talks to it
through ONE injectable `SyncBackend` interface (mirrors `createProvider({fetch})` / `createSafeJSONStorage({backend})`).
All merge/conflict/offline logic is **pure, headless `src/lib/sync/**`**; the server is a dumb durable store.
Chosen 8/10 over Postgres (over-weight) and self-hosted Supabase (rejected by the brief + a ~10-container
RLS-as-sole-guard footgun).

**Conflict ordering — CORRECTED (review Critical #1):** the **server-assigned monotonic `rev` is the
PRIMARY ordering authority**, NOT client `updatedAt`. The single server serializes all writes and stamps the
next `rev` atomically; the client's last-seen `rev` is the optimistic-concurrency base. `updatedAt` is
**display metadata only** — client wall-clocks never decide ordering, so a skewed clock cannot silently
overwrite. (Original draft made `updatedAt` primary with `rev` only as an equal-ts tiebreaker — that let a
fast-clock device win silently; fixed.)

**v1 conflict scope — honest (review Critical #2) [USER DECISION A]:** entity-level granularity makes the
COMMON multi-device case lossless — tasks/terms/keywords are **independent entities**, so concurrent ADDs to
different entities merge cleanly. The narrow lossy case is: the **same** entity's fields edited divergently
on **two devices while both offline**, then both reconnect → server-rev LWW keeps the last push, the earlier
is superseded. v1 **computes + surfaces a `conflicts` signal** (headless, tested) but the **conflict-review
UI is deferred** (design-gated). → **Decision A — RESOLVED (user, 2026-06-16): ship v1 this way** — per-entity
LWW + a surfaced (not-yet-reviewable) conflict signal; the "no silent loss" guarantee is scoped to
*different-entity* edits in v1 (field-level merge / conflict-review UI = a future feature).

**Auth + token persistence — CORRECTED (review Critical #3) [USER DECISION B]:** single-user, single-tenant
— ONE server-generated **bearer token** (constant-time compared; no JWT/OAuth machinery for a one-human box).
But a token that drives **background/reconnect sync MUST persist** across reloads — this **diverges from the
in-memory-only provider-key pattern** and lands a long-lived credential in browser storage (bigger blast
radius). → **Decision B — RESOLVED (user, 2026-06-16): persist the sync token** (localStorage/IndexedDB, treated
as sensitive — redacted, `…last4`, TLS-only) for seamless background sync; documented as an explicit divergence
from the in-memory provider-key pattern in AGENTS.md / rule 65 §5. (Prior alternative — in-memory + re-paste-per-session
UX. Either way, documented explicitly in AGENTS.md / rule 65 §5 (not hand-waved as "same as provider keys").

**Tenant scope — CORRECTED (review High #4):** **DROP `userId`** for single-user v1 (one token = one
principal; a `userId` column with no token→user binding + no `WHERE userId=?` is decorative and a false
guarantee). Adding it later is an *additive* migration, not breaking. If multi-user is ever wanted, bind
token→userId + filter every query then.

**Provider keys:** stay client-side/in-memory (rule 65 §5). Key-proxying is a separate feature, explicitly
out of scope.

## Phase-0 spike (rule 60 §7 — must PASS before any WI)

Throwaway probe under `dev-docs/grills/feature-9-sync/`, validating the three load-bearing assumptions:
1. **Engine:** Hono + `node:sqlite` boots + UPSERTs with an atomic monotonic `rev` on the **deploy-minimum
   Node** (not just the dev box) WITHOUT a native build; else confirm `better-sqlite3` + record the engine decision.
2. **Protocol + skew-immunity (the corrected core):** drive pull→merge→push→re-pull across two simulated
   clients against one `:memory:` server; assert a device with a **+1h clock CANNOT silently overwrite** a
   concurrently-edited entity (server-`rev` ordering wins); delete-then-readd-same-label converges; a stale-rev
   push returns a **conflict, not an overwrite**; re-pushing an applied op is a no-op (idempotent UPSERT,
   incl. the crash-mid-seed INSERT branch).
3. **Eviction-vs-resurrection:** a capped/evicted session does not resurrect-loop across devices.

## Surface area (corrected)

- **`pnpm-workspace.yaml`** — add `packages:` (currently only `allowBuilds`; single-package today) + scope
  `pnpm check:all` (`eslint .`, `vitest run`, coverage) to **exclude `server/**`** so the hermetic gate stays
  client-only (review Medium #8). Foundational pre-work.
- **`src/lib/async/`** (NEW) — extract `realSleep`/`backoffDelay`/jitter from `src/providers/` into a neutral
  util both providers + sync import (review Medium #9 — `retry.ts` is provider-typed, not a drop-in).
- **Client stores** — add `updatedAt`+`deletedAt` to Session/Task/Term; convert `polishKeywords: string[]` →
  `Keyword{id,value,updatedAt,deletedAt}` with ids **deterministically derived from the normalized value**
  (so independent per-device migrations converge — review High #7; preserve the case-SENSITIVE keyword dedupe
  contract); `PERSIST_VERSION` bump + backfilling `migrate`. Tasks sync as their own entities keyed by
  `sessionId` (not an embedded array → avoids whole-session blob LWW).
- **`src/lib/sync/`** (NEW) — `types.ts` (SyncEntity{id,rev,updatedAt(meta),deletedAt}, EntityType,
  Pull/PushResult, SyncError + hand-written type guards — **no zod**, keep the client dep-free, review Medium #10);
  `merge.ts` (pure `mergeEntities` — server-`rev`-primary LWW, causal delete-wins, returns `{resolved,conflicts}`);
  `backend.ts` (`SyncBackend` interface + `createRestSyncBackend({fetch,baseUrl,token})`); `queue.ts` (offline
  queue); `engine.ts` (orchestrator). All network through injected `fetch`; hermetic.
- **`server/`** (NEW package) — Hono + SQLite; bearer-auth middleware; `GET/POST /sync/changes` with atomic-rev
  **UPSERT** (`INSERT … ON CONFLICT(id) DO UPDATE WHERE excluded dominates`, review Medium #12) + conflict
  return; **`DELETE /sync/data`** purge endpoint (so disconnect-and-erase is possible, review Medium #11); its
  own `engines.node` floor (review Low #13). Tested against `:memory:` in a SEPARATE non-gating suite.
- **i18n** — `error.syncUnreachable`/`syncAuth`/`syncConflict` keys; **headless-only until WI-9** (the sync
  error/status states are visible UI surfaces, rule 51 — review Low #15).
- **Docs (rule 20):** amend AGENTS.md (browser app PLUS an optional self-hosted sync server; local-only stays
  first-class; CI hermetic); rule 65 §5 (the sync server's trust boundary = workspace data only, plaintext, no
  E2E in v1; the persisted-token decision); rule 65 §6 (what leaves the device when sync is opted-in);
  `.claude/hooks` TDD-guard scope += `src/lib/sync/**`; a `dev-docs/` server setup/TLS/backup doc.

## Migration + privacy (corrected)

- **Consent-gated, idempotent, reversible** localStorage→server seed: nothing auto-uploads; `buildSeedFromLocal()`
  is pure; seeding goes through the idempotent UPSERT path (stable ids → re-run is a no-op); `disconnectSync()`
  reverts to local-only (local copy untouched). **Server residue (review Medium #11):** plain disconnect leaves
  uploaded rows on the server; an explicit **"disconnect and erase server data"** path hits `DELETE /sync/data`.
  Both documented honestly.
- **Privacy (rule 65 §6):** sync is **OPT-IN**; **local-only stays first-class** — with no server configured the
  app behaves exactly as today (nothing transmitted, no listeners/timers/queue armed — review Low #16, tested).
  Ollama + self-hosted sync = an end-to-end **zero-third-party** path. What leaves the device when ON: sessions +
  task text + terms + keywords, to the user's OWN server only, never elsewhere, never as analytics.
- **Eviction caps (review High #5):** today's `MAX_SESSIONS=50`/`MAX_TASKS=200` drop-oldest with no tombstone →
  resurrection loops. When sync is ON the **server is the durable store**; client caps become a display window,
  not a deletion (or eviction writes a tombstone). Reconciled in WI-1/WI-7 + a dedicated test.
- **Migration baseline (WI-1a Gate-4 #6):** the store-model migration only *adds* the envelope. Hard deletes
  performed before the tombstone-on-delete WI (WI-7) lands produce **no** tombstone — they are simply absent from
  the migrated state, and the sync layer treats the first push of migrated data as the **baseline**, not a set of
  resurrections. Selector filtering on `deletedAt` ships in the same WI that first *creates* a tombstone, so there
  is never a window where a live tombstone goes unfiltered.

## Work items (re-tiered)

| WI | Tier | Scope |
|----|------|-------|
| WI-0 | foundational | workspace `packages:` + check:all scoping (exclude `server/**`); extract `src/lib/async/` shared sleep/backoff |
| WI-1 | **behavioral** | store-model migration (updatedAt/deletedAt, deterministic keyword ids, PERSIST_VERSION + backfill) — **mutates persisted data → slice-verify lossless upgrade** (review Low #14). **Split into slices to hold quality at depth:** WI-1a = **sessionStore** (done, v0.6.2; Gate-4 CLEAN, surfaced pre-existing id-collision bug GH #55); WI-1b = **glossaryStore** (done, v0.6.3; Gate-4 CLEAN; also hardened BOTH migrations to skip malformed-but-object entries that would crash `.toLowerCase()`); WI-1c = **keywords `string[] → Keyword[]`** (done, v0.6.4; Gate-4 CLEAN) — `id` is a **collision-free** deterministic encoding of the value (fixed-width UTF-16 hex), NOT a hash (audit caught a djb2 collision) and NOT `encodeURIComponent` (audit caught a lone-surrogate throw); PolishPanel maps values at the boundary, prompt layer + KeywordsCard unchanged. **WI-1 COMPLETE.** |
| WI-2 | foundational | **done (v0.6.5, PR #59)** — `src/lib/sync/types.ts` (SyncEntity/EntityType/PushOp/PushResult/PullResult/SyncError) + `src/lib/sync/guards.ts` hand-written boundary guards (no zod): isEntityType/isSyncEntity/isPullResult/isPushResult, with safe-integer rev/cursor + non-array payload + conflict-id-match validation. Extracted shared `isRecord` → `src/lib/guards.ts` (3 stores de-duped). tdd-guard scope += `src/lib/sync/**`. Gate-4 CLEAN (3-round Codex). |
| WI-3 | foundational | pure `mergeEntities` — server-rev-primary LWW + causal delete-wins + `{resolved,conflicts}`; table tests incl. clock-skew immunity, delete-then-readd, eviction-resurrection |
| WI-4 | foundational | **done (v0.6.7, PR #62)** — `SyncBackend` {pull/push/purge} + `createRestSyncBackend({baseUrl,token,fetch?,timeoutMs?})`; bearer auth, AbortController timeout (headers+body), guard-validated responses, `SyncError` mapping, never-throws `BackendResult`, push correlates results to op ids. Gate-4 CLEAN (2-round Codex). **Retry/backoff/queue NOT here** — layered by WI-6 (the queue owns drain/reconnect); WI-4 is a single bounded request (cleaner separation than the plan's original "timeout/backoff in WI-4" grouping). |
| WI-5 | behavioral | consent-gated migration. **WI-5a done (v0.6.8, PR #63):** pure `buildSeedFromLocal(snapshot)→PushOp[]` in `src/lib/sync/seed.ts` — flattens sessions into a session op + per-task ops (keyed by `sessionId`), term/keyword ops, all `baseRev:0` (idempotent re-seed); Gate-4 CLEAN (1 round). **Deferred to WI-7** (where the sync state machine + config store live): the idempotent seed-execution loop, reversible `disconnectSync`, explicit server-purge (`backend.purge()`), per-server seeded flag. |
| WI-6 | behavioral | offline queue + reconnect — optimistic local, idempotent drain, debounce, single-in-flight; **INERT when disabled** (zero listeners/timers — tested) |
| WI-7 | behavioral | sync orchestrator: stores ↔ pull/merge/push, per-entity-type rev cursors, opt-in gate, eviction-cap reconciliation |
| WI-8 | behavioral | `server/` package: Hono + SQLite, bearer auth, `/sync/changes` GET+POST atomic-rev UPSERT + conflict return, `DELETE /sync/data`, single-tenant; `:memory:` non-gating suite; Docker + TLS/Tailscale doc; server engines floor |
| WI-9 | **behavioral-ui** | account/connect-server (token paste) + sync-status (8 states) + privacy-at-connect copy + superseded-edit conflict surface + the sync error banners — **DESIGN LANDED & UNBLOCKED:** `dev-docs/designs/lucid-sync/` (PR #60, needs-design #53 closed); routed the #29-style claude.ai/design loop. Builds against that bundle after the headless engine (WI-3..WI-8). Surfaces: A status pill · B connect form + connecting · C connected/idle panel + disconnect zone · D per-state status cards · E conflict surface + disconnect dialog · F error banners |

WI-0→WI-8 are headless/server and buildable now; WI-9's design loop is complete (bundle committed at `dev-docs/designs/lucid-sync/`, PR #60) so WI-9 is unblocked and builds against it once the engine lands.

### Gate-2 implementation watchpoints (Codex re-review, 2026-06-16 — non-blocking, fold into the named WIs)

1. **Idempotent seed UX (WI-5):** a crash-mid-seed re-push returns `conflict` at the protocol level, but the
   client must treat "same id, same payload already present" as **idempotent success**, not surface a scary
   conflict. Reconcile silently when the server row equals the local intent.
2. **Atomic rev allocation (WI-8):** the spike uses an in-process JS counter; the real server MUST allocate
   `rev` + compare-and-update **atomically inside one SQLite transaction / a single guarded statement** (e.g.
   `INSERT … ON CONFLICT DO UPDATE … WHERE …` with the rev derived in-statement), never a restart-resettable
   JS counter. Test concurrent pushes.
3. **Conflict signal must not be swallowed (WI-3 + WI-7):** deferring the review UI is acceptable ONLY if the
   sync status clearly surfaces "conflict occurred / local edit superseded" and a test asserts the headless
   `conflicts` signal is propagated (not dropped) so the future UI can render it.

## Risks (top, from the adversarial review)

1. **Conflict ordering** — fixed to server-`rev`-primary; the Phase-0 skew probe must prove a +1h device can't
   silently overwrite (not just the equal-ts path).
2. **v1 silently loses same-entity divergent offline edits** — scoped honestly (Decision A); conflict signal
   surfaced for the future review UI.
3. **Persisted sync token** — a new long-lived-secret-in-browser decision (Decision B); documented, redacted, TLS-only.
4. **First backend** — breaks AGENTS.md's browser-only boundary; doc-sync in the same change; hermetic gate
   preserved by structural workspace scoping (not just assertion).
5. **Migration/identity duplication** — deterministic keyword ids + value-dedupe in seed/merge.

## Gate-2 note

This plan introduces new external dependencies (a server package: Hono + SQLite engine) → rule 47 Gate 2
**mandatory cross-model review** + rule 60 §4 new-dep check. Codex gave the high-level review; the adversarial
design workflow returned NEEDS_REVISION and this is the corrected design. Per the review's instruction, **re-run
a Codex Gate-2 specifically on the corrected server-`rev`-primary conflict-ordering proof** before Gate-3.

## Revision history

- **v1 (2026-06-16):** initial — from the self-host design workflow (option panel → synthesis → adversarial
  review), corrected for the review's 3 Critical + 4 High + 5 Medium + 4 Low findings.
- **Decisions A + B resolved (user, 2026-06-16):** A = ship v1 per-entity LWW + surfaced conflict signal
  (review UI deferred); B = persist the sync token.
- **Phase-0 spike PASSED (2026-06-16):** `dev-docs/grills/feature-9-sync/spike.mjs` — 6/6 invariants
  (node:sqlite UPSERT+monotonic rev; +1h-clock cannot silently overwrite; conflict-not-overwrite;
  idempotent crash-mid-seed; delete-then-readd converges; eviction-as-tombstone). The corrected
  server-`rev`-primary ordering is empirically validated.
- **Gate-2 CLEAN (Codex re-review, 2026-06-16): READY TO BUILD** — no remaining Critical/High; corrected
  ordering sound, other corrections adequate, v1 conflict scope reasonable. 3 non-blocking implementation
  watchpoints folded into WI-3/5/7/8 (above). #9 → PLANNED. Next: headless WIs WI-0→WI-8; WI-9 UI via the
  design loop.
