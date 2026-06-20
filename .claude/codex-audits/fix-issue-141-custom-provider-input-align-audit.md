---
branch: fix/issue-141-custom-provider-input-align
threadId: manual-fallback
rounds: 1
final_verdict: ship-as-is
date: 2026-06-20
---

# Audit — bug #7 (custom-provider MODEL/API-KEY input alignment)

Codex unavailable (quota); manual mini-audit per rule 47 manual-fallback. The change is a single
Tailwind class addition; the audit dimensions reduce to layout correctness + rule compliance.

## Change
`src/components/workspace/settings/CustomProviderForm.tsx:129` — added `items-end` to the MODEL +
API KEY flex row (now `flex flex-wrap items-end gap-3`) + an explanatory comment. No logic, no new
imports, no behavior change.

## Manual audit evidence
- **Files read:** `CustomProviderForm.tsx` (the row + surrounding form), `CredentialFields.tsx` /
  `ModelControl.tsx` (the two columns), the design bundle `dev-docs/designs/lucid-custom-providers/...dc.html`.
- **Symbols/intent verified:** the design bundle's model/key row uses `align-items:flex-end` — the fix
  restores that committed spec (rule-51 exempt: existing designed surface, restore-to-spec; rule-30
  incremental adjustment, no token/color added).
- **Edge cases checked:** narrow viewport (`flex-wrap` still stacks the columns — `items-end` only
  affects same-row items, so the responsive stack is unaffected); long wrapping API-KEY label (the
  case that caused the bug — now the inputs share a baseline); the two boxes have slightly different
  heights (MODEL `py-2.5` vs API-KEY `py-1` + embedded Show button) → `items-end` aligns their bottoms
  (the visible baseline), residual top delta ~5px is the height difference, not a regression.
- **Security / provider-layer / i18n:** none touched (no key handling, no vendor call, no strings).
- **lucid compliance:** no `any`; file unchanged in size class (<300 lines); CSS-only → no test
  required (rule 10); no new dependency.
- **Tests:** none added (CSS-only). `pnpm check:all` green (lint + typecheck + coverage + build).

## Verification
Headless-Chromium CDP, fresh-DB server (Settings → + Add custom provider, 2600px viewport): the form's
MODEL and API KEY inputs render side-by-side with the box **bottoms aligned** (top delta 5px from the
box-height difference), down from the prior full-line offset. See bug #7 row in `docs/bugs.md`.

## Verdict
ship-as-is — 0 Critical/High/Medium. A spec-restoring CSS alignment fix.
