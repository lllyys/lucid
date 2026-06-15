# Feature #8 — Persist polish keywords across reloads

> **Status:** PLANNED (Gate 2 passed, v2 — READY TO BUILD) · GH: #33 · Size: **Small** (1 WI / 1 PR)
> Lifecycle per `.claude/rules/47-feature-workflow.md`.

## Problem

Sessions, task history, and the glossary already persist (feature #3 — `lucid.sessions`,
`lucid.glossary`). The **polish keyword set** (`polishKeywordsStore`) is the one piece that
does not: it is plain in-memory `create<…>` state and resets on every reload. A user who curates
domain keywords for a polish run loses them when they refresh. This is a consistency gap, not a
new capability — the persistence mechanism already exists and is proven.

## Resolved design decision — global, not per-session

Triage raised "global vs per-session keyword sets." **Decision: global** (one keyword set shared
across sessions), for three reasons:

1. **Matches the glossary's model.** The sidebar already frames saved terms as global
   (`sidebar.glossaryEmpty`: "Saved domain terms live here, synced across sessions"). Keywords are
   injected from the glossary via "use"; a global keyword set is the natural mirror.
2. **No cross-feature coupling.** Per-session would require `polishKeywordsStore` to read the active
   session id from `sessionStore` — a cross-feature import that AGENTS.md explicitly discourages
   ("keep features local; avoid cross-feature imports unless truly shared").
3. **Smallest correct change.** Global persistence is a pure additive wrap of the existing store with
   the same middleware feature #3 already uses; no new data model, no migration of existing data.

Per-session keyword sets remain a possible future feature; if requested, it would be a new feature
row (keyed by session id), not a change to this one.

## Surface area (file-by-file)

### Modified

- **`src/stores/polishKeywordsStore.ts`** — wrap the existing store creator in zustand `persist`,
  exactly mirroring `glossaryStore.ts`:
  - `import { persist, createJSONStorage } from 'zustand/middleware'`
  - `import { createSafeJSONStorage } from '@/lib/storage/safeJSONStorage'`
  - `import { notifyStorageFull } from '@/lib/storage/quotaNotice'`
  - `const PERSIST_VERSION = 1`
  - Add exported pure helpers (mirroring glossary, so they're unit-testable for coverage):
    - `migrateKeywords(persisted: unknown, version: number): unknown` → `version === PERSIST_VERSION ? persisted : undefined`
    - `partializeKeywords(s: PolishKeywordsState): Pick<PolishKeywordsState, 'keywords'>` → `{ keywords: s.keywords }`
  - `create<PolishKeywordsState>()(persist((set, get) => ({ …existing actions… }), { name: 'lucid.keywords', version: PERSIST_VERSION, storage: createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })), migrate: migrateKeywords, partialize: partializeKeywords }))`
  - The three existing actions (`addKeyword`, `removeKeyword`, `reset`) and the `keywords: string[]`
    shape are **unchanged** — persist is transparent to callers.
  - Update the header `Purpose:` comment (rule 22): it currently says "Working state — NOT persisted
    (unlike the saved glossary)." → it now IS persisted (`lucid.keywords`, crash-proof via
    safeJSONStorage), global across sessions.

- **`src/stores/polishKeywordsStore.test.ts`** — add tests (see Test catalogue). Isolate exactly as
  `glossaryStore.test.ts` does: `reset()` in `beforeEach` only. **Do NOT add `localStorage.clear()`** —
  `window.localStorage` is **undefined** in this vitest/jsdom setup (it runs without
  `--localstorage-file`; `safeJSONStorage.defaultBackend()` returns `null`), so `localStorage.clear()`
  would throw and there is no persisted-blob cross-leak to guard against in the first place.

### Files OUT of scope

- `sessionStore.ts` / `glossaryStore.ts` — unchanged (no per-session coupling; no shared change).
- `PolishPanel.tsx` / `GlossaryView.tsx` — callers read `keywords` and call `addKeyword`/`removeKeyword`
  unchanged; persistence is transparent. **No UI change → rule 51 does not apply** (no new visible
  surface; the keyword chips UI already exists and is designed).
- `safeJSONStorage.ts` / `quotaNotice.ts` — reused as-is, not modified.
- No new i18n keys (the storage-full notice `error.storageFull` already exists from feature #3).

## Prior art / project precedent

- **Direct precedent: `glossaryStore.ts` (feature #3, WI-2).** Same middleware, same
  `createSafeJSONStorage({ onWriteError: notifyStorageFull })`, same `version: 1` + `migrate`/
  `partialize` shape. This plan copies that template onto one more store. The crash-proof storage
  (corrupt/oversized/quota/SSR → safe defaults) is already proven and tested for the glossary.
- **Rejected alternative — per-session keyword sets:** rejected above (cross-feature coupling,
  larger change, not requested).
- **Rejected alternative — a bespoke localStorage read/write in the store:** rejected; it would
  duplicate the crash-proofing safeJSONStorage already centralizes (corrupt blob, quota, SSR guards).

## Work-item sequencing

**WI-1 — persist `polishKeywordsStore`** (behavioral; the only WI; ~30-line diff + tests). Wrap with
`persist` + `safeJSONStorage`, export `migrateKeywords`/`partializeKeywords`, update the header
comment, add persistence tests. One PR. Since it is both the first and final WI, its merge brings
the feature to `DONE` and its Gate-5b acceptance pass flips it to `VERIFIED`.

## Test catalogue (`src/stores/polishKeywordsStore.test.ts`)

Existing behavior tests (init empty, add, trim/de-dupe, remove, reset) stay green. Add exactly the
pure-helper tests glossary uses (these alone drive `glossaryStore` to 100% — verified):

- `migrateKeywords` discards an older version (`migrateKeywords({keywords:[]}, 0) === undefined`) — covers the `version !== 1` branch.
- `migrateKeywords` passes through the current version (`migrateKeywords(state, 1) === state`) — covers the `version === 1` branch.
- `partializeKeywords` persists only `keywords` (no actions in the persisted slice).

**No localStorage round-trip test.** `window.localStorage` is undefined in this test env (confirmed:
`glossaryStore.test.ts` never touches it and still reaches 100%; `safeJSONStorage.defaultBackend()`
returns `null` so `persist`'s read/write paths are no-ops in tests). A write-through or rehydrate test
keyed on `localStorage.getItem('lucid.keywords')` is therefore impossible as well as unnecessary:
- The crash-proof storage round-trip (corrupt/oversized/quota/SSR → safe defaults) is already covered
  by `safeJSONStorage`'s own tests — do not duplicate.
- `migrate` and `partialize` reach 100% via the three pure-helper tests above (at runtime `migrate`
  is never called against a null backend, so the direct call is the only coverage driver; `partialize`
  is exercised both by the direct test and by action-driven writes).
- The **actual "keywords survive reload" behavior** is verified end-to-end at **Gate 5** (real browser
  with a real localStorage), not in unit tests — see Verification below.

Determinism: no live APIs; no live localStorage in unit tests (rule 66 §4 / 10-tdd).

## Risks + mitigations

- **Test isolation.** *Mitigation:* `reset()` in `beforeEach`, exactly as `glossaryStore.test.ts` does.
  There is no localStorage backend in tests, so there is no persisted-blob cross-leak to guard against
  (an earlier draft's `localStorage.clear()` would have thrown — removed after Gate-2 round 1).
- **Coverage on the new branches.** `migrateKeywords` must be hit with both `version === 1` and
  `version !== 1`; `partializeKeywords` directly. *Mitigation:* the three pure-helper tests above
  (glossary does exactly this to reach 100%).
- **Persistence behavior is not unit-tested.** Because jsdom has no localStorage here, the round-trip
  can't be asserted in unit tests. *Mitigation:* Gate 5 browser verification (reload → keywords
  survive) is the behavioral evidence; the storage mechanism itself is covered by `safeJSONStorage`'s
  tests.
- **StrictMode double-rehydrate.** `persist` rehydrates once; the PolishPanel keywords effect was made
  StrictMode-robust in feature #3. *Mitigation:* no effect change here — persist is store-internal;
  confirm PolishPanel tests stay green.

## Backward compat

- **First run after ship:** no `lucid.keywords` blob exists → `persist` rehydrates to `{keywords: []}`
  (today's behavior). No user sees a change except that keywords now survive reload.
- **Older/forward versions:** `migrateKeywords` returns `undefined` for any non-1 version → store falls
  back to empty, never crashes on a stale/foreign blob.
- **No existing data to migrate** (the store was never persisted before).

## Verification (Gate 5)

WI-1 is behavioral (changes persistence), and the localStorage round-trip is **not** unit-testable in
this jsdom env — so the "keywords survive reload" behavior is verified end-to-end in a real browser:
add a keyword in the Polish panel → reload the page → the keyword is still present. As the final WI
this also requires a full acceptance pass recorded in `dev-docs/verification/feature-8-<YYYYMMDD>.md`
(per `dev-docs/verification/SCHEMA.md`) before the row flips to `VERIFIED`. Playwright is the automation
path if its browser binary is available; otherwise a manual `pnpm dev` reload check with the steps
recorded. (The crash-proof storage edge cases — corrupt/oversized/quota — stay covered by
`safeJSONStorage`'s unit tests; they are not re-verified in the browser.)

## Definition of Done

- `persist` wraps `polishKeywordsStore` with `name: 'lucid.keywords'`, `version: 1`, safeJSONStorage,
  `migrate`, `partialize`.
- Keywords survive a reload (verified end-to-end at Gate 5).
- `pnpm check:all` green at 100% coverage; existing keyword behavior unchanged.
- Header comment corrected (rule 22). No new UI, no new i18n keys.

## Revision history

- **v1 (2026-06-15):** initial plan. Gate 2 audit pending.
- **v2 (2026-06-15):** Gate-2 round-1 fixes (independent subagent audit, `manual-fallback` — Codex
  unavailable). Resolved 1 Critical + 2 High + 1 Medium, all from one false premise — that
  `window.localStorage` exists in the test env. It does **not** (jsdom without `--localstorage-file`;
  `glossaryStore.test.ts` confirms 100% with no localStorage access). Fixes: (a) removed the
  `localStorage.clear()` beforeEach line (would throw); (b) removed the write-through and rehydrate
  localStorage tests (impossible + unnecessary) — test catalogue now matches glossary's pure-helper-only
  approach; (c) removed the false "cross-leak" risk; (d) made explicit that persistence behavior is
  verified at Gate 5 (browser reload), not in unit tests. Model-assumption spine (exports/signatures/
  store shape/global-vs-per-session/rule-51-N/A/WI tiering) confirmed correct. **Verdict after v2:
  READY TO BUILD** (zero open Critical/High/Medium).
