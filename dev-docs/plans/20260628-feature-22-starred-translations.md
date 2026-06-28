# Feature #22 — Star word/sentence translations + a review surface

Status: Gate 2 (v2, audited round 1) · GH #181 · relates #20 (word lookup) · #3 (glossary) · #9 (sync)

## Problem
After translating a sentence or looking up a word (#20), there's no way to **star a translation and review it
later**. Users want a personal collection of starred word- and sentence-translations to revisit (vocabulary /
study). (Triage 2026-06-28.)

**Distinct from Glossary (#3):** the Glossary stores reusable **domain terms** injected into prompts for
*consistency*; this is a personal **review list** (study/recall), NOT prompt-injected. Siblings (similar
sidebar surface + the same #9 sync pattern), not duplicates.

## Scope
- **Headless (buildable now, no design):** a `starredStore` (model + persistence + star/unstar/list/search) and
  its **#9 sync** integration — a new entity type `'starred'` end-to-end **including the self-hosted server**.
- **Design-gated (rule 51 → needs-design):** the star *indicators* (on the #20 `LookupCard` + sentence result
  panes) and the **"Starred"/Review** sidebar surface. New visible surfaces → committed bundles required.

## Surface area (file-by-file)
### Store (WI-1)
- **NEW `src/stores/starredStore.ts` (+ test)** — `StarredItem`:
  `{ id, kind:'word'|'sentence', source, translation, ipa?, meaning?, sourceLang, targetLang, context?,
  createdAt, updatedAt, deletedAt }` (the `updatedAt`/`deletedAt` sync envelope mirrors `glossaryStore`'s
  `Term`). **Mirror `glossaryStore` exactly, NOT `keywordId` (Gate-2 M3):** id = a **random uuid** (test-seam
  counter for determinism, like `__resetGlossaryIds`), with **content-scan dedupe** — `star(item)` scans live
  items for the same `(kind,source,context,sourceLang,targetLang)` tuple and is a no-op if found (avoids the
  multi-KB value-derived id + the field-join ambiguity the auditor flagged). **`unstar(id)` HARD-removes from
  the array (Gate-2 M4)** — mirror `glossaryStore.removeTerm` / `polishKeywordsStore.removeKeyword`; the
  deletion tombstone is **synthesized by `diff.ts` on the next cycle**, NOT stored in-place (no soft-tombstone,
  no GC problem, consistent with the inbound hard-remove in `reconcile.ts:46-48`). Live items always have
  `deletedAt:null`. `items` selector, `searchStarred(items,q)`. `createSafeJSONStorage` persistence,
  `PERSIST_VERSION 1`, never-throwing `migrateStarred`. Test seams for ids/clock.

### Sync extension (WI-2) — client AND server (Gate-2 C1 + H2)
The merge engine (`merge.ts`/`diff.ts`/`cycle.ts`/`queue.ts`/`backend.ts`/`applyGuard.ts`) is genuinely
entity-agnostic (confirmed) — but a new entity type must be threaded through every site that **enumerates the
stores or the type set by hand**. The COMPLETE set (real filenames, Gate-2 L6):
- **Client type + guard:** `src/lib/sync/types.ts` (`EntityType` union) · `src/lib/sync/guards.ts` (the
  `ENTITY_TYPES` const at line 10, not `isSyncEntity` directly).
- **Client pure pipeline:** `src/lib/sync/seed.ts` (`flattenLocal`/`collectLocal`/`buildSeedFromLocal` all live
  here — NOT a `collectLocal.ts`; emit starred ops `baseRev:0`) · `src/lib/sync/reconstruct.ts` (sync→
  `StarredItem`, safe-int timestamps) · `src/lib/sync/reconcile.ts` (`reconcileStores` — apply upsert +
  delete-wins to the starred store; its return type `{sessions,terms,keywords}` → add `starred`).
- **Client impure store-wiring (the silently-dropped sites, Gate-2 H2):**
  - `src/lib/sync/runSyncCycle.ts` — `readSnapshot` (:27-31) + the `runSuppressed` commit `setState` (:68-73,
    where `useStarredStore.setState({ items: next.starred })` lands). Without this read+write, **pulled starred
    items are dropped** (inbound broken). **Do NOT thread `starred` into `setCounts` (:80-85) (Gate-2 r2 L1)** —
    it is a diagnostic count only; adding it would force a `SyncCounts`/`ZERO_COUNTS` change (`syncStore.ts:37,99`)
    and surface in the **design-gated** 4-column counts grid (`ConnectedPanel.tsx:164-169`, rule 51). Starred is
    intentionally NOT counted in the sync pill; no data is lost (the inbound commit above is the load-bearing site).
  - `src/lib/sync/editTracker.ts` — `snapshot` (:28-32) + `subscribe` (:52-56). Without it a local star/unstar
    **never enqueues a push** (outbound broken). **NOT backstopped by the coverage gate** — omitting it leaves
    the file unchanged + still 100% covered, so its WI-2 test is mandatory.
  - `src/lib/sync/syncController.ts` — the seed `snapshot` (:89-93). Without it the initial seed **never uploads
    pre-existing starred items**.
  - Type-only (compile-caught, listed for completeness): `LocalSnapshot` (`seed.ts:18-22`),
    `PullOutcome.snapshot` (`pull.ts:32`).
- **SERVER (Gate-2 C1 — the plan was wrong that none is needed):** `server/src/types.ts` (`EntityType` union,
  line 11) · `server/src/db.ts` (`VALID_TYPES` set, line 70 — add `'starred'`; enforced in `assertValidOp`/
  `rowToEntity`). Without this a `'starred'` push → `InvalidOpError` → HTTP 400 → client maps badRequest→
  `'unreachable'` → the op never acks → **the queue wedges and ALL sync stalls**. The `entities` table schema
  is already generic (no migration). **Deploy ordering:** server redeployed **before/with** any client that can
  emit starred ops. (Safe here: no UI stars until WI-3, so no `'starred'` op is ever emitted until both have
  shipped — see WI ordering.)

### UI (WI-3/WI-4 — design-gated)
- **Star indicators (`needs-design`)** — a star toggle on `LookupCard` (#20) + the translate/polish sentence
  result panes. New indicators on existing designed surfaces (rule 51).
- **"Starred"/Review sidebar surface (`needs-design`)** — a tab beside Sessions/Glossary: list/search/detail/
  empty. New surface.
- **i18n** `starred.*` — added with each UI WI.

### Files OUT of scope
Glossary (#3) unchanged (different purpose). The #9 merge/diff/cycle engine unchanged (entity-agnostic).
Prompt layer unchanged (starred items are NEVER prompt-injected).

## Work items
- **WI-1 (foundational · patch)** — `starredStore` (uuid id + content-scan dedupe + HARD-delete unstar +
  safeJSONStorage + migrate + seams). Local-only, no sync. Tests: star/dup-idempotent/unstar-hard-remove/
  search/CJK+RTL+mixed-script source/empty/persist+migrate-never-throws.
- **WI-2 (foundational · patch) — the FULL `'starred'` sync extension, client + server, in one PR** (they are
  deploy-coupled; landing together + no UI-stars-yet means zero wedge risk). All sites above. Tests: the pure
  pipeline (collect/reconstruct-round-trip/reconcile-upsert+delete-wins/seed `baseRev:0`/guard-rejects-malformed)
  **plus** the impure sites — `editTracker`: a local star → enqueues a push op; `runSyncCycle`: a pulled starred
  entity → committed into `starredStore` + counted; `syncController`: seed includes pre-existing starred —
  **plus** server `db.test.ts`/`app.test.ts` for the new `VALID_TYPES` member. (Gate-2 M5)
- **WI-3 (behavioral · design-gated) — star indicators.** BLOCKED on `needs-design`. Star toggle on
  `LookupCard` + sentence panes → `starredStore.star/unstar`. **First site that emits a `'starred'` op** — by
  here WI-2's server change has shipped.
- **WI-4 (behavioral · FINAL · design-gated) — the Review surface.** BLOCKED on `needs-design`. "Starred"
  sidebar tab (list/search/detail/empty). Completes the feature.

WI-1/WI-2 headless → unit-tested, shippable now (no app-behavior change — nothing stars until WI-3). WI-2 is a
sync-wire/network change → **mock-backend slice verification** (rule 47 network-feature tier), not "no verify"
(Gate-2 L8). WI-3/WI-4 are the design-gated UI that turns the feature on.

## Test catalogue
- `starredStore.test` — star adds (live); dup tuple → idempotent (scan-dedupe, one item); unstar → HARD-removed
  (absent from `items`); search over source/translation; CJK + RTL + mixed-script source; empty; persist via
  partialize; migrate never throws on corrupt/oversized.
- `src/lib/sync` — starred: `collectLocal`/`flattenLocal` emit ops; `reconstruct` round-trips a `StarredItem`
  (safe-int ts); `reconcile` upsert + delete-wins; `seed` `baseRev:0`; `guards` rejects malformed; **editTracker
  starred-edit→enqueue; runSyncCycle pulled-starred→committed+counted; syncController seed-includes-starred**.
- `server` — `db.test.ts`/`app.test.ts`: a `'starred'` op is accepted (was 400), pulled back with a server rev.
- No-regression: existing 4-entity sync tests green; WI-1/WI-2 add no app-load behavior (nothing emits a
  starred op until WI-3).

## Risks + mitigations
- **Sync wedge on an un-updated server (Gate-2 C1)** — WI-2 ships client + server together; no UI stars until
  WI-3, so no `'starred'` op is emitted before both are deployed. Deploy ordering documented.
- **Silently-dropped entity sites (Gate-2 H2)** — all three impure sites enumerated + each has a mandatory WI-2
  test (editTracker's especially, since coverage won't flag it).
- **Dedupe id (Gate-2 M3)** — mirror glossary's uuid + content-scan dedupe (no multi-KB value-derived id, no
  field-join ambiguity).
- **Delete representation (Gate-2 M4)** — hard-delete + `diff.ts`-synthesized tombstone, matching siblings +
  the inbound hard-remove path; no tombstone accumulation, no resurrect ambiguity.
- **Starred outlives source session** — `StarredItem` is a top-level entity with its own id (keeps its own
  copy); deleting a session leaves the star intact (correct).

## Backward compat
Additive — a new store (no existing data) + a new sync entity. The server `entities` table is generic (no
migration); only the `VALID_TYPES` allow-list grows. An older server rejects `'starred'` (hence the deploy
ordering); older clients ignore an unknown pulled type via the `ENTITY_TYPES` guard.

## Audit fixes applied (Gate 2, round 1 → v2)
Independent auditor, round 1 = NEEDS REVISION (1 Crit + 1 High + 3 Med + 3 Low). All addressed:
- **C1** server `VALID_TYPES` + `EntityType` added to WI-2 (+ server tests + deploy ordering).
- **H2** the 3 impure store-wiring sites (`runSyncCycle`/`editTracker`/`syncController`) + type-only sites
  enumerated + tested (editTracker test mandatory — not coverage-backstopped).
- **M3** dedupe id → glossary's uuid + content-scan (not `keywordId`).
- **M4** unstar → hard-delete + `diff.ts` tombstone (not in-place soft-delete).
- **M5** test catalogue extended to the impure + server sites.
- **L6** real filenames (`seed.ts`, `reconcile.ts`, `guards.ts` `ENTITY_TYPES`). **L7** file the 2
  `needs-design` issues at the PLANNED flip (proactive). **L8** WI-2 gets a mock-backend slice verify.

## Known limitations
- **Cross-device offline content-duplicate (Gate-2 r2 L2, inherited):** mirroring glossary's "random uuid +
  local content-scan dedupe" means two devices that independently star the *same* tuple while offline produce
  two entries (reconcile dedupes by id, not content). This is glossary's existing, accepted trade-off — not a
  regression #22 introduces — and is the correct cost of matching the sibling precedent. Not addressed in v1.

## Revision history
- v1 (2026-06-28) — initial draft.
- v2 (2026-06-28) — Gate-2 round-1 fixes (1 Crit + 1 High + 3 Med + 3 Low). **Gate-2 PASSED round 2: READY TO
  BUILD, 0 open Crit/High/Med** (2 round-2 Lows folded: setCounts excluded from starred; cross-device dup noted).
