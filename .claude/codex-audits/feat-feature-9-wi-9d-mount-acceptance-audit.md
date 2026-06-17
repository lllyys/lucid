---
branch: feat/feature-9-wi-9d-mount-acceptance
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 2
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-9d (sync UI app-shell wiring + error banners)

The FINAL slice — wires the sync UI into the app shell. NEW: `src/components/sync/SyncErrorBanner.tsx`
(+test, design surface F), `src/components/sync/SyncSettingsDialog.tsx` (+test, controlled shadcn Dialog;
pill = trigger, SyncSettingsPanel = content). EDITED: `Workspace.tsx` (owns `controller =
useMemo(createSyncController)`, `syncSettingsOpen` state, `resume()` on mount, mounts the banner between
toolbar and `<main>`), `WorkspaceHeader.tsx` (props + mounts the dialog before SettingsDialog),
`SyncStatusPill.tsx` (forwardRef + button-props spread so it works as a Radix `asChild` trigger),
`src/locales/en/translation.json` (+`error.sync*`, `sync.banner.*`, `sync.dialog.*`).

## Auditor note (rule-47 fallback)
Codex quota exhausted (until ~Jun 18 11:38). Both rounds = fresh independent read-only Claude `auditor`
subagents (rule-48 boundary, integration-focused). Implemented by a subagent; reviewed + fixed +
gate-verified by the orchestrator.

## Round 1 — NEEDS WORK (1 High; 3 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | `SyncStatusPill` (plain function component, no ref forwarding) used as `<DialogTrigger asChild><SyncStatusPill/></DialogTrigger>` — Radix Slot's composed ref was dropped, so focus did NOT return to the pill on dialog close (WCAG) and React 19 logged a "function components cannot be given refs" warning (silent — the test setup doesn't fail on console.error). | **FIXED** — `SyncStatusPill` is now `forwardRef<HTMLButtonElement>` with `ref={ref}` on the `<button>` (before the `{...buttonRest}` spread, so it can't be clobbered). Added a deterministic ref test (`createRef` → `ref.current instanceof HTMLButtonElement`). Round-2 confirmed: focus-return works, warning gone, plumbing intact, backward-compatible (standalone `onOpenSettings` still fires). |
| L1 | Low | `error.syncUnreachable`/`syncAuth`/`syncConflict` referenced only in a `types.ts` comment + design label, not a runtime `t()` (the banner uses `sync.banner.*`). | **ACCEPTED** — these are the rules-65 §4 / 66 §4 canonical localized sync-error keys (the design-F header names them); they back the documented transport-failure→localized-UI mapping while the banner renders the design's richer title+body. Well-formed, em-dash spacing correct. Intentional, not an accidental orphan. |
| L2 | Low | the design draws a 4th "rate-limited" banner; not implemented. | **ACCEPTED** — the 8-state `SyncStatus` has no `rate-limit` state; wiring a banner to a state the store can't enter would be self-designed UI (rule 51). The design groups rate-limit without a distinct drawn banner. |
| L3 | Low | banner body uses generic "your sync server" vs the design's literal placeholder URL. | **ACCEPTED** — the real server URL varies and isn't a banner prop; a literal placeholder would mislead. |

## Round 2 — verdict: CLEAN

> "The round-1 High (asChild ref-forwarding) is correctly fixed … the ref reaches the DOM node; prop
> plumbing order is safe (`ref` before the spread, `onClick`/`ref` destructured out of `buttonRest`);
> backward-compat intact (named export, standalone use); `forwardRef` is the right call for React 19 +
> Radix Slot 1.2.x; the ref test is deterministic. All three Lows are soundly accepted. Controller
> lifecycle sound — `launch()` calls `orchestrator?.stop()` first, so a StrictMode double-`resume()`
> doesn't leak an orchestrator. Banner renders only for unreachable/auth-error/conflict. No new/unresolved
> issues. Verdict: CLEAN."

Post-fix: `pnpm check:all` → **78 files / 1003 tests / 100%** on the gated tree (src/components is
behavior-tested, not coverage-gated); lint + build green. Server unaffected (excluded).

**Summary verdict: ship-as-is.** Round-2 CLEAN; 1 High fixed, 3 Lows accepted with rationale. This slice
mounts the sync UI + wires the controller (resume-on-mount) — the LAST implementation WI of feature #9.
Remaining: Gate-5 acceptance (client↔server round-trip + browser smoke), the evidence file, the row flip
to VERIFIED, and the GH #45 closure.
