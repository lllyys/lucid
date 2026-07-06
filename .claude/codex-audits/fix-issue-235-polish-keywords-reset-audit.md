---
branch: fix/issue-235-polish-keywords-reset
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-07-06
---

# Gate-4 audit — bug #11 (polish result flashes then disappears; keywords-change effect reset on a reference change)

Independent Claude auditor (read-only, diff-scoped, 81 lines). **ship-as-is, 0 open Critical/High/Medium.**

## Verified
- **Root cause** — the keyword-change effect (`PolishPanel.tsx`) now keys on `keywordsKey =
  JSON.stringify(keywords.map(k=>k.value))` (a value key) with `[keywordsKey]` as the dep, instead of the
  keywords array **reference**. (a) A sync-reconcile re-set (fresh array, identical values) → identical key →
  the effect doesn't even re-run (Object.is dep equality) → **no false reset** (bug fixed). (b) A real
  add/remove/edit → different key → resets + `armPolish` (invalidation preserved). (c) No StrictMode spurious
  reset (`prevKeywordsKey` inits to the first key). (d) `JSON.stringify` of a `string[]` is unambiguous — no
  false collision (safer than the sibling `useAutoRecordTask` `join(',')` key, which has a theoretical one).
- **No-regression** — the reset+re-arm body is unchanged; `armPolish`/`buildPolishRequest` remain fresh
  closures; the `[keywords]`→`[keywordsKey]` dep drops no needed trigger (keywordsKey derives from keywords);
  no stray `prevKeywords` reference remains (grep-confirmed).
- **Tests** — a same-content re-set (a populated set re-applied as a new array) while polish is `done` → op
  stays `done` (the RED→GREEN guard — fails under the old ref compare); a real keyword change → op `idle`
  (invalidation preserved). Both drive a real polish via `smartProvider` + mutate the real store (no stub).
- **lucid** — no `any`; cheap JSON key; PolishPanel back to 300 lines; pure component logic, no store/persist
  change, not design-gated.

## Gate
`pnpm check:all`: lint + typecheck + 100% root gated coverage + build. Pure component-logic bug → the RED→GREEN
PolishPanel test at the effect boundary (real stores) is the verification (verification-exception — a browser
polish needs a live provider key which is in-memory-only + impractical to seed in CDP).

## Verdict
ship-as-is.
