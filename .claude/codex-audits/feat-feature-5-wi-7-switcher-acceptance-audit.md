---
branch: feat/feature-5-wi-7-switcher-acceptance
threadId: subagent-claude
rounds: 1
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #5 WI-7 (switcher polish + final integration review)

The final WI: a switcher polish (the provider menu shows each vendor's SELECTED model
`models[vendor] || resolveModel(vendor)`, not just the registry default) + the Gate-5b acceptance
evidence files. Audited as a **holistic integration review** of the whole multi-provider feature
(#5 + the folded #6 test-connection + #7 custom provider), since the per-WI internals (WI-1..6b) were
already audited CLEAN.

Author/auditor separation (rule 48): implementing Claude authored; an independent in-harness `claude`
subagent did the holistic read-only review (Codex unavailable — `subagent-claude`).

## Review — CLEAN (zero Critical/High/Medium)

- **WI-7 switcher**: `models[p.vendor] || resolveModel(p.vendor)` correct with a sound fallback;
  lists the 4 named vendors (custom excluded — configured in Settings); active label/dot/check correct;
  RED-first test added.
- **End-to-end usability (all 5)**: factory `buildStream` is an exhaustive `Record<Vendor,…>` —
  anthropic(key) / openai(key, api.openai.com/v1) / ollama(no key, localhost:11434/v1, no empty Bearer)
  / gemini(key, geminiStream) / custom(baseUrl + optional key, user model). `usePanelRun` threads
  baseUrl; `isReady()` + factory guards align — **no vendor is selectable-but-unrunnable**.
- **Settings completeness**: `configurablePresentations()` rail incl. custom; per-vendor key/model/
  test-connection; Ollama no-key card; custom base-URL + optional key; workspace-default;
  active-vendor key edits route through `applyKeyChange`. No reachable-but-broken state.
- **Cross-cutting**: zero orphan i18n keys (incl. dynamic `t(error.${kind})`/`t(result.msgKey)`); all 10
  ErrorKinds have `error.*` keys; no dead exports (`realSleep` is the production default in
  `defaultRetryDeps`); per-vendor store mirrors stay consistent.
- **Security (rule 65 §5/§6)**: no persist of apiKeys/testResults/baseUrl; zero `console.*`; three-layer
  detail sanitization; UI renders only messageKeys; gemini `x-goog-api-key` (no dual auth); privacy
  posture surfaced. No leak via test-connection or switcher.
- **Rule 51**: every shipped surface traces to the committed #29 bundle; the custom optional-key
  qualifier is the user-sanctioned #5/#7/#29 extension (not invented UI).

608 tests, 100% coverage, lint + typecheck + build all clean.

## The one flagged gap — resolved in this WI

The review's only blocker was process, not code: the `dev-docs/verification/feature-{5,6,7}-*.md`
acceptance-evidence files (Gate 5b + the `check_terminal_status_evidence.sh` hook) did not yet exist.
**Resolved in this WI**: authored `dev-docs/verification/feature-5-20260616.md`,
`feature-6-20260616.md`, and `feature-7-20260616.md` documenting the acceptance pass, before flipping
the rows to VERIFIED.

## Verdict

**ship-as-is.** The multi-provider feature is code-complete, secure, design-faithful, and fully tested;
the switcher polish is correct; the acceptance-evidence files are authored. Feature #5 (multi-provider),
#6 (test connection), and #7 (custom provider) are all delivered and ready to mark VERIFIED.
