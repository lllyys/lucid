---
branch: feat/feature-5-wi-3-per-vendor-keys
threadId: subagent-claude
rounds: 1
final_verdict: ship-as-is
date: 2026-06-15
---

# Gate-4 audit — feature #5 WI-3 (providerStore per-vendor keys/models)

Independent implementation audit of the WI-3 diff vs `main` — refactoring `providerStore` from a
single `apiKey: string` to per-vendor `apiKeys`/`models` records, with `apiKey`/`model` kept as
denormalized mirrors of the active vendor so every existing caller keeps working. `setVendor` changed
from reset-to-default → restore-last-model+key. **This is the linchpin the UI WIs depend on.**

Author/auditor separation (rule 48): implementing Claude authored; a fresh independent in-harness
`claude` subagent (read-only) audited (Codex unavailable — `subagent-claude`). It traced the mirror
invariant through every mutator and all five callers, ran the suite (100%), and grepped for
persistence/logging.

## Two coverage-driven refinements vs the audited plan (documented)

- **Ollama no-key `isReady` branch deferred to WI-4.** While `ollama` is `implemented:false` (until
  WI-4), the `!isVendorImplemented` guard short-circuits before any ollama branch, so adding it now
  would be an uncovered dead branch. WI-4 adds it together with the implemented flip, where it's
  immediately coverable.
- **`testStatus`/`testResult` deferred to WI-5.** That state is produced/consumed by the
  test-connection probe (WI-5) + Settings panel (WI-6b); adding it in WI-3 would be unexercised. Kept
  WI-3 a focused, lower-risk refactor. (The plan's WI-3 bullet listed it; this is a sequencing move,
  not a scope drop.)

## Round 1 — `subagent-claude` — CLEAN

**VERDICT: CLEAN** (zero findings at any severity).

- **Caller compatibility**: `keyChange` compares `provider.apiKey === nextKey` (active mirror) and
  `setApiKey`/`clearKey` mutate the active vendor — comparison + mutation target the same vendor.
  `usePanelRun` builds `{apiKey: cfg.apiKey, model: cfg.model}` from mutually-consistent active mirrors.
  `SettingsDialog`/`FooterPrivacy`/`ProviderSwitcher` read `s.apiKey`/`s.vendor` mirrors — identical to
  pre-refactor. No caller broken.
- **Mirror integrity**: every `set()` touching `apiKeys[active]`/`models[active]` writes the top-level
  mirror in the same call (setApiKey/setModel/clearKey/setVendor/reset) — no drift; selector
  subscribers re-render on the changed mirror reference.
- **setVendor restore**: never-visited vendor → default model + empty key; same-vendor → idempotent;
  switch-back restores — tested.
- **isReady**: correct for anthropic (key), custom (key+baseUrl+model), unimplemented (false).
- **Security (§5)**: no persist/storage/stringify/logging of keys; `reset()` clears all per-vendor keys.
- **Coverage honesty**: per-vendor isolation genuinely tested (separate keys persist across switch,
  clearKey clears only active, init record shape); not wiring-only. 100% (830/830 stmts, 585/585 br).
- **Immutability**: all record updates spread; `emptyKeys`/`defaultModels` build fresh objects; no
  shared reference between vendors or `initial()` calls.

### Non-defect note

`ProviderSwitcher.tsx:46` renders `resolveModel(p.vendor)` (canonical default) in each menu row rather
than the live `models[p.vendor]` selection — intentional menu chrome (a preview of each vendor's
default), not misleading. WI-7 may revisit when the 4-provider switcher is polished.

## Verdict

**ship-as-is.** The mirror approach keeps all five callers working unchanged; the refactor is correct,
secure, immutable, and 100% covered (559 tests overall).
