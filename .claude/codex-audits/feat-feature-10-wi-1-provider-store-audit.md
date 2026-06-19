---
branch: feat/feature-10-wi-1-provider-store
threadId: independent-claude-auditor
rounds: 4
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — feature #10 (Multiple custom OpenAI-compatible providers)

Independent separate-context Claude `auditor` per WI (Codex quota-blocked; rule 48). The 4 WIs were built
on one branch and merge as a COHERENT BATCH (the data-model change is not independently shippable — see WI-1).
One PR audit per WI; all findings resolved on the branch before merge.

## WI-1 — providerStore one→many + v1→v2 migration + open-keyed defensive merge
- Migration/merge logic CLEAN: prototype-pollution-safe (own-key Object.entries + PROTO_KEYS skip), per-field
  validation + `id===key`, `MAX_CUSTOM_PROVIDERS=50` cap, `key:''`/idle testResult forced on rehydrate (rule 65 §5),
  `partialize` strips key+testResult. ids via the shared `randomUuid()` (insecure-context-safe — better than bare
  `crypto.randomUUID`).
- **High (sequencing):** WI-1 alone regresses the live custom flow (`setVendor('custom')` string strands
  `activeCustomId` → `isReady` false). **Resolved** by building forward — WI-2 (call-site resolution) + WI-3 (UI
  rewire) make the flow coherent; the batch never merges WI-1 alone.
- **Medium:** `removeCustomProvider` cleared `activeCustomId` only when `vendor==='custom'`. **Fixed (WI-2):** clears
  whenever `activeCustomId===id`.

## WI-2 — active-custom presentation + run/test call-site resolution
- `activeTarget`/`activePresentation`/`configurablePresentations(state)` correct; `usePanelRun.run` + `isReady` now
  resolve the SAME active-custom target (WI-1 incoherence resolved on the run path); `useTestConnection` custom-id
  path records on the right custom; `createProvider` stays pure; no built-in regression; no key leak.
- **Low:** `CUSTOM_DOT_TOKEN.fail` referenced a nonexistent `--error` token → **fixed**, then re-settled in WI-4.

## WI-3 — Settings rail rewire (designed, Sections A–D)
- Coherence verified END-TO-END: a custom set up through the live Settings UI activates via
  `setVendor({type:'custom',id})` and RUNS — the WI-1 High is gone. Rail/form/test-card/remove match the bundle.
- **High:** add-mode "Test connection" materialized a custom gated only on URL-validity, bypassing label-uniqueness
  + model-required. **Fixed:** Test gated on full `customFormValid` + a defense-in-depth guard in `onAddTest` + a
  duplicate-label regression test.
- Lows accepted: idle-keyless rail "needs key" dot/text nuance; Anthropic-vs-design-OpenAI fallback sample
  (Anthropic is lucid's default per AGENTS.md); no dedicated tests for the extracted presentational components
  (covered transitively). A WI-3 contamination slip (i18n edit → main) was self-rescued; main verified clean.

## WI-4 — grouped ProviderSwitcher (final WI, designed Section E)
- Trigger via `activePresentation` shows the active custom's OWN label (subsumes old bug #3); dropdown lists
  built-ins + customs; custom select → `setVendor({type:'custom',id})`; **no live `setVendor('custom')` string**.
- **Medium:** the presentation `CUSTOM_DOT_TOKEN` was design-wrong for fail+testing (the switcher renders it).
  **Fixed** from the design: `ok→--success, fail→--warning (needs-key/401), testing→--accent-primary, idle→--text-tertiary`.
- **Low:** the rail's duplicate dot map. **Fixed:** exported `customDotToken()` as the single source; deleted the
  rail's local map. **Low:** switcher-trigger focus ring added (rule 33).

## Verdict: ship-as-is — all findings resolved (0 open Critical/High/Medium)
`pnpm check:all` green at every WI; final: lint + typecheck + 100% gated coverage (src/stores + src/lib/providers)
+ build; 1299 tests. Gate-5: full custom flow browser-verified (`dev-docs/verification/feature-10-20260619.md`).
