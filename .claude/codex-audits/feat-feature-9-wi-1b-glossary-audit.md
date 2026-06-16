---
branch: feat/feature-9-wi-1b-glossary
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #9 WI-1b (glossary envelope + cross-store migration hardening)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1a. Scope: the glossaryStore sync
envelope, PLUS a uniform malformed-entry hardening applied to BOTH store migrations (the glossary
audit revealed the crash path applies equally to sessionStore). Files:
`src/stores/glossaryStore.ts` + test, `src/stores/sessionStore.ts` + `sessionStore.test.ts` +
new `sessionStore.migration.test.ts`.

## Round 1 — verdict: NEEDS ATTENTION (1 Medium)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | glossaryStore.ts (migrate) | Medium | `isRecord(raw)` proves object-ness but not a valid term — `{}`/`{id:'g1'}` migrates to `{label: undefined}`, and `label` is `.toLowerCase()`'d in `addTerm`'s dedup + `.trim()`'d in `extractTerms`, so a malformed-but-object entry **crashes normal use** (distinct from the cosmetic NaN case) | **FIXED** — `typeof raw.id === 'string' && typeof raw.label === 'string'` guard; malformed term skipped |

Deltas accepted by Codex: `createdAt=updatedAt=0` legacy sentinel is "reasonable — deterministic,
keeps migration pure, no arithmetic/ordering on term timestamps"; duplicating the 1-line `isRecord`
across the two stores is "acceptable for now … defer extraction until the sync layer is the third
consumer."

**Cross-store realization:** the identical `.toLowerCase()` crash path exists in sessionStore
(`searchSessions` → `s.name.toLowerCase()` / `t.title.toLowerCase()`), which the WI-1a audit had
under-rated as scoped-Low because the `.toLowerCase()` path was never raised. Hardened sessionStore's
migration the same way in this WI (one coherent WI-1 migration concern).

## Round 2 — verdict: NEEDS ATTENTION (1 Low)

sessionStore migration rewritten to read fields directly from the validated `Record` (removed the
`SessionV1`/`TaskV1` cast-and-trust approach + the now-dead interfaces). Session entry skipped unless
`id`/`name` are strings and `createdAt` a number; task entry skipped unless `id`/`title`/`sourceText`/
`resultText` are strings, `kind ∈ {translate,polish}`, and `createdAt` a number — which also
eliminates the previously-accepted NaN-in-`updatedAt` residual. Table-driven tests assert each
malformed field skips that entry while a valid sibling survives.

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| R2-1 | sessionStore.test.ts | Low | test file now 314 lines, over the ~300 guideline | **FIXED** — extracted the persist-helper/migration matrix into a focused `sessionStore.migration.test.ts`; both files now < 170 lines |

Logic (round 2): "both migrations now guard top-level shape, entry shape, required string fields,
valid task `kind`, and numeric `createdAt` … no longer admit the `.toLowerCase()` / `.trim()`
poisoning cases. `SessionV1` / `TaskV1` removed cleanly; no dangling references."

## Round 3 — verdict: CLEAN

> "The split looks clean … no dead imports, dangling `SessionV1`/`TaskV1` references, duplicated test
> coverage, or missing migration cases … glossary/session migration guards still sound for the v1
> shape-poisoning cases. CLEAN."

Compliance: no `any`; all files < ~300 lines (largest 205); no vendor leak; no duplication beyond the
intentional 1-line `isRecord` (extraction deferred to WI-2). `pnpm check:all` green — 644 tests,
100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Also retroactively closed the
sessionStore shape-poisoning gap from WI-1a.
