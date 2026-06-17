---
branch: feat/feature-9-wi-7b-vi-d5-orchestrator
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 4
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-vi-d-5 (the sync orchestrator lifecycle)

Codex (gpt-5.5, effort high, read-only), same thread. The integration crux: the live loop tying the
edit tracker + cycle primitive into a debounced, single-in-flight, polled, online/offline-aware,
opt-in loop. Files: NEW `src/lib/sync/syncOrchestrator.ts` + test; `src/lib/sync/runSyncCycle.ts` gains
a `shouldCommit` guard; NEW shared test harness `src/test/orchestratorHarness.ts`. The offline-status
behaviour took rounds 2-4 to fully close — each a correct, *converging* refinement (not a stuck
disagreement), so per the standing autonomous goal the loop continued past the nominal 3-round cap to a
clean verdict rather than escalating.

## Round 1 — NEEDS WORK (1 High + 1 Medium)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | an in-flight `runSyncCycle` commits AFTER stop()/disconnect — the await can't be fenced by the finally (which only blocks reruns), so a stale cycle resolving post-disconnect resurrects sync state. | **FIXED** — `runSyncCycle(backend, shouldCommit=()=>true)` checks `shouldCommit()` once after the awaited engine cycle, before ANY store write. The orchestrator passes `live = () => myEpoch === epoch && config !== null` (epoch bumped on start()/stop()), and also skips its own post-cycle bookkeeping when `!live()`. |
| 2 | Medium | same missing post-await liveness check for config-cleared / connectivity-flip mid-cycle. | **FIXED (config)** by the same `live` predicate; the connectivity half became round 2/3. |

## Round 2 — NEEDS WORK (High fixed; 1 Medium + 1 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | offline fires mid-cycle → `onConnectivity` sets 'offline', then the resuming successful cycle overwrites it to idle/conflict with no later event to self-correct. | **FIXED** — after a successful commit, re-check `isOnline()` and re-assert 'offline'. Data still committed + `lastSynced` stamped. |
| 2 | Low | `syncOrchestrator.test.ts` > 300 lines. | **FIXED** — extracted the shared harness to `src/test/orchestratorHarness.ts`; spec split into core + lifecycle describes (275 lines). |

## Round 3 — NEEDS WORK (1 Medium)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | the offline re-assert covered only idle/conflict; offline-mid-cycle + an `unreachable` result also overwrote 'offline'. Known navigator-offline should win over 'unreachable'. | **FIXED** — unified the re-assert: `if (status !== 'auth-error' && !isOnline()) setStatus('offline')` — covers idle/conflict/unreachable; auth-error keeps its (paused, server-was-reached) status. |

## Round 4 — verdict: CLEAN

> "No remaining issues found. … successful idle/conflict cycles still commit data and stamp
> lastSyncedAt, then restore offline if connectivity dropped; unreachable also becomes offline when
> navigator state says offline. Excluding auth-error is correct because a 401/403 means the server
> responded … The epoch/config guard remains sound: stale cycles after stop/disconnect/restart cannot
> commit or run post-cycle bookkeeping. Single-in-flight/rerun, auth pause, teardown, and default paths
> are unchanged. File sizes are under 300 lines … CLEAN"

## Design (final)

`createSyncOrchestrator(deps) → {start, stop}`. Triggers (edit-debounced, periodic poll, online, initial)
funnel into one single-in-flight `requestDrain` → `runSyncCycle`. Periodic poll is intentional (v1 must
receive other devices' changes without a local edit). auth-error pauses auto-retry (rule 65 §4);
unreachable keeps polling. epoch+config `shouldCommit` guard prevents stale post-disconnect commits.
Timing/connectivity injected for deterministic fake-timer tests; production uses window/navigator.

## Carried forward to WI-7b-vi-d-6

- seed-on-connect (`buildSeedFromLocal`) + reversible disconnect/purge (`backend.purge`), hooking
  around start()/stop(); then the app wires `createSyncOrchestrator` to the connect flow.

## Gate note (environmental)

The parallel-forks vitest pool hit `spawn EAGAIN` (OS process pressure, ~2871 procs — unrelated to this
code), causing partial runs that falsely looked green at a lower count. Validated reliably **sequentially**:
`vitest run --coverage --no-file-parallelism` → 67 files, **905 tests, 100% stmts/branches/funcs/lines**;
`pnpm lint` + `pnpm typecheck` + `pnpm build` all green.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium after 4 (converging) rounds.
