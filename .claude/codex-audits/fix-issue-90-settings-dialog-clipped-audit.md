---
branch: fix/issue-90-settings-dialog-clipped
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 1
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — bug #90 (provider Settings dialog content clipped)

**Root cause:** the shared shadcn `DialogContent` base (`src/components/ui/dialog.tsx:62`) ends with
`sm:max-w-lg` (512px). The three `DialogContent` callers passed an UNPREFIXED `max-w-[Npx]`; tailwind-merge
reconciles same-variant `max-w-*` but NOT the `sm:`-prefixed `sm:max-w-lg` against an unprefixed override —
so at ≥640px the `sm:max-w-lg` media-query rule won, the 880px-designed Settings dialog clamped to 512px,
and `overflow-hidden` sheared the right pane.

**Fix (className-only, 3 callers — rule 32: customize at the call site, not the generated primitive):**
- `src/components/workspace/SettingsDialog.tsx:101` — `max-w-[880px]` → `sm:max-w-[880px]` (the #90 fix)
- `src/components/sync/SyncSettingsDialog.tsx:36` — `max-w-[520px]` → `sm:max-w-[520px]` (latent sibling)
- `src/components/sync/DisconnectDialog.tsx:81` — `max-w-[420px]` → `sm:max-w-[420px]` (latent sibling)

Now the override is the same `sm:` variant as the base, so tailwind-merge keeps the caller's width and
drops `sm:max-w-lg`. Mobile (<640px) gains the base `max-w-[calc(100%-2rem)]` margin back (the old
unprefixed `max-w-[880px]` had defeated it → edge-to-edge). Shared `dialog.tsx` untouched.

## Auditor note (rule-47 fallback)
Codex quota exhausted (until ~Jun 18 11:38). Independent read-only Claude `auditor` subagent (rule-48
boundary). Fix authored + verified by the orchestrator.

## Round 1 — verdict: CLEAN (zero Critical/High/Medium; 1 Low — FIXED)

| # | sev | finding | disposition |
|---|---|---|---|
| L1 | Low | No committed regression test (rule 10-tdd marks bug fixes ALWAYS-test). The fix is a className variant swap; a future revert to the unprefixed form (or a tailwind-merge bump) would silently re-clip. | **FIXED** — added `SettingsDialog.test.tsx` "applies the 880px width as sm:max-w-[880px], dropping the base sm:max-w-lg (bug #90)": opens the dialog, asserts the rendered `[role=dialog]` className `toContain('sm:max-w-[880px]')` and `not.toContain('sm:max-w-lg')`. Tests the merged-class invariant the fix establishes (deterministic, not a brittle snapshot). |

Auditor confirmed: (1) the cascade fix is correct (twMerge keeps the same-`sm:`-variant caller width, drops
`sm:max-w-lg`); (2) the <640px change is an improvement (margin restored), not a regression; (3) grep
confirms exactly 3 `DialogContent` callers — completeness; (4) no over-reach (className + tracker only, no
`any`, files < 300, primitive untouched); (5) the CDP measurement (`dialogWidth: 880, clipped: false` at
1280px) directly exercises the fixed cascade, not coincidental.

## Verification
- **Empirical (browser, CDP):** drove the cached headless Chromium via the DevTools Protocol against the
  live dev build — opened the Settings dialog → `dialogWidth: 880, scrollW == clientW, clipped: false,
  closeButtonInsideRightEdge: true` at a 1280px viewport (vs the broken ~512px). Symptom gone.
- **Regression test:** `SettingsDialog.test.tsx` asserts the merged-class invariant (fails if reverted).
- **Gate:** `pnpm check:all` → 78 files / 1004 tests / 100%; lint + build green.

**Summary verdict: ship-as-is.** CLEAN; the single Low (missing regression test) is fixed.
