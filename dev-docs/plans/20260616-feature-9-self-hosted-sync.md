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
| WI-6 | behavioral | offline queue + reconnect. **WI-6a done (v0.6.9, PR #64):** pure `src/lib/sync/queue.ts` — `PushQueue` Map<id,{op,seq}> with dedup-by-id collapse + **seq-based `ack`** (a mid-flight edit is never lost; verified by audit under single-in-flight). Gate-4 CLEAN (1 round). **Deferred to WI-7:** the async drain loop, debounce, online/offline listeners, single-in-flight enforcement, INERT-when-disabled wiring. |
| WI-7 | behavioral | sync orchestrator. **WI-7a done (v0.6.10, PR #65):** `src/stores/syncStore.ts` — the config/state seam the orchestrator drives + the UI reads; 8-state status machine (matches the design), config/cursor/seeded persisted (sanitizing migrate), counts/queuedCount/lastConflict transient. **Token PERSISTED** (documented rule-65-§5 exception: reload-surviving background sync, TLS-only, single-tenant; never logged). Gate-4 CLEAN (2-round). **WI-7b sliced bottom-up.** **WI-7b-i done (v0.6.11, PR #66):** pure `collectLocal(snapshot, revs)→SyncEntity[]` (merge input; shares `flattenLocal` with `buildSeedFromLocal`). **WI-7b-ii done (v0.6.13, PR #68):** validated sync→domain reconstructors `src/lib/sync/reconstruct.ts` (`entityToSession/Task/Term/Keyword`, payload-validated incl. safe-int timestamps + keyword `id===keywordId(value)`); extracted shared `isNonNegInt`→`src/lib/guards.ts` + pure `keywordId`→`src/lib/keywordId.ts` (so reconstruct stays side-effect-free). Gate-4 CLEAN (3 rounds). **WI-7b-iii done (v0.6.14, PR #69):** pure `reconcileStores(current,resolved)` (two-pass apply: re-nest tasks, incremental upsert, delete-wins on the envelope id even for empty-payload tombstones); Gate-4 CLEAN (2 rounds). **WI-7b-iv done (v0.6.15, PR #70):** pure-async `syncPull` (pull→collectLocal→merge→reconcile→monotonic cursor + conflicts; no separate rev map — pending baseRevs come from the queue); Gate-4 CLEAN (3 rounds, caught cursor-regression + spread-overflow). **WI-7b-v done (v0.6.16, PR #71):** pure-async `syncPush` — per-entry outcome (`pushed[]`: applied+new-rev, or conflict tied to its QueueEntry); Gate-4 CLEAN (2 rounds, caught: applied rev is the next baseRev; conflict must ack-gate vs mid-push edits). **The engine (WI-7b-vi) sliced. WI-7b-vi-a done (v0.6.17, PR #72):** the PERSISTED per-id rev map added to `syncStore` (`revs: Record<string,number>` + `setRevs` merge action; reset by connect/disconnect/reset). `PERSIST_VERSION` 1→2; `migrateSync` is now purely the cross-version upgrade path (confirmed in zustand 5.0.14 that `migrate` runs ONLY on a version mismatch) — it preserves only a valid `config` and forces a full idempotent re-sync (`cursor:0, seeded:false, revs:{}`), because a bare `cursor` without a matching rev map is NOT self-healing (an incremental pull never rebuilds the missing revs → the next edit false-conflicts). Gate-4 CLEAN (2 rounds, caught the non-self-healing default). **WI-7b-vi-b done (v0.6.18, PR #73):** REVISED `syncPull` — now takes the FULL rev map + a separate `pending` set (was a single `pendingBaseRevs` map) and returns `revUpdates: Record<string,number>` (the resolved set's revs). Feeding `collectLocal` the full map means a resolved local-kept entity carries its true last-synced rev, so `revUpdates` can't regress an unchanged entity to 0 (which would false-conflict a future edit). Gate-4 CLEAN (1 round). **WI-7b-vi-c done (v0.6.19, PR #74):** `runCycle` (`src/lib/sync/cycle.ts`) — the engine combining one pull + one push. Pull-first (idempotent), push the pending edits the pull didn't supersede, ack-gated application of push results against the LIVE queue, and a commit set `apply` (= resolved minus still-dirty ids + push-conflict winners) the lifecycle reconciles against the LIVE store — so a mid-cycle edit is never clobbered. Still-dirty ids are pinned to their queued baseRev (invariant preserved) and stale conflicts for them dropped. `syncPull` additively returns raw `resolved`. Gate-4 CLEAN (3 rounds: caught the stale-snapshot clobber, then the rev/conflict dirty-filter gap + the uncommitted push-conflict winner). **The lifecycle (WI-7b-vi-d) sliced. WI-7b-vi-d-1 done (v0.6.20, PR #75):** the PERSISTED offline push-queue store `src/stores/syncQueueStore.ts` — holds the queue as a JSON-friendly `QueueEntry[]` (the pure `PushQueue` Map reconstructed at the boundary; collapse/seq/ack delegated to `queue.ts`), so offline edits survive a reload. Sanitized in `merge` (not migrate — runs on every hydration), de-duping a corrupt blob by id keeping the highest `seq`. Added `isPushOp` guard (`baseRev` NonNegInt vs server `rev` PosInt). Gate-4 CLEAN (2 rounds, caught first-vs-highest-seq dedupe). **WI-7b-vi-d-2 done (v0.6.21, PR #76):** the delta projection `src/lib/sync/diff.ts` — pure `diffToOps(prev, next, revs, now)` turns two consecutive local snapshots into PushOps (adds/content-changes at the entity's last-synced baseRev; SYNTHESIZED tombstones for vanished LIVE entities, since the stores hard-delete; GC of an already-tombstoned vanish → no op). Change detection compares updatedAt + deletedAt + payload (payload catches same-ms edits; updatedAt catches envelope-only bumps like addTask touching its session). Exported `flattenLocal`/`FlatEntity` from seed.ts for reuse. Gate-4 CLEAN (2 rounds, caught the dropped envelope-only change). **WI-7b-vi-d-3 done (v0.6.22, PR #77):** the impure cycle boundary — `src/lib/sync/applyGuard.ts` (synchronous echo guard `isApplyingSync`/`runSuppressed`) + `src/lib/sync/runSyncCycle.ts` (reads live cursor/revs/snapshot/queue → `runCycle` → commits: reconcile `apply` into the domain stores UNDER the echo guard, `setRevs`/`setCursor`/`ack(startEntries)`/`setQueuedCount`/`setCounts`, `recordConflict` projected to `{type,id}`, `setStatus`; transport error → `auth-error`/`unreachable`). Tested with real stores + a mock backend. Gate-4 CLEAN (2 rounds, caught the full-Conflict leak into lastConflict). **WI-7b-vi-d-4 done (v0.6.23, PR #78):** the edit tracker `src/lib/sync/editTracker.ts` — `startEditTracking({now, onEdit})` subscribes one handler to all three domain stores, diffs the current snapshot against a held baseline (`diffToOps`), enqueues the ops, `setQueuedCount`, and notifies `onEdit`. ECHO GUARD: a sync-applied commit (written under `runSuppressed`) fires the handler with `isApplyingSync()` true → it advances the baseline WITHOUT re-enqueuing, so the next real edit diffs only its own delta. Gate-4 CLEAN (1 round). **WI-7b-vi-d-5 done (v0.6.24, PR #79):** the orchestrator lifecycle — `createSyncOrchestrator(deps) → {start, stop}` (`src/lib/sync/syncOrchestrator.ts`). Triggers (edit-debounced, periodic poll, online event, initial-on-connect) funnel into ONE single-in-flight `requestDrain` → `runSyncCycle`. Periodic poll is intentional (v1 must receive other devices' changes without a local edit). auth-error pauses auto-retry (rule 65 §4); unreachable keeps polling; offline skips draining + sets the status, and a mid-cycle connectivity drop re-asserts 'offline' over a committed idle/conflict OR an 'unreachable' (navigator-offline wins; data still committed). An EPOCH+config `shouldCommit` guard (added to `runSyncCycle`) prevents a cycle whose I/O resolves after stop()/disconnect/restart from committing stale state. Timing/connectivity injected for deterministic fake-timer tests (shared harness `src/test/orchestratorHarness.ts`); production uses window/navigator. Gate-4 CLEAN (4 converging rounds: stale-commit-after-stop High → offline-idle-overwrite → offline-unreachable-overwrite → clean). **WI-7b-vi-d-6 done (v0.6.25, PR #80):** the headless sync controller `src/lib/sync/syncController.ts` — `createSyncController(deps) → {connect, resume, disconnect}`, the top-level API WI-9 will drive. `connect(config)` sets config + CLEARS the persisted queue + SEEDS current local data (`buildSeedFromLocal`, expect-new baseRev 0) + starts the orchestrator; `resume()` re-attaches on reload WITHOUT re-seeding or clearing the queue; `disconnect()` stops + best-effort `backend.purge()` + clears queue + reverts to local-only, returning whether the purge succeeded (so the UI can surface a failed erase). A controller `generation` guard stops a slow disconnect-purge's async tail from tearing down a racing connect. **WI-7b (the headless orchestrator) is COMPLETE.** Gate-4: round-1 Codex 2 High + 1 Medium (stale-queue-on-connect, disconnect-tail race, silent-purge-failure) all fixed; round-2 an independent Claude `auditor` subagent (Codex quota-exhausted until Jun 18) → CLEAN, 2 Low accepted. **Still to build:** WI-8 (the self-hosted server package — Hono+SQLite), then WI-9 (the sync UI per `dev-docs/designs/lucid-sync`), then wire `createSyncController` to the app's connect flow. |
| WI-8 | behavioral | `server/` package: Hono + SQLite, bearer auth, `/sync/changes` GET+POST atomic-rev UPSERT + conflict return, `DELETE /sync/data`, single-tenant; `:memory:` non-gating suite; Docker + TLS/Tailscale doc; server engines floor. **Sliced. WI-8a done (v0.6.26, PR #81):** the `server/` workspace package scaffold (`@lucid/server`, Hono ^4.12.25, node:sqlite via Node≥22, node-env vitest, strict tsconfig incl. `noUncheckedIndexedAccess`) + EXCLUDED from the root hermetic gate (eslint ignores `server/**`; root vitest `test.include` scoped to `src/**`; server not in root tsconfig refs) — root `check:all` stays 68 files/917 tests/100% with no server deps. Hono vetted (rule 60 §4: 45.6M dl/wk, 4.5y old). Gate-4 manual (config-only; Codex quota-blocked). **WI-8b done (v0.6.27, PR #82):** the SQLite store `server/src/{db,types}.ts` — `createSyncStore(':memory:'|path)` → `applyOps`/`changesSince`/`purge`/`close` on `node:sqlite`. `applyOps` runs ONE `BEGIN IMMEDIATE` transaction; per op: no row OR `current.rev===op.baseRev` → apply (allocate `MAX(rev)+1` per applied op → monotonic, first=1) ; else → conflict (return the authoritative entity, row untouched). It VALIDATES each op (assertValidOp) before the txn — a malformed op (bad type / non-object payload / negative-or-fractional updatedAt/deletedAt/baseRev) throws → batch rejected → WI-8c maps to 400 (closes the round-1 Medium: the store is the untrusted boundary and must never persist/re-emit a value the client's `isSyncEntity` guard rejects). `changesSince(since)` = rows `rev>since` ASC + `maxRev` (or `since` if empty). 28 server tests; root gate still 68/917 (server excluded). Gate-4: round-1 Claude auditor 1 Medium (fixed) → round-2 CLEAN, 3 Low accepted. **WI-8c done (v0.6.28, PR #83):** the Hono HTTP layer `server/src/app.ts` — `createApp({store, token}) → Hono`. Constant-time bearer auth (SHA-256-digest + `timingSafeEqual` → no value/length leak; fail-closed on all routes; empty-token guard); `GET /sync/changes?since` → 200 PullResult / 400 on a bad cursor; `POST /sync/changes` (JSON PushOp[]) → 200 PushResult[] / 400 on non-array|invalid-JSON|malformed-op; `DELETE /sync/data` → 204; `onError` → generic 500. Error→status matches the client contract (401→auth, 4xx→badRequest, 5xx→unreachable). The store throws a tagged `InvalidOpError` (added to db.ts) so the POST catch maps malformed-op→400 but RE-THROWS an internal SQLite fault → 500 (retryable). 57 server tests; root gate still 68/917. Gate-4: round-1 1 Medium (broad POST catch) + 2 Low (fixed) → round-2 CLEAN. **WI-8d done (v0.6.29, PR #84):** the serve entry `server/src/index.ts` — pure `createServerConfig(env)` (SYNC_TOKEN required + preserved verbatim, no default; PORT 1–65535; MAX_BODY_BYTES strict-positive; DB_PATH durable default, never `:memory:`) + integration-only `main()` serving via `@hono/node-server`; realpath+pathToFileURL entry guard (runs only when executed directly, symlink-safe, never on test import). `hono/body-limit` on POST → 413 (default 5 MiB, injectable). `server/Dockerfile` + `.dockerignore`: two-stage node:24-slim, pnpm pinned via `corepack prepare`/`packageManager` (deterministic build), flag-free node:sqlite (engines `>=24`), `/data` volume. `server/tsconfig.build.json`: build emits production files only. `dev-docs/sync-server.md` deploy doc (token, Docker, TLS via Caddy/Tailscale, plaintext-volume trust boundary), linked from dev-docs/README.md. 82 server tests; root gate still 68/917. Gate-4: round-1 1 High (Docker pnpm non-reproducible) + 4 Low → High + 3 Low fixed / 1 Low accepted; round-2 CLEAN. **WI-8 (the entire self-hosted server) is COMPLETE.** Remaining: WI-9 (the sync UI per `dev-docs/designs/lucid-sync` + wiring `createSyncController`). |
| WI-9 | **behavioral-ui** | account/connect-server (token paste) + sync-status (8 states) + privacy-at-connect copy + superseded-edit conflict surface + the sync error banners — **DESIGN LANDED & UNBLOCKED:** `dev-docs/designs/lucid-sync/` (PR #60, needs-design #53 closed); routed the #29-style claude.ai/design loop. Builds against that bundle after the headless engine (WI-3..WI-8). Surfaces: A status pill · B connect form + connecting · C connected/idle panel + disconnect zone · D per-state status cards · E conflict surface + disconnect dialog · F error banners |

WI-0→WI-8 are headless/server and buildable now; WI-9's design loop is complete (bundle committed at `dev-docs/designs/lucid-sync/`, PR #60) so WI-9 is unblocked and builds against it once the engine lands.

### WI-9 slice plan (the final WI — the sync UI; design-gated to `dev-docs/designs/lucid-sync/`)

Sliced into three PRs (cohesive surfaces; each TDD + Gate-4 + bump + PR + merge):

- **WI-9a — status tokens + status pill (surface A).** Add the design's missing status tokens to `src/index.css` (light+dark): `--warning-bg`/`--warning-border` (warn surfaces — lucid only had `--warning` text), `--success-border` (=design `--ok-conn`, the connected-green border), `--dot-idle`, `--accent-dash`. Pure `syncPillView(state, now)` view-model (→ tone + i18n keys + detail vars; table-tested over all 8 states) + `SyncStatusPill` component (reads `useSyncStore` via selectors, renders dot/spinner/⚠ + label + detail). i18n `sync.status.*`. **Foundational tier** (presentational, unit-tested; mounted in WI-9c).
- **WI-9b — Settings·Sync surface (B+C+D+E).** `ConnectForm` (B: server-URL + token + show/hide + opt-in callout + data-scope grid + persisted-token note + Connect/Stay-local), connecting state, `ConnectedPanel` (C: synced status card + server row + counts + disconnect zone), `SyncStatusCard` (D: per-state top card), `DisconnectDialog` (E: two-choice + erase), `ConflictCard` (E: superseded-edit surface), composed into `SyncSettingsPanel`, wired to `useSyncStore` + an injected `createSyncController` (connect/disconnect). Each file <300 lines. Unit-tested (RTL). **Foundational-until-mounted.**
- **WI-9c — error banners (F) + MOUNT + wiring + final acceptance.** `SyncErrorBanner` (F: syncUnreachable/syncAuth/syncConflict). Mount the pill in `WorkspaceToolbar`, the `SyncSettingsPanel` in a dialog opened from the pill/header, banners near the action area. Instantiate one `createSyncController`; call `resume()` on app mount; pass connect/disconnect to the UI. **Behavioral tier** — browser acceptance (run local server + app E2E: connect→edit→reload/2nd-tab→sync; conflict/offline), evidence file, flip `docs/features.md` #9 → DONE then VERIFIED, close GH #45.

Design→token mapping: design `--accent`/`--ok`/`--ok-soft`/`--ok-strong`/`--danger`/`--danger-soft`/`--danger-border`/`--accent-tint`/`--accent-border`/`--accent-ink` already exist as lucid `--accent-primary`/`--success`/`--success-bg`/`--success-hover`/`--error-color`/`--error-bg`/`--danger-border`/`--accent-subtle`/`--accent-border`/`--accent-ink`. Only the 5 tokens above are added.

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
