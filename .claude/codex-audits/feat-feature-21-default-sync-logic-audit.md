---
branch: feat/feature-21-default-sync-logic
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-28
---

# Gate-4 audit — feature #21 WI-1+WI-2 (headless auto-sync eligibility + consent-gated state)

Independent Claude auditor (read-only, diff-scoped, 563-line diff). Against the Gate-2-PASSED plan v2.
**ship-as-is, 0 open Critical/High/Medium.**

## Verified (all Gate-2 decisions built correctly)
- **H1 probe** — `detectAutoSyncEligibility({ pull })` awaits `pull(0)` and returns `result.ok` (validated
  `BackendResult`), never a bare HTTP status: token-free `?since=0` 200 is the only `ok:true` path (kills the
  400 false-negative); an SPA-fallback HTML 200 fails `isPullResult` → `badRequest` → ineligible (kills the
  false-positive). Tests: ok/auth/badRequest/unreachable/other.
- **M2 durability** — `autoSyncPrompt` is a sibling default in `create()`, NOT in `INITIAL`, so
  `disconnect`/`reset` (`set({...INITIAL})`) preserve it while clearing the transient `showAutoPrompt` (which
  IS in INITIAL). Tested both.
- **M3/L2 persistence** — `autoSyncPrompt` added to `partializeSync`'s `Pick<>` + return; `showAutoPrompt`
  excluded (transient); `migrateSync` carries it via the `isAutoSyncPrompt` literal-guard (valid→carry,
  corrupt/absent→`'unseen'`); no `PERSIST_VERSION` bump.
- **M4 race** — `maybeAutoConnect` re-reads `getState()` AFTER the awaited probe; surfaces the prompt only when
  still `config===null && autoSyncPrompt==='unseen'`. Two race tests (manual connect / decline mid-probe).
- **L3 probe backend** — built via `createBackend({ serverUrl: window.location.origin, token: '' })` (a local
  probe, never the active backend); test asserts the call args.
- **No silent connect / no app wiring** — `maybeAutoConnect` only sets `showAutoPrompt`; `acceptAutoSync` →
  `connectSingleOrigin`+`'accepted'`; `declineAutoSync` → `'declined'`, no connect. Nothing calls these outside
  the controller + tests (no `Workspace.tsx` wiring — deferred to WI-3). **Zero app-behavior change.**
- **lucid / coverage** — no `any` (guard uses `unknown`+narrow cast), no vendor import, files <300; gated dirs
  (`src/lib/sync`, `src/stores`) 100% with non-contrived branch coverage; the SyncSettings test-stub updates are
  mechanical type-fixes (interface grew), not weakened tests.

## Findings (both Low — accepted)
- **Low (accepted):** a create-default assertion in `syncStore.test.ts` is mildly order-fragile (the
  `beforeEach(reset())` preserves `autoSyncPrompt` by M2 design, so the default check holds only as the first
  test). Documented in-code; harmless. Optional hardening deferred.
- **Low (accepted, WI-3 concern):** the probe passes no `AbortSignal` (relies on the REST backend's 15s
  timeout). Fine headless; WI-3 should thread an `AbortSignal` when it wires `maybeAutoConnect` into the load
  effect (cancel on unmount/navigation).

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; 1628 tests. No app wiring → no behavior
change (WI-3, the consent prompt UI, is design-gated → needs-design #177). Verification: WI-1/WI-2 are
foundational/headless → unit tests + audit sufficient (no browser verify); the feature turns on at WI-3.

## Verdict
ship-as-is.
