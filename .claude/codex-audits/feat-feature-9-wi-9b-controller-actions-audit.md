---
branch: feat/feature-9-wi-9b-controller-actions
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 1
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-9b (sync controller action surface)

Two small additions to already-merged, audited HEADLESS concurrency code so the WI-9 UI has the full
action API the design needs. Files: `src/lib/sync/syncOrchestrator.ts` (added `sync()` — a manual
immediate trigger routed through the existing single-in-flight `requestDrain`), `src/lib/sync/syncController.ts`
(added `syncNow()` + changed `disconnect()` → `disconnect(opts?: { erase?: boolean })`, default `erase: true`
= backward-compatible purge; `erase: false` = the design's "Disconnect · keep server data"),
`src/lib/sync/syncController.test.ts` (+6 tests), `src/lib/sync/diff.ts` (doc-sync).

## Why
The committed design (`dev-docs/designs/lucid-sync`) has "Sync now"/"Retry now" buttons (no manual trigger
existed) and TWO disconnect modes — keep vs erase (`disconnect()` always purged). These close both gaps.

## Auditor note (rule-47 fallback)
Codex quota exhausted (until ~Jun 18 11:38). Fresh independent read-only Claude `auditor` subagent
(rule-48 boundary, concurrency-focused). Implemented + gate-verified by the orchestrator.

## Round 1 — verdict: CLEAN (zero Critical/High/Medium; 3 Low)

> "sync() routes through the identical requestDrain as every automatic trigger, inheriting single-in-flight
> coalescing + the !started/paused/offline guards — it cannot start a second concurrent cycle or lose a
> rerun; fire-and-forget matches the existing call sites (requestDrain never rejects). disconnect erase:false
> revert is complete (orchestrator stopped+nulled, queue reset, store reverted); the generation guard is
> intact in both modes (erase:false has no pre-check await → strictly safer). start/stop/requestDrain are
> byte-identical; sync() is purely additive. No `any`; both files < 300 lines. Zero Critical/High/Medium.
> Verdict: CLEAN."

| # | sev | finding | disposition |
|---|---|---|---|
| L1 | Low | `diff.ts` header (rule 22) still stated the unconditional invariant "Disconnect purges the server … a delete can't resurrect on reconnect" — `disconnect({erase:false})` invalidates it. | **FIXED** — header now distinguishes erase-mode (purges; no resurrection) from keep-mode (`erase:false` leaves server data → an offline delete CAN resurrect on the next reconnect re-seed+pull, a design-sanctioned v1 trade-off; cross-refs syncController.ts). |
| L2 | Low | no test for the new keep-mode reconnect path (`disconnect({erase:false})` → reconnect re-seeds against still-populated server data). | **FIXED** — added a test: connect → disconnect({erase:false}) → reconnect re-seeds the local data and `purge` is never called across the whole cycle. |
| L3 | Low | `syncNow()` guard-inheritance (paused/offline) untested at the controller layer (guards live in `requestDrain`, tested at the orchestrator layer — thoroughness, not correctness). | **FIXED** — added a test: `syncNow()` while offline issues no pull and marks status `offline`. |

Post-fix: `pnpm check:all` → **70 files / 946 tests / 100%** (stmts 1438, branches 954 — the new `sync()` +
`disconnect` erase-branch covered); lint + build green. Server unaffected (excluded).

**Summary verdict: ship-as-is.** Round-1 CLEAN (zero Critical/High/Medium); all 3 Lows fixed. The
controller action API is now complete for the UI: `{ connect, resume, syncNow, disconnect({erase}) }`.
Next: WI-9c (the Settings · Sync UI components).
