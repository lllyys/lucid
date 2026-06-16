---
branch: feat/feature-9-wi-1c-keywords
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 3
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #9 WI-1c (keyword `string[] → Keyword[]` conversion)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1a/1b. Files:
`src/stores/polishKeywordsStore.ts` + test, `src/components/polish/PolishPanel.tsx` (consumer
ripple), `src/components/sidebar/GlossaryView.test.tsx` (one assertion). The prompt layer
(`src/lib/prompts`) and `KeywordsCard` were deliberately left unchanged — PolishPanel maps
`Keyword[] → values` at the boundary, so `req.keywords` stays `string[]`.

## Round 1 — verdict: NEEDS ATTENTION (1 Medium)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | polishKeywordsStore.ts `keywordId` | Medium | `keywordId` used a 32-bit djb2 hash as the **sync identity**, but dedup is by `value`, not derived `id`. Codex produced a concrete collision: `dgackrhf` and `xlellzqn` both → `kw_1ai3n3z`. In sync, that merges two distinct keywords into one entity. | **FIXED** — replaced the hash with a collision-free **encoding** of the value |

Confirmed-fine in R1: `Keyword` lacking `createdAt` (WI-2/3 projects to a uniform `{id,rev,updatedAt,deletedAt}` SyncEntity and never syncs `createdAt`); `keywordValues = keywords.map(...)` in PolishPanel (not an effect dep; the reset effect keys off the stable store array ref); deferring the 3rd `isRecord` copy to WI-2.

## Round 2 — verdict: NEEDS WORK (1 High)

First fix used `encodeURIComponent`. Codex caught that it **throws `URIError` on lone surrogate
code units** (e.g. `keywordId('\uD800')`), breaking `addKeyword`/`migrateKeywords` and violating the
"never throws"/"unicode-safe" contract.

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| R2-1 | polishKeywordsStore.ts `keywordId` | High | `encodeURIComponent` throws on lone surrogates | **FIXED** — encode as fixed-width 4-hex per UTF-16 code unit (a true bijection over UTF-16; never throws; collision-free including lone surrogates). Rejected `TextEncoder`/base64 — it collapses lone surrogates to U+FFFD, reintroducing collisions. Added lone-surrogate regression tests for both `keywordId` and the migration |

## Round 3 — verdict: CLEAN

> "The fixed-width UTF-16 hex encoding resolves both prior issues. `keywordId` is now collision-free
> over JavaScript string values, deterministic across devices, and does not throw on lone surrogates …
> IDs use only `kw_` plus hex digits, safe in JSON payloads and SQLite `TEXT`. CLEAN."

## Design notes

- `Keyword = {id, value, updatedAt, deletedAt}` per the plan (no `createdAt`). `id` is derived from
  the value so two devices adding the same keyword converge to one synced entity; dedup-by-value is
  now equivalent to dedup-by-id because the encoding is bijective.
- Migration trims, drops empties, and de-dupes during the v1→v2 backfill so a tampered v1 array can't
  produce two entries sharing a derived id. `updatedAt = 0` legacy sentinel (LWW-safe).

Compliance: no `any`; files < ~300 lines; no vendor leak; no duplication beyond the intentional
1-line `isRecord` (extraction deferred to WI-2). `pnpm check:all` green — 654 tests, 100%
stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. WI-1 (the full store-model
migration: sessions + glossary + keywords) is now complete.
