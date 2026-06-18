---
branch: feat/feature-12-wi-1-persist-provider-config
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #12 WI-1 (persist provider config; keys stay in-memory)

Independent audit by a separate-context Claude `auditor` subagent (read-only). Codex/cc-suite
quota-blocked → author/auditor separation (rule 48) preserved via a fresh subagent context.

## Diff under audit
- `src/stores/providerStore.ts` — wrap `create` in `persist`; add `PERSIST_VERSION`,
  `partializeProvider` (allowlist `{vendor,models,baseUrl}`), `migrateProvider`, `mergeProvider`
  (spreads `current` for actions + in-memory fields; membership-guards vendor; overlays models;
  re-derives the `model` mirror).
- `src/stores/providerStore.test.ts` — +17 persist tests.

## Round 1 findings

| # | severity | finding | resolution |
|---|---|---|---|
| 1 | — (CLEAN) | §5 key-exclusion: traced write (`partializeProvider` explicit 3-field literal, no spread) + read-back (`mergeProvider` sources `apiKey`/`apiKeys`/`testResults` only from fresh `current`); no path writes/rehydrates a key. | confirmed — load-bearing guarantee holds |
| 2 | — (CLEAN) | **Plan-deviation validated as the CORRECT fix:** the plan named `isVendorImplemented(persisted.vendor)`, but that is `REGISTRY[vendor].implemented` which **throws** on a corrupt `vendor:'mistral'` blob. The impl uses `VENDORS.includes(pv)` (membership) → no throw, clean fallback. No implementability gap (all known vendors implemented; `setVendor`/`isReady` gate switches). | implementer caught a real plan bug |
| 3 | — (CLEAN) | `merge` returns `{ ...current, vendor, models, baseUrl, model }` → all 8 actions + `isReady` survive (tested). Mirror `model = models[vendor]` always defined (overlay onto complete defaults). | confirmed |
| 4 | — (CLEAN) | **Prototype-pollution avoided:** the overlay loop iterates the FIXED `VENDORS` list (not `Object.keys(persisted.models)`), so a `__proto__` key in the blob is never read/assigned. | confirmed safe |
| 5 | — (CLEAN) | Corruption: non-object / non-record models / non-string-or-empty entries / non-string vendor & baseUrl — all handled without throw; oversized strings rejected by `safeJSONStorage` maxBytes. | confirmed |
| 6 | Low (note) | No real-localStorage round-trip in-suite (Node test runner has no localStorage → storage is a no-op). Mitigated by testing the pure helpers directly (matches glossary/syncQueue precedent); real round-trip is a browser concern. | accepted (inherent to the test env) |
| 7 | — (CLEAN) | lucid compliance: no `any`; 167 lines (<300); no destructure/SDK leak; header + `setBaseUrl` comments updated for the persistence change (doc-sync met). | confirmed |
| 8 | — (CLEAN) | Branch coverage complete — both branches of every new conditional exercised (isRecord ×2, vendor guard ×3, models-isRecord ×2, entry ×3, baseUrl ×2, migrate ×2). | confirmed |

## Verdict
**ship-as-is.** Zero open Critical/High/Medium. The §5 guarantee is structurally enforced, the
vendor-guard deviation is a correctness improvement over the audited plan (caught a throw the plan would
have introduced), prototype-pollution is avoided, and coverage is complete. `pnpm check:all` green
(lint + typecheck + 100% coverage + build). The one Low (no in-suite localStorage round-trip) is
inherent to the runner and accepted.
