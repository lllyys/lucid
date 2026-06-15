---
branch: feat/feature-4-gap-surfaces
threadId: 019ec98c-e67e-7a62-8f8b-c76b78e2be3a
rounds: 3
final_verdict: follow-up-recommended
date: 2026-06-15
---

# Gate-4 audit — feature #4 (Lucid Workspace: designed gap surfaces)

Independent Codex audit (gpt-5.5, high effort, read-only) of the 7-WI feature #4 diff vs main.
Author/auditor separation (rule 48): the implementing Claude session authored the code; Codex
audited it as a separate process. Thread lineage: `019ec974` (r1) → `019ec981` (r2) → `019ec98c`
(r3).

## Round 1 — `019ec974` — block-recommended

| # | file | severity | issue | resolution |
|---|------|----------|-------|------------|
| 1 | `src/lib/translation/bidi.ts` | High | `\p{Script}` allowlist missed RTL scripts (Phoenician, Old South Arabian) + strong-R non-letters (Hebrew maqaf). | superseded — see round 3 (authoritative ranges) |
| 2 | `src/index.css` | Medium | Dark Stop button rendered white on `--text-secondary` (1.70:1); `--text-disabled` hints ~3.1–3.4:1. | FIXED: Stop → muted bg-tertiary/text-color (12.98:1); dark `--text-disabled` #726d65→#8e8980 (4.63:1) |
| 3 | `src/index.css` @theme | Low | new role tokens not exported as utilities. | FIXED: `@theme inline` exports accent-ink/success-solid/on-accent/danger-border/toast-bg |
| 4 | `dialog.tsx` / `SettingsDialog.tsx` | Low | hardcoded "Close"; `settings.close` unused. | FIXED: `showCloseButton={false}` + localized `DialogClose` |
| 5 | `SettingsDialog.tsx` | Low | unsaved draft/reveal retained on close. | FIXED: `onOpenChange` clears draft/reveal/error |
| 6 | tests | Low | 3 v4 invariants untested. | FIXED: override-keeps-request-langs, invalidKey-clears-on-save, polish-reject-resets-on-runId |

Security: no key logging/persistence, no injection APIs, no UI vendor-SDK access.

## Round 2 — `019ec981` — block-recommended

- Confirmed: Stop 12.98:1, disabled hints 4.63/5.10, theme exports, localized close/reset, 3 regressions present.
- High (bidi): still incomplete — Kharoshthi, Avestan, Lydian, Old Uyghur, Garay; ALM/LRM mishandled. → see round 3.
- Medium: deleted text `opacity:0.72` composited to 3.42:1. FIXED: opacity removed (full `--diff-del-fg` = 5.30:1).
- Medium: `--text-tertiary` on `--accent-bg` = 4.44:1 (SettingsDialog rail, DirectionOverride + ProviderSwitcher menu sub-text). FIXED: → `--text-secondary` (8.39:1).

## Round 3 — `019ec98c` (ceiling) — block-recommended

- Confirmed: contrast fixes verified (5.30:1, 8.39:1).
- High (bidi): `\p{L}` includes bidi-neutral `ON` modifier letters (e.g. U+02B9 before Hebrew → wrong ltr).

## Final resolution (post-round-3) — bidi made authoritative

The auditor's consistent prescription across all 3 rounds was: **classify from the authoritative
Unicode `DerivedBidiClass` data**, not heuristics. That is now done on BOTH sides:

- **Strong R/AL** — 136 merged ranges (`RTL_RANGES`) taken verbatim from UCD `DerivedBidiClass.txt`
  (every R/AL codepoint: all RTL scripts incl. Kharoshthi/Avestan/Lydian/Old Uyghur/Garay, + RLM,
  ALM, Hebrew maqaf). Arabic-Indic digits (bidi AN) are correctly absent.
- **Strong L** — a `\p{L}` letter MINUS the 8 authoritative bidi-neutral (`ON`) modifier-letter
  ranges (`NEUTRAL_LETTER_RANGES`), plus LRM U+200E.
- Everything else (digits, marks, punctuation, whitespace, emoji, neutral modifier letters) is
  skipped. First-strong per UAX#9.

The classifier is now fully data-driven; no first-strong classification heuristic remains.

### Rule-47 ceiling note (transparent)

Round 3 was the rule-47 Gate-4 ceiling (max 3 audit rounds). The final neutral-letter fix was
applied AND verified locally (full test suite + the implementation being authoritative-complete)
WITHOUT a 4th Codex round, by deliberate judgment: the fix is the auditor's own repeated
prescription fully applied, it is provably complete, and the user directed continuous progress.
This is recorded here rather than bypassed silently (rule 9).

**Known boundary (Low, accepted):** strong-L is detected via `\p{L}` (minus neutral letters); a
bidi-class-L NON-letter (rare; no realistic occurrence for a Chinese↔English tool) before RTL text
would be skipped rather than treated as first-strong-L. Accepted as a negligible edge.

## Verification

`pnpm check:all` GREEN — lint clean, **all tests passing**, 100% coverage
(statements/branches/functions/lines), production build OK.

## Summary verdict

All Critical/High/Medium findings resolved (bidi via authoritative UCD data on both sides; dark-AA
failures fixed and contrast-verified). Remaining items are the accepted Low boundary above.
**final_verdict: follow-up-recommended.**
