---
branch: feat/feature-9-wi-9c-settings-ui
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 2
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-9c (Settings · Sync UI, design surfaces B/C/D/E)

The Settings · Sync surface. Six new components under `src/components/sync/`: `ConnectForm` (B — connect
card + ConnectingCard), `SyncStatusCard` (D — per-state top card), `ConnectedPanel` (C), `DisconnectDialog`
(E — two-choice modal), `ConflictCard` (E — superseded-edit), `SyncSettingsPanel` (composition, reads
`useSyncStore` + drives the injected `SyncController`), each with a `.test.tsx`; +~96 `sync.*` i18n keys.
Design-gated (rule 51) to `dev-docs/designs/lucid-sync`. Implemented by a fresh-context subagent, reviewed
+ fixed by the orchestrator (rule 48: a fidelity gap — the unwired ConnectingCard — was caught in review
and wired before round 1).

## Auditor note (rule-47 fallback)
Codex quota exhausted (until ~Jun 18 11:38). Both rounds used fresh independent read-only Claude `auditor`
subagents (rule-48 boundary). Author (subagent) ≠ auditor; fixes applied + gate-verified by the orchestrator.

## Round 1 — NEEDS WORK (zero Critical/High; 2 Medium + 5 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | Medium | design-C reassurance side notes ("Local copy is always kept…", "Ordering authority is the server rev…") were DROPPED, and their keys `sync.panel.localKeptNote`/`revAuthorityNote` left orphan. | **FIXED** — `SyncSettingsPanel` renders both notes in the connected view (🔒 solid card + "i" dashed card) using the now-wired keys; test added. |
| 2 | Medium | `SyncStatusCard` rendered a frozen `0 / {queuedCount}` progress literal (never advances; not a `t()` key) and declared an unused `CardView.progressKey`. | **FIXED** — removed the readout (the store has no pushed-so-far numerator, so a live `n/N` is unrepresentable; the syncing card shows only the "pushing {{n}} changes" detail) and deleted `progressKey`. |
| L1 | Low | `ConflictCard` "Copy my version" was a dead enabled no-op button. | **FIXED** — now `disabled` with a `title` explaining review/restore is deferred; accessible name preserved (no aria-label); test asserts `toBeDisabled()`. |
| L2 | Low | `DisconnectDialog` `role=radiogroup` had no accessible name. | **FIXED** — added `aria-label` tied to the dialog title. (Roving-tabindex arrow-keys left unimplemented — accepted Low; radios are Tab+click reachable.) |
| L3 | Low | the two zone disconnect buttons both opened the dialog with the safe "keep" default, discarding the erase intent. | **FIXED** — `DisconnectDialog` gained `initialErase`; `SyncSettingsPanel` tracks `eraseIntent` so "Disconnect & erase" pre-selects the erase radio (still requires explicit confirm); test asserts the pre-selection. |
| L4 | Low | erase-fail test encoded the discarded-intent quirk. | **FIXED** — tightened to open via the zone-erase button, assert the erase radio is pre-checked, then confirm. |
| L5 | Low | static superseded/kept conflict values vs the design's relative times/device names. | **ACCEPTED** — `SyncConflictInfo` carries only `{type,id}`; no store data exists for richer values. v1 simplification, not invention. |

Round-1 affirmed clean: token discipline (no hardcoded colors; all tokens resolve light+dark), i18n (every
string via `t()`), security (token shown only as …last4, never logged), a11y (aria-labels, masked token +
Show/Hide, real buttons + focus rings, DialogTitle/Description), selectors-not-destructured, no `any`, all
files < 300 lines, foundational-until-mounted.

## Round 2 — verdict: CLEAN

> "Both round-1 Mediums are resolved; all five Lows are resolved or soundly accepted. … no hardcoded
> colors; all referenced `sync.*` keys exist with no new orphans; the syncing branch renders cleanly after
> the `0/N` removal (`action: null` short-circuits); the `connecting` state is wired (ConnectForm →
> ConnectingCard, Cancel → disconnect({erase:false})). Zero open Critical/High/Medium. Verdict: CLEAN."

Post-fix: `pnpm check:all` → **76 files / 990 tests / 100%** on the gated tree (src/components is
behavior-tested, not coverage-gated by config); lint + build green. Server unaffected (excluded).

**Summary verdict: ship-as-is.** Round-2 CLEAN; 2 Mediums + 3 Lows fixed, 2 Lows accepted with rationale.
The Settings · Sync surface is complete (unmounted). Next: WI-9d (FINAL) — the error banners (surface F),
mounting the pill + panel, wiring `createSyncController`, and browser acceptance to close feature #9.
