# Feature #12 — Persist provider configuration across reloads (keys stay in-memory)

- **Status:** PLANNED (Gate 2 pending)
- **GH:** #95
- **Tracker row:** `docs/features.md` #12 (Medium)
- **Slug:** persist-provider-config

## Problem

`src/stores/providerStore.ts` is the **only** Zustand store with no `persist` middleware — every field
is in memory, so a reload resets `vendor → 'anthropic'`, `models → defaults`, and `baseUrl → ''`. A user
who configured a Custom endpoint (or picked a non-default model, or selected a provider) must
reconfigure it every session. API keys being in memory is **intentional and must stay so** (rule 65 §5;
`safeJSONStorage`'s own header documents "the API key … lives only in the in-memory providerStore"). But
the **non-secret** config — active vendor, per-vendor model, custom base URL — has no persistence, and
that capability was simply never built. This addresses the "the custom provider can't persist" report
(2026-06-18) — confirmed NOT a sync-server issue: sync persists workspace data, not provider config.

## Surface area (file-by-file)

### `src/stores/providerStore.ts` (modified — the only production file)
Wrap the existing `create<ProviderState>(...)` in `persist(...)` (zustand/middleware), mirroring
`glossaryStore`/`sessionStore`/`polishKeywordsStore`. Add three exported, independently-testable pure
helpers + the persist config:

- `const PERSIST_VERSION = 1` — first persisted version for this store.
- `type PersistedProvider = Pick<ProviderState, 'vendor' | 'models' | 'baseUrl'>` — the **allowlist** of
  persisted fields. **NEVER** `apiKey`, `apiKeys`, `model`, or `testResults`.
- `export function partializeProvider(s: ProviderState): PersistedProvider` →
  `{ vendor: s.vendor, models: s.models, baseUrl: s.baseUrl }`. This is the **load-bearing §5
  guarantee**: keys are structurally excluded from what's written to disk. `model` is derived (not
  persisted) to avoid drift with `models`; `apiKeys`/`testResults` are transient.
- `export function migrateProvider(persisted: unknown, version: number): unknown` — returns `persisted`
  when `version === PERSIST_VERSION`, else `undefined` (→ defaults). No older provider-persist data has
  ever existed, so there is no v0→v1 backfill; this exists for forward-compat + symmetry with the other
  stores.
- `export function mergeProvider(persisted: unknown, current: ProviderState): ProviderState` — the
  corruption-safe rehydrate merge:
  - non-object `persisted` → return `current` (defaults).
  - `vendor`: use `persisted.vendor` only if it `isVendorImplemented(...)`, else keep `current.vendor`
    (`'anthropic'`). Guards a persisted vendor that was removed/renamed.
  - `models`: start from `current.models` (a complete `Record<Vendor,string>`), overlay each
    `persisted.models[v]` that is a non-empty string for a known `Vendor` (skip-bad-fields; one corrupt
    entry never discards the rest).
  - `baseUrl`: `persisted.baseUrl` if it is a string, else `current.baseUrl`.
  - **Re-derive the mirror**: `model = models[vendor]` (keeps the denormalized active-vendor mirror in
    sync after rehydrate). `models` is overlaid onto `current.models` (a complete `Record<Vendor,string>`),
    so `models[vendor]` is always a defined string.
  - **Explicit return shape (preserves the store ACTIONS):** `return { ...current, vendor, model, models,
    baseUrl }`. Spreading `current` carries every action (`setVendor`/`setModel`/`setApiKey`/
    `setBaseUrl`/`clearKey`/`setTestResult`/`isReady`/`reset`) **and** `apiKey`/`apiKeys`/`testResults`
    (the in-memory/fresh fields) through unchanged — keys never come back from storage; test results are
    fresh per session. Only the four validated/derived fields are overridden. (Omitting the `...current`
    spread would drop the actions and produce an invalid `ProviderState` — the load-bearing point of
    Gate-2 MEDIUM-2.)
  - **migrate → merge flow:** `merge` runs on EVERY hydration; `migrate` runs only on a version mismatch.
    When `migrateProvider` returns `undefined` (tampered version), zustand still calls
    `mergeProvider(undefined, current)`, which the "non-object `persisted` → return `current`" branch
    handles — so `merge` must never assume well-formed input.
- persist options: `{ name: 'lucid.provider', version: PERSIST_VERSION, storage:
  createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull })), partialize:
  partializeProvider, migrate: migrateProvider, merge: mergeProvider }`.

Imports added: `persist, createJSONStorage` from `zustand/middleware`; `createSafeJSONStorage` from
`@/lib/storage/safeJSONStorage`; `notifyStorageFull` from `@/lib/storage/quotaNotice`.

### Files OUT of scope
- **No component/UI change.** The Settings dialog, provider switcher, and credential fields already
  render; persisting the underlying store state changes no visible surface (→ **not rule-51 gated**, no
  new surface or state). The only observable delta is "config survives reload".
- `src/lib/storage/safeJSONStorage.ts`, `quotaNotice.ts` — reused unchanged.
- `apiKey`/key-handling code paths — untouched; keys stay in-memory.

## Prior art / project precedent / rejected alternatives
- **Precedent (persist shape):** feature #8 (`20260615-feature-8-persist-keywords.md`),
  `glossaryStore`, and `sessionStore` use this `persist` + `createSafeJSONStorage` +
  `version`/`migrate`/`partialize` shape. `glossaryStore.test.ts` validates the pure helpers
  (`partializeGlossary`, `migrateGlossary`) directly — we follow that.
- **Precedent (custom `merge` that preserves actions):** `glossaryStore`/`sessionStore` rely on
  zustand's DEFAULT shallow merge and define no custom `merge` — they are NOT the model for our merge.
  The real precedent is **`src/stores/syncQueueStore.ts:62`** — `return { ...current,
  entries: sanitizeQueueEntries(persisted) }` — whose test (`syncQueueStore.test.ts:103`) asserts
  `typeof merged.enqueue === 'function'` to prove the actions survive. `mergeProvider` is structurally
  identical (`{ ...current, vendor, model, models, baseUrl }`), and we add the same actions-preserved
  assertion.
- **Rejected — persist `model`/`apiKeys` too:** persisting `model` duplicates `models[vendor]` (drift
  risk → derive it); persisting `apiKeys` violates rule 65 §5 (security) — explicitly excluded.
- **Rejected — `onRehydrateStorage` to fix the mirror:** a custom `merge` is synchronous (the store is
  correct on first read) and easier to unit-test than an async rehydrate callback.

## Work-item sequencing
- **WI-1 (final, behavioral, ~1 small PR):** add `persist` + the three pure helpers to `providerStore.ts`
  + the test suite. Single store file; no UI. This single WI completes the feature → **minor** bump
  (0.7.3 → 0.8.0) per rule 40.

## Test catalogue — `src/stores/providerStore.test.ts` (extend the existing 187-line suite)
A new `describe('persist', …)` block testing the pure helpers + rehydrate behavior:
- `partializeProvider` returns exactly `['vendor','models','baseUrl']` — and **NOT** `apiKey`/`apiKeys`/
  `model`/`testResults` (the §5 guard, asserted on `Object.keys`).
- round-trip: a state with `vendor:'custom'`, a custom `baseUrl`, a non-default `models.custom` →
  `partialize` → `merge(partialized, freshInitial)` restores vendor/baseUrl/models and re-derives
  `model === models['custom']`.
- **keys never rehydrate:** even if a (hand-crafted) persisted blob contains `apiKeys`/`apiKey`,
  `mergeProvider` ignores them → `apiKey === ''`, `apiKeys` all empty.
- **actions preserved** (Gate-2 MEDIUM-2): after `mergeProvider`, `typeof merged.setVendor ===
  'function'` and at least one other action (e.g. `reset`) — proves the `...current` spread carries the
  actions (mirrors `syncQueueStore.test.ts:103`).
- unimplemented persisted `vendor` (e.g. `'mistral'`) → falls back to `'anthropic'`, `model` re-derived.
- **keyless implemented vendor** (the most common real rehydrate): persisted `vendor:'openai'` +
  non-default `models.openai`, no key → after merge `vendor==='openai'`, `model===models.openai`,
  `apiKey===''`, `isReady()===false` (panel correctly shows "needs key").
- **partial `models` overlay**: a persisted blob with only `models.custom` set → missing vendors keep
  their `current` defaults, the present one overrides (overlay onto complete defaults, not replace).
- **`baseUrl` restored regardless of active vendor** (intentional — switching back to custom keeps the
  URL): persisted `vendor:'anthropic'` + a custom `baseUrl` → `baseUrl` restored, harmlessly ignored by
  the named vendor.
- `migrate`-returns-`undefined` (tampered version) still flows through `merge(undefined, current)` →
  defaults, no throw.
- corrupt/wrong-shape blobs: non-object → defaults; `models` non-record or with non-string entries →
  bad entries skipped, good ones kept; non-string `baseUrl` → default. No throw.
- `migrateProvider`: current version → passthrough; any other version → `undefined`.
- existing providerStore tests still pass unchanged (reset/setVendor/setModel/etc.).

Test isolation: clear `localStorage` (or use a fresh backend) + `useProviderStore.getState().reset()` in
`beforeEach`, matching the glossary suite, so persist writes don't leak between tests.

## Risks + mitigations
- **Leaking an API key to disk (critical):** mitigated by the explicit `partialize` allowlist
  (`{vendor,models,baseUrl}` only) + a dedicated `Object.keys` test + a "keys never rehydrate" test.
- **Mirror desync** (`model` ≠ `models[vendor]` after reload): `mergeProvider` re-derives `model`.
- **Corrupt blob crashes boot:** `createSafeJSONStorage` discards corrupt/oversized JSON (→ defaults);
  `mergeProvider` skip-bad-fields on well-formed-but-wrong-shape data.
- **Test-pollution from the persist middleware** in jsdom: clear storage in `beforeEach`.

## Backward compat
No provider config has ever been persisted, so there is no legacy blob to migrate — first load after
this ships simply finds nothing and uses defaults, then persists going forward. Keys remain in-memory
exactly as before (no behavior change for the secret path). Older app builds ignore the new
`lucid.provider` localStorage key.

## Revision history
- 2026-06-18 v1 — initial plan (Gate 1).
- 2026-06-18 v2 — Gate 2 audit (independent Claude auditor, round 1; Codex quota-blocked). Verdict
  NEEDS REVISION → all findings resolved in v2:
  - **MEDIUM-1** (wrong precedent): re-pointed the custom-`merge` precedent from `glossaryStore`
    (default merge) to `syncQueueStore.ts:62` (`{ ...current, … }`). Fixed.
  - **MEDIUM-2** (merge must preserve actions): made `mergeProvider`'s return shape explicit
    (`{ ...current, vendor, model, models, baseUrl }`) + added an actions-preserved test. Fixed.
  - **LOW** ×4: migrate→merge flow stated; added keyless-implemented-vendor, partial-`models`-overlay,
    and `baseUrl`-restored-regardless-of-vendor tests. Fixed.
  - Auditor verified every named symbol/type/signature against source (no hallucinations) and
    confirmed the §5 disk-write guarantee (`partialize` governs the write); pre-approved these exact
    fixes as "structurally ready to build." Zero open Critical/High/Medium → Gate 2 clean.
