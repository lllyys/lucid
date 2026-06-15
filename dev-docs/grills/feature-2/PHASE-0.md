# Feature #2 — Phase 0 spike (rule 60 §7)

**Date:** 2026-06-15 · **Result: PASS** · Probe: `diff-segmenter-probe.mjs`
(`node dev-docs/grills/feature-2/diff-segmenter-probe.mjs`)

Validates the WI-4/WI-5 (`detectDirection`, `wordDiff`) external-library assumptions **before** WI-1
commits, per rule 60 §7. `diff` (jsdiff) `9.0.0` installed; no `@types/diff` (v9 ships its own).

## Assumptions validated

- `diffArrays` accepts **pre-tokenized arrays** and returns `Change[]` (`{ value: [], added, removed }`);
  classifies add/del correctly; **whole-accept reproduces the result string exactly** by joining the
  non-removed segments (the `applyDiff(allIds)` invariant — no re-derivation needed).
- `diffArrays(a, b, { maxEditLength })` returns **`undefined`** when the edit distance exceeds the
  bound → the coarse whole-replace fallback trigger works.
- `intlSegmenter` is a **`diffWords`** option, **not** `diffArrays` (confirmed). The design is correct
  to tokenize manually (opaque spans + `Intl.Segmenter`) and feed arrays to `diffArrays`.
- `Intl.Segmenter` (`granularity: 'word'`) is **deterministic within a runtime**, handles mixed-script
  (round-trips losslessly), and is **grapheme-safe** (emoji / combining marks / ZWJ sequences
  round-trip). Tests must still assert structural invariants, not exact ICU boundaries (rule 66 §4),
  and inject a deterministic stub for CJK fixtures — ICU boundaries can differ across Node/Chrome
  versions even though they are stable within one runtime.

## Performance → pinned diff threshold (resolves D3-1 / D5-1)

| Input | ~Tokens | `diffArrays` time |
|---|---|---|
| 10k chars | ~2.5k | **35 ms** |
| 50k chars | ~11k | **671 ms** |
| 100k chars | ~22k | **2627 ms** |

The diff runs on demand (the Result → Compare toggle), not per-keystroke, but 2.6s at 100k chars would
freeze the main thread. **Decision: `createWordDiff` does a char preflight — fine diff up to a
`maxChars` of `30_000` (a few hundred ms worst case), and a coarse whole-replace (one `del` original +
one `add` result) above it**, with `maxEditLength` as a secondary guard inside the fine path. `MAX_INPUT_CHARS`
(prompt module) is `100_000`, so inputs between 30k–100k are diffable-as-coarse, never main-thread-blocking.
A Web Worker is deferred (not needed at this threshold; revisit if per-hunk accept lands).

## Verdict

PASS — no blocking unknowns. WI-1 may proceed; WI-5 implements the tokenizer + `maxChars=30_000`
preflight + `maxEditLength` fallback against this evidence.
