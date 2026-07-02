---
branch: fix/issue-221-starred-dedup-context
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-07-03
---

# Gate-4 audit — bug #9 (starred list showed the same word twice; dedup keyed on context)

Independent Claude auditor (read-only, diff-scoped, 70 lines). **ship-as-is, 0 open Critical/High/Medium.**

## Verified
- **Root cause resolved** — `sameContent` (`starredStore.ts`) + `matchesInput` (`StarButton.tsx`) now key on
  `kind · source · sourceLang · targetLang` (context dropped). Same word, two contexts → one entry, first wins
  (regression test asserts `toHaveLength(1)` + first-wins). `star()`'s no-op guard unchanged.
- **Mirrored** — both dedup sites omit context identically, so the StarButton pill state agrees with the store.
- **`context` field retained** — only the dedup KEY changed. `context` stays on `StarredItem`/`StarredInput`,
  spread into stored items, rendered on the detail "From" line (`StarredView.tsx:157-160`), and carried through
  sync seed (`seed.ts:87`) + reconstruct (`reconstruct.ts:96,109`, `isOptString`-validated). Data model + sync
  untouched.
- **No over-dedup** — the `it.each` "distinct" table still proves different word / direction / kind stay
  separate; only the context row (correctly) removed. No stale context-differentiation assertions remain.
- **lucid** — pure condition removal in two already-covered functions + one new store test; 100% gated coverage
  held; no `any`; `unstar`/first-wins semantics unchanged.

## Lows (accepted, intentional)
1. **Polysemy collapse** — two senses of one word (e.g. "bank" river vs money) now dedup to one entry (first
   wins). Intended per the bug + the "one entry per word + direction" policy; flag only if product later wants
   per-sense entries.
2. **Legacy duplicates** already in localStorage are NOT migrated/deleted — deliberate no-silent-delete; they
   persist until unstarred. Nothing reads/crashes on them.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** (2370/2370 stmts) + build. Pure-logic bug → the
RED→GREEN store test is the verify (fix-issue Phase 6a); post-merge CDP confirms the user-observable symptom.

## Verdict
ship-as-is.
