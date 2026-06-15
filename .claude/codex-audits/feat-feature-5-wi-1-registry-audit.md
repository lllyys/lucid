---
branch: feat/feature-5-wi-1-registry
threadId: subagent-claude
rounds: 1
final_verdict: ship-as-is
date: 2026-06-15
---

# Gate-4 audit — feature #5 WI-1 (modelRegistry: openai/gemini/ollama data)

Independent implementation audit of the WI-1 diff vs `main` — populating the model registry for
openai/gemini/ollama with real researched IDs + `allowAnyModel:true`, while keeping `implemented:false`
until WI-4 wires the factory switch.

Author/auditor separation (rule 48): the implementing Claude session authored the code; a fresh
independent in-harness `claude` subagent (read-only) audited it (Codex unavailable — sanctioned
fallback, recorded `subagent-claude`). It ran the diff, read the registry + test, and checked every
caller of `resolveModel`/`modelChain`/`capabilityOf`/`isVendorImplemented`/`implementedPresentations`.

## Round 1 — `subagent-claude` — CLEAN

**VERDICT: CLEAN** (zero Critical/High/Medium/Low).

- **Correctness**: `allowAnyModel:true` + `models:{}` is internally consistent — `resolveModel` returns
  the requested model as-is, `capabilityOf` is undefined, `modelChain` = `[default, ...fallbacks]`.
  Default/fallback choices coherent (gemini GA flash default, Pro excluded as preview-only; ollama
  llama3.2; openai gpt-5.5 + mini/nano). The non-Anthropic IDs rest on this WI's research (outside the
  claude-api skill's authority; not offline-verifiable by the auditor) — registry is the single swap
  point so a drift is a zero-code change.
- **Dormant claim verified**: with `implemented:false`, `createProvider` (index.ts:41) throws
  `requestFailed` for these vendors before any adapter builds; `implementedPresentations()` filters them
  out (switcher/Settings never render them); `ProviderSwitcher`'s `resolveModel(p.vendor)` is never
  reached for them; `setVendor` guards too. No reachable path surfaces the new defaults.
- **Coverage**: 100% (534 tests). No new branch introduced (the `allowAnyModel` branch was already
  covered by `custom`; the new data is pure values).
- **No fabrication**: `models:{}` avoids fabricated contextWindow/maxOutputTokens. The only
  `capabilityOf` consumer (`sizeMaxTokens`, anthropicProvider.ts) is hardcoded to `'anthropic'` and
  already falls back to `FALLBACK_MAX_TOKENS`, so empty catalogs break nothing today.
- **Rule 22**: module header + inline comments accurately describe the new state (real IDs,
  implemented:false until WI-4, allowAnyModel, no fabricated figures, picker offers `modelChain`).

### Forward note (not a finding)

WI-2 (gemini adapter) and WI-4 (factory switch) reuse the `models:{}` pattern — those adapters must
include their own `?? FALLBACK_MAX_TOKENS` guard for the undefined-capability case (as
`openaiCompatibleStream` already does by only sending `max_tokens` when `options.maxOutputTokens` is
provided). Carried into WI-2/WI-4.

## Verdict

**ship-as-is.** Dormant, research-grounded registry data that breaks nothing reachable; 100% coverage
holds; no fabricated figures.
