---
branch: feat/feature-9-wi-9-sync-ui
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 1
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-9a (sync status pill + status tokens)

The first slice of WI-9 (the sync UI). Design surface **A** — a compact header pill reflecting the
syncStore's 8-state status machine, click → Settings · Sync (mounted in WI-9c). Files: NEW
`src/components/sync/syncPillView.ts` (pure view-model) + `.test.ts`, `src/components/sync/SyncStatusPill.tsx`
+ `.test.tsx`; `src/index.css` (+5 status tokens, light + dark); `src/locales/en/translation.json`
(+`sync.status.*` ×8, `sync.detail.*` ×8, `sync.pill.aria`); plan-doc WI-9 slice plan + WI-8d-done marker.

## Auditor note (rule-47 fallback)

Codex quota exhausted (until ~Jun 18 11:38). Used a fresh independent read-only Claude `auditor` subagent
(separate context from the implementer — rule-48 boundary). Drafted + gate-verified by the orchestrator.

## Round 1 — verdict: CLEAN (zero Critical/High/Medium; 4 Low)

> "Every drawn Section-A state matches tone + indicator + label. `connecting` (absent from the design pill
> row) mapped to the design's own accent-spinner + 'Connecting…' is a reasonable non-inventive fill, not a
> rule-51 violation; `rate-limited` correctly has no pill (no store state). `syncPillView` switches all 8
> SyncStatus values (TS-exhaustive). All colors are tokens (one sanctioned shadow); the 5 new tokens exist
> in both `:root` and `.dark`. Every visible string is a `t()` key; all 17 keys exist. Selectors only, no
> destructuring. Real `<button>` + aria-label; indicators aria-hidden. No `any`; files 79/68/61/68 lines;
> component genuinely unmounted (expected dead-until-WI-9c). Zero Critical/High/Medium. Verdict: CLEAN."

| # | sev | finding | disposition |
|---|---|---|---|
| L1 | Low | synced **label** uses `--success` (= design `--ok`); the light design draws the label in `--ok-strong` (= `--success-hover`). | **ACCEPTED (rule 34 over literal fidelity).** `--success-hover` (#246b49) on the dark `--success-bg` (#16291e) fails AA — the design's own dark `--ok-strong`/`--ok-soft` pair is itself an AA failure. `--success` is the AA-safe lifted ink in both themes; rule 34 governs the dark value. Rationale recorded inline in the TONE map. |
| L2 | Low | local-only mono **detail** rendered at `--text-secondary`; design renders that detail fainter (`--t5`) than the label (`--t2`), losing the tonal split. | **FIXED** — TONE now carries a per-tone `detail` color; the grey `idle` tone's detail drops to `--text-tertiary` (≈ design `--t5`); colored tones tint the detail = label (matching the bundle's tinted details). |
| L3 | Low | pill shadow hardcoded `rgba(30,28,25,0.06)` (the sanctioned single-shadow exception); doesn't adapt in dark. | **FIXED** — replaced with the existing `--shadow-tab` token (`0 1px 2px rgba(30,28,25,0.08)` — matches the design's `0 1px 2px` subtle shadow). Removes the hardcoded value (token discipline). Dark-adaptive shadow tokens are a pre-existing codebase-wide gap (no lucid surface overrides shadows in `.dark`); out of scope for one pill. |
| L4 | Low | no component-level test for the `connecting` render (the one state absent from the design pill row → highest-risk mapping). | **FIXED** — added an RTL assertion: `setStatus('connecting')` → `getByText('Connecting…')`. |

Post-fix: `pnpm check:all` → **70 files / 940 tests / 100%** on the gated tree (src/providers + src/lib +
src/stores; src/components is behavior-tested, not coverage-gated by config); lint + build green. Server
unaffected (excluded).

**Summary verdict: ship-as-is.** Round-1 CLEAN (zero Critical/High/Medium); 3 Lows fixed, 1 accepted with
rationale. Next: WI-9b (the Settings · Sync surface — connect form + connected panel + per-state card +
disconnect dialog + conflict surface).
