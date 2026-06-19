# Feature #10 — Multiple custom (OpenAI-compatible) providers

- **Status:** PLANNED (Gate 2 re-audit on v2 optional)
- **GH:** #92 · design #109 (closed, delivered)
- **Tracker row:** `docs/features.md` #10 (Medium)
- **Design bundle:** `dev-docs/designs/lucid-custom-providers/` (committed PR #122)
- **Slug:** custom-providers

## Problem

Today `Vendor` is a fixed enum with ONE `custom` slot + a single `baseUrl`. Users want several user-defined
OpenAI-compatible endpoints, each with its own label / base URL / model / optional key (refs #92). The
`openaiCompatibleProvider` engine is already reusable per base-URL/model — this is a **one→many data-model
+ UI** change. Keys stay in memory (rule 65 §5).

## Design reference (rule 51 — committed bundle)
`dev-docs/designs/lucid-custom-providers/...dc.html`: a Settings rail **Custom providers** group holding N
(empty + populated; active "In use"); an **add/edit form** (label/baseURL/model/optional key + Show;
validation: duplicate label, scheme-less URL); a **per-custom connection test** (untested/testing/
connected/needs-key/unreachable); a **remove** confirm (active → fallback to a built-in); a **grouped
toolbar switcher** (built-in + scrollable Custom list + "Add custom provider…"; collapsed trigger carries a
status chip).

## Architecture decisions (Gate-2-corrected — these are binding)
- **Keep `createProvider(vendor: Vendor, config, deps)` a PURE factory — UNCHANGED** (Gate-2 C1). Do NOT
  import the store into `src/providers/index.ts` (it would create a store→providers→store cycle + couple
  the factory to global state + break its store-free tests, rule 65 §1/§8). A custom already works today as
  `createProvider('custom', { baseUrl, model, apiKey })` (proven by `index.test.ts:86-114`).
- **Resolve the active custom's config at the CALL SITES** (`usePanelRun.ts:30`, `useTestConnection.ts:29`)
  — both already read `useProviderStore.getState()` and pass `{apiKey, model, baseUrl}`. They look up the
  active `CustomProvider` and pass its `{key, model, baseUrl}` as the existing `ProviderConfig`.
- **`modelRegistry`/`resolveModel` UNCHANGED** (Gate-2 C2): `resolveModel('custom', c.model)` already
  returns `c.model` (`allowAnyModel`). No "custom-by-id" registry path — it would break the
  `Record<Vendor,…>` totality `index.ts`/`providerPresentation.ts` rely on.
- **`vendor` stays `'custom'` when a custom is active**; *which* custom lives in `activeCustomId`. A
  normalized selector `activeTarget(state): Vendor | { customId: string }` is the single source of truth
  for "what's active" — used by `isReady`, the call sites, and presentation (Gate-2 H1; avoids scattered
  `vendor==='custom' ? activeCustomId : vendor` ternaries).

## Surface area (file-by-file)

### WI-1 — `providerStore` one→many model + persist migration (foundational/logic; coverage-gated) — the heavy WI
- `interface CustomProvider { id: string; label: string; baseUrl: string; model: string; key: string; testResult: TestResult }`.
  Add `customProviders: Record<string, CustomProvider>` + `activeCustomId: string | null` to `ProviderState`.
- **Completeness (Gate-2 H2)**: `initial()` seeds `customProviders: {}` + `activeCustomId: null` (and its
  `Pick<…>` return type adds both); `reset()` restores them; the reset test gains assertions.
- Actions: `addCustomProvider({label,baseUrl,model,key?}) → id` (id = `crypto.randomUUID()`, opaque, never
  a `Vendor` literal — Gate-2 L1); `updateCustomProvider(id, patch)`; `removeCustomProvider(id)`;
  `setVendor(Vendor | {type:'custom',id})` (validates id exists; sets `vendor='custom'`+`activeCustomId`);
  `setBaseUrl/setModel/setApiKey/clearKey/setTestResult` gain an optional custom id (default: the active
  target). A **pure `uniqueLabel(label, customProviders, exceptId?)` predicate** (trim + case-insensitive)
  used by BOTH the form and the store actions (Gate-2 M1 — it's business logic, TDD-tested).
- `isReady()`: when active=custom, read `customProviders[activeCustomId]` → require its `baseUrl`+`model`;
  **a null/dangling `activeCustomId` → false** (never crash — Gate-2 M4).
- `removeCustomProvider`: if removing the **active** custom → fall back to the **default built-in
  `anthropic`** (`activeCustomId=null`, `vendor='anthropic'`) — deterministic + tested (Gate-2 M2);
  removing a non-active custom is a quiet delete.
- **Persist (PERSIST_VERSION 1→2)**:
  - `partializeProvider` persists `customProviders` with each entry **stripped to `{id,label,baseUrl,model}`
    — NEVER `key`, NEVER `testResult`** (Gate-2 H3: a persisted `ok` would paint a green dot on a now-
    keyless provider) + `activeCustomId`. (The existing partialize already excludes `apiKey`/`apiKeys`/
    `testResults` — the strip pattern is proven; this extends it.)
  - **`migrateProvider` REWRITE** (Gate-2 M3): it's a no-op/drop migrator today (returns undefined for old
    versions). Rewrite into a v1→v2 transformer: from the v1 partialize shape `{vendor, models, baseUrl}`,
    **iff `baseUrl` is non-empty**, create one `customProviders` entry `{id:randomUUID, label:'Custom',
    baseUrl, model: models.custom ?? '', key:''}`; set `activeCustomId` to that id **only iff v1
    `vendor==='custom'`** (a v1 anthropic user with a stray baseUrl does NOT get an active custom).
  - **`mergeProvider` open-keyed defensive rehydrate** (Gate-2 H4 — the #12 "iterate the fixed VENDORS"
    precedent is WRONG here; customProviders keys are user/attacker-controlled): iterate the persisted
    object's OWN keys via `Object.entries`, **skip `__proto__`/`constructor`/`prototype`**, validate each
    entry with `isRecord` + type-check every field (id/label/baseUrl/model are strings), **force `key:''`
    + `testResult:{status:'idle'}`**, drop entries whose `id` ≠ their key or with missing fields, and
    **cap the count** (e.g. ≤ 50 — DoS guard). Guard a dangling `activeCustomId` (→ null + fall back).

### WI-2 — presentation for N customs + active-custom resolver + call-site wiring (foundational/logic; coverage-gated)
- `configurablePresentations(state)` enumerates the N custom providers (each → a presentation carrying its
  `label`, a dot derived from its `testResult`, its `model`, and a `customId`) + the built-ins.
- **`activePresentation(state)`** (Gate-2 C3 — NEW, foundational): returns the presentation for the active
  target — for an active custom, carries the custom's label/dot/model (NOT the static `BY_VENDOR.custom`).
  `presentationFor(vendor)` stays total over `Vendor` (unchanged); the switcher trigger + settings header
  switch to `activePresentation(state)` so an active custom shows its own label/chip (design Section E).
- **Call sites** resolve the active custom (per the architecture decision): `usePanelRun.ts` builds the
  `ProviderConfig` from `activeTarget` (`{apiKey:c.key, model:c.model, baseUrl:c.baseUrl}` for a custom),
  and `useTestConnection` gains a **custom-id-aware path** (today it's keyed by `Vendor`, reading
  `cfg.apiKeys[vendor]`/`cfg.baseUrl` — Gate-2: this is a real logic change, not free) so it can probe a
  specific custom by its resolved config.

### WI-3 — Settings rail: Custom group + add/edit + validation + per-custom test + remove (behavioral; designed)
- `SettingsDialog` rail: the **Custom providers** group (empty CTA / populated `Custom · N` / active "In
  use"); the add/edit detail form (label/baseUrl/model/optional key + Show) with validation (duplicate
  label via the `uniqueLabel` predicate; scheme-less URL; Add/Save disabled until valid; Test allowed once
  URL valid); the per-custom connection-test card (the WI-2 custom-id-aware `useTestConnection`); the
  Remove confirm (active → fallback notice). After a reload a previously-keyed custom shows **needs-key**
  (designed Section C — the key wasn't persisted; a wiring note, not new UI — Gate-2 L2).

### WI-4 — `ProviderSwitcher` grouped (final WI; behavioral; designed)
- Grouped dropdown (Built-in + scrollable Custom list with count/dots/active-✓ + "Add custom provider…"
  → opens Settings); collapsed trigger uses `activePresentation` (carries the active custom's status chip).
  Selecting a custom → `setVendor({type:'custom',id})`.

### i18n keys (Gate-2 L3 — enumerate, added with their WI)
`settings.customGroup` ("Custom providers"), `settings.customCount` (`Custom · {n}`), the add/edit form
labels, the 5 connection-test state strings, `error.duplicateLabel`, `error.badBaseUrl`, the remove-confirm
+ fallback notice, `switcher.addCustom` ("Add custom provider…").

### Files OUT of scope
`openaiCompatibleProvider` internals, `createProvider`/`modelRegistry` (unchanged per the decisions), the
diff/translate/polish flows, #11/#15.

## Prior art / precedent / rejected alternatives
#7 = the single custom slot; #12 = the providerStore persist (partialize/merge/migrate/PERSIST_VERSION).
`openaiCompatibleStream` is already `{baseUrl,apiKey}`-parameterized. Rejected: a second fixed enum slot
(doesn't scale); persisting keys (rule 65 §5); loading the store in the factory (Gate-2 C1).

## Work-item sequencing
| WI | Tier | Designed? | PR size |
|---|---|---|---|
| WI-1 providerStore one→many + migration + open-keyed merge | foundational/logic | n/a | medium-LARGE (the heavy one) |
| WI-2 presentation(N) + activePresentation + call-site resolution | foundational/logic | n/a | small-med |
| WI-3 rail: group + add/edit + validation + test + remove | behavioral | yes | medium-large (may split) |
| WI-4 grouped ProviderSwitcher (final) | behavioral | yes | medium |

WI-1 is the riskiest (migration rewrite + open-keyed merge + initial/reset); if it pushes `providerStore.ts`
past the ~300-line ceiling, split the migration/merge helpers into a sibling module (mirroring
`safeJSONStorage`). WI-1/WI-2 are 100%-gated logic. WI-3/WI-4 are designed UI (Gate-5); WI-4 (final) →
minor bump. Per the audit table: 1 plan audit + 1 PR audit per WI; WI-3 may split.

## Test catalogue
- `providerStore.test.ts`: add/update/remove custom; `uniqueLabel` (trim/case); setVendor to a custom id;
  per-custom key/model/test (in-memory keys); `isReady` active-custom incl. **dangling activeCustomId →
  false**; **v1→v2 migration** (baseUrl+custom → entry + activeCustomId; v1 anthropic+baseUrl → entry but
  activeCustomId stays null); **partialize strips key + testResult** (asserted: no key/`ok` on disk);
  **open-keyed merge hostile-blob** (extra keys, `__proto__`/`constructor`, non-string fields, id/key
  mismatch, oversized count → all dropped/sanitized); remove active → fallback to anthropic.
- `useTestConnection` / `usePanelRun` tests: custom-id-aware config resolution (the active custom's
  key/model/baseUrl reach the provider); unknown/dangling id → not-ready, no crash.
- `providerPresentation` tests: `configurablePresentations` enumerates N customs + built-ins;
  `activePresentation` returns the active custom's label/dot/model (not the static custom presentation).
- WI-3/WI-4 (Gate-5 browser + component): rail empty/populated/active-In-use; add-form validation
  (dup/bad-URL/disabled-until-valid); 5 connection-test states; remove confirm + active-fallback; needs-key
  after reload; switcher grouped + scroll + add-item + collapsed status chip.

## Risks + mitigations
- **Migration data loss / no-op migrator** → rewrite `migrateProvider` into a real transformer; dedicated
  v1→v2 tests; only-create-on-non-empty-baseUrl, only-activate-on-v1-custom.
- **Keys/`ok` on disk (rule 65 §5)** → partialize strips `key` + `testResult`; test asserts neither
  reaches the blob; rehydrate every custom to `{status:'idle'}`.
- **Open-keyed prototype pollution / DoS** → own-key iteration + skip dangerous keys + per-field validate +
  count cap; hostile-blob test (the #12 fixed-set precedent does NOT apply).
- **Active-custom dangling id** → merge guards + `isReady` false + fallback.
- **Factory/store cycle** → avoided (factory stays pure; call sites resolve — Gate-2 C1).
- **`presentationFor` totality** → unchanged; `activePresentation` is the new active-target resolver
  (Gate-2 C3).
- **Existing tests break** (Gate-2 H1: `providerStore.test.ts` `setVendor('custom')`/legacy-slot tests
  at :45-48, :174-191) → rewritten as part of WI-1 (called out, not a surprise).
- **Designed-UI scope** → only what the bundle depicts; Gate-5 verifies.

## Backward compat
A v1 single-custom user is migrated to one named active custom; a v1 built-in user with a stray baseUrl
gets an inactive named custom (no behavior change). Built-ins unchanged. Keys never persisted (unchanged).
The `custom` `Vendor` entry is retained as the dynamic marker so the type surface stays stable.

## Revision history
- 2026-06-19 v1 — initial plan (Gate 1), grounded in the design + the exploration data-model & UI maps.
- 2026-06-19 — Gate 2 round 1: **NEEDS REVISION** (3 Critical, 4 High, 4 Medium; no hallucinated symbols).
- 2026-06-19 v2 — all C/H/M addressed: **C1** keep `createProvider` pure, resolve at call sites; **C2**
  strike `resolveModel`/registry changes (totality); **C3** `activePresentation(state)` for the active
  custom (switcher trigger + settings header); **H1** `vendor` stays 'custom' + `activeTarget` selector +
  existing tests rewritten; **H2** `initial`/`reset`/`Pick` seed the new fields; **H3** don't persist
  `testResult` (rehydrate idle); **H4** open-keyed defensive merge (own-key iterate + dangerous-key skip +
  per-field validate + count cap) — NOT the #12 fixed-set precedent; **M1** pure `uniqueLabel` predicate
  used by form+store; **M2** deterministic fallback to anthropic; **M3** rewrite `migrateProvider` into a
  real v1→v2 transformer; **M4** dangling-active-custom isReady=false; **L1** `crypto.randomUUID()` id;
  **L2** needs-key-after-reload wiring note; **L3** i18n keys enumerated. Also: `useTestConnection` gains a
  custom-id-aware path (a real logic change, WI-2/WI-3). Re-audit optional — fixes are code-cited per
  Gate-2; per-WI Gate-4 re-verifies each diff.
