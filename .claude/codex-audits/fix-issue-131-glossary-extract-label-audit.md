---
branch: fix/issue-131-glossary-extract-label
threadId: manual-fallback
rounds: 1
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — bug #6 (Glossary "Extract from current text" mislabeled)

Manual mini-audit (Codex quota-blocked; the change is a 2-line copy/i18n fix with no logic — a subagent
audit would be disproportionate). Author/auditor separation is moot for a pure label-string change.

## Fix
`src/locales/en/translation.json`: `glossary.extract` "Extract from current text" → **"Extract from this
session"**. `src/components/sidebar/GlossaryView.test.tsx`: the button-name matcher updated to the new label
(RED→GREEN — the existing click-extract test still exercises the behavior, now via the accurate name).

No code/logic change: `GlossaryView.extract()` already builds its text from the **active session's tasks**
(`active.tasks.map(tk => sourceText + resultText)`), so the behavior already matched the user's expectation;
only the label understated the session-wide scope.

## Manual mini-audit evidence
- **Files read:** `GlossaryView.tsx` (the extract handler — confirmed session-wide), `extractTerms.ts` (the
  heuristic — mines multi-word Capitalized phrases, all-caps acronyms, repeated ≥4-char tokens; works on real
  Latin technical text, e.g. "OpenWrt"/"Tailscale"/"PMTU"; CJK yields nothing — a documented v1 limitation, not
  this bug), `translation.json`, `GlossaryView.test.tsx`.
- **Symbols verified:** `glossary.extract` is the only key for this button; no other source/test referenced the
  old literal "Extract from current text" (grep clean).
- **Edge cases checked:** the extract heuristic is unchanged + still surfaces terms over a populated session
  (the audit's secondary concern — confirmed the heuristic is sound, not a 0-result bug); the relabel is a copy
  change to existing chrome (no committed glossary design bundle exists, so not rule-51 design-gated — a new
  surface isn't being invented).
- **Risks accepted:** none material — a label string + its test matcher.
- **Tests:** the existing GlossaryView click-extract test re-points at the new label (covers it); `pnpm
  check:all` green (lint + typecheck + 100% gated coverage + build).

## Verdict: ship-as-is — 0 Critical/High/Medium.
Verification: the RED→GREEN GlossaryView test (button found by the new name → extract → suggestion → add) IS
the verification for this copy fix; no browser pass needed (a `t()` key renders the new string).
