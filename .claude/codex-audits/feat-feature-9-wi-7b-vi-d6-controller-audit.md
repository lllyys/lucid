---
branch: feat/feature-9-wi-7b-vi-d6-controller
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff (round 1, Codex) / independent-claude-auditor (round 2, Codex quota-blocked)
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-d-6 (the headless sync controller)

The capstone of the orchestrator: `createSyncController(deps) → { connect, resume, disconnect }` — the
top-level API the WI-9 UI will drive. Composes `createSyncOrchestrator` (vi-d-5), `buildSeedFromLocal`,
`createRestSyncBackend`, and the sync stores. Files: NEW `src/lib/sync/syncController.ts` + test; a
test-only harness fix (`src/test/orchestratorHarness.ts` — `okBackend`/`errBackend` `purge` now returns a
real `{ok:true,value:undefined}`).

## Auditor note (rule-47 fallback)

Round 1 ran on **Codex** (gpt-5.5, high, read-only, thread `019ecfac…`) and found 2 High + 1 Medium.
Before round 2, the Codex/ChatGPT usage quota was exhausted ("hit your usage limit … try again Jun 18th
11:38 AM") — a genuine outage. Per rule 47's manual/alternative-fallback clause, round 2 used a **fresh
independent read-only Claude `auditor` subagent** (a different context from the implementer, preserving
the rule-48 author/auditor boundary). This is the documented fallback when the primary Codex auditor is
unavailable; remaining slices will use the same boundary until the Codex quota resets.

## Round 1 — verdict: NEEDS WORK (2 High + 1 Medium) — Codex

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | `connect()` didn't clear the persisted queue — stale ops (esp. tombstones, or ops for a different server) would push to the new server. | **FIXED** — `connect()` now `useSyncStore.connect(config)` → `useSyncQueueStore.reset()` → `launch()` (seed fresh). `resume()` does NOT clear the queue (its un-pushed edits belong to the same server). |
| 2 | High | `disconnect()`'s async tail (after `await purge()`) could race a `connect()` and tear down the NEW session — the orchestrator epoch guard is per-orchestrator and can't see this controller-level race. | **FIXED** — a controller `generation` counter, bumped in `launch()` and at the top of `disconnect()` (captured as `myGen`); the post-purge local reset runs only `if (generation === myGen)`. |
| 3 | Medium | silently ignoring a failed purge breaks the resurrection-prevention invariant + the user's erase intent. | **FIXED** — `disconnect()` returns `Promise<boolean>` (purge success); a failed purge still resets locally but returns `false` so the UI can warn/retry. Caveat documented in the header. |

## Round 2 — verdict: CLEAN — independent Claude auditor

Confirmed all three fixes correct + complete, with explicit tracing:
- **Generation guard** — walked 5 race scenarios (plain disconnect; connect-during-purge; two concurrent
  disconnects; disconnect→resume→disconnect; connect→immediate-disconnect): no lost-reset, no
  double-reset, the right session survives, local state consistent in every path.
- **Queue split** — connect-clears / resume-keeps is the correct fresh-server-vs-reload distinction.
- **Seed vs edit-tracker** — seed enqueues BEFORE `orchestrator.start()` inits the tracker baseline
  (= current snapshot); zustand `subscribe` doesn't fire on registration, and the queue is id-keyed
  (collapses), so no double-enqueue even under a mid-window edit.
- **Failed-purge + reconnect** — re-seed at `baseRev 0` UPSERTs (no duplication); the one real limitation
  (offline-delete resurrection on a failed purge) is exactly why the purge boolean is surfaced —
  documented, not a new bug.
- **Harness change** — `{ok:true,value:undefined}` matches `BackendResult<void>` and the real
  `createRestSyncBackend.purge` (DELETE `/sync/data`, validate=null → `{ok:true}`); faithful, masks nothing.
- **lucid compliance** — no `any`; 108 lines (<300); no vendor leak (all access via `SyncBackend`); token
  never logged; `src/lib/sync → @/stores` import direction consistent with the sibling orchestrator files.

### Low findings — accepted with rationale (non-blocking)

- **L1 (concurrent disconnect optimistic `true`)**: if two `disconnect()` calls overlap, the second sees
  `backend === undefined` (the first nulled it before its await) → skips purge → returns `true` even if
  the first's real purge failed. The local reset still runs exactly once (generation-gated) and the FIRST
  caller gets the truthful result. **Accepted**: the WI-9 UI is a single disconnect button — two
  concurrent disconnects is unreachable in practice; local state stays consistent. A strict fix (re-entrant
  disconnect awaits the in-flight purge) is deferred as not worth the added state for an unreachable path.
- **L2 (`snapshot()` DRY)**: the 3-line store-read helper is duplicated in editTracker/runSyncCycle/
  controller. **Accepted**: extracting it would couple modules for marginal gain.

`pnpm check:all` green — lint + typecheck + build; 917 tests / 68 files / 100% stmts/branches/funcs/lines
(sequential run; a parallel-forks spawn-EAGAIN from transient OS process pressure is environmental).

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium; 2 Low accepted with rationale.
