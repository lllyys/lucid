---
branch: feat/feature-11-wi-1-autorun-hook
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — feature #11 WI-1 (useAutoRunDebounce hook + isAuto plumbing)

Independent separate-context Claude `auditor` (read-only, worktree); Codex quota-blocked (rule 48 via
subagent). Implemented in worktree `.claude/worktrees/feature-11`.

## Diff
- `src/hooks/useAutoRunDebounce.ts` (+ test) — debounced auto-run: schedule/cancel, IME hold + re-arm,
  fire-time runId re-validation, `pendingKey` CSS-ring restart, unmount cleanup.
- `src/stores/operationStore.ts` — `PanelOp.isAuto` captured once at run start, re-spread in every patch
  (streaming init / loop / terminal); abort+fail preserve `cur.isAuto`; reset/IDLE = false.
- `src/hooks/usePanelRun.ts` — `run(panel, request, isAuto=false)` → `ops.run(…, isAuto)`.
- Existing `PanelOp` test literals across 7 files updated for the additive `isAuto` field.

## Verdict: ship-as-is — 0 Critical / 0 High / 0 Medium (4 Low)

Auditor-verified: `isAuto` threading matches the Gate-2 C1/C2 contract (captured once, re-spread in all 3
run patches → no mid-stream flicker; abort/fail preserve, reset/idle false; usePanelRun passes it 4th,
defaults false → manual callers unaffected). Debounce logic sound: reset-on-reschedule, schedule-time
rejects (composing/<minChars/not-ready), fire-time runId re-validation, IME synchronous-`ref` guard +
compositionstart-hold + compositionend-rearm, unmount cleanup (StrictMode-safe). CSS ring via `pendingKey`
(no per-frame state). No key touched/logged; off-by-default deferred to WI-2. No `any`, no deps, files
<300 lines, getState-in-callback. All `PanelOp` literals updated (a miss would be a TS error — non-optional
field).

## Low findings
| # | finding | resolution |
|---|---|---|
| L1 | `src/hooks/**` is NOT in the coverage `include` (vite.config) → the hook's coverage isn't gate-enforced (the 10-case test is thorough regardless; operationStore IS gated + stays 100%). | Accepted — adding `src/hooks/**` to the coverage scope is a project-wide config change, out of this WI's scope. The hook is thoroughly tested. |
| L2 | `isComposing` returned by the hook but not in the plan's documented return shape (WI-2 will consume it for the "composing…" indicator). | **FIXED** — added `isComposing` to the plan's WI-1 return shape. |
| L3 | No positive test that abort/fail preserve `isAuto:true` (the AUTO-tag-survives-cancellation invariant WI-2 depends on; code correct + covered, but not pinned). | **FIXED** — added a test: an auto-triggered run aborted mid-stream keeps `isAuto:true`. |
| L4 | `minChars:0` test-seam edge would arm on whitespace (no caller uses it; default 1 matches the manual non-empty guard). | Accepted — latent, no caller; correct as written. |

`pnpm check:all` green (lint + typecheck + 100% gated coverage + build); 24 operationStore + 10 hook tests.
