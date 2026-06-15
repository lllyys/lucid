---
branch: feat/feature-7-custom-provider
threadId: subagent-explore-x2
rounds: 1
final_verdict: follow-up-recommended
date: 2026-06-15
---

# Gate-4 audit — feature #7 (custom OpenAI-compatible provider, engine WIs)

Independent implementation audit of the feature #7 engine diff vs `main`
(WI-1 `openaiCompatibleStream`, WI-2 custom vendor + registry, WI-3 factory +
store + presentation). WI-4 (Settings base-URL/model UI) is **out of this diff**
— blocked on design issue #29 (rule 51).

Author/auditor separation (rule 48): the implementing Claude session authored the
code. Codex was unavailable this round (usage-limit wedge earlier in the session,
then a stdin ghost that was reaped), so the audit ran through **two independent
in-harness `Agent` (Explore) subagents** — a fresh read-only context distinct from
the author, which satisfies the rule-48 / Gate-4 independence boundary (the skill
explicitly sanctions "a fresh subagent with read-only sandbox + audit-don't-implement
framing" as an alternative auditor). This is recorded as `subagent-explore-x2`, not
`manual-fallback`, because the audit was performed by independent agent contexts
rather than by hand.

Files in scope (`git diff main --name-only`):

- `src/providers/openaiCompatibleProvider.ts` (+ `.test.ts`)
- `src/providers/types.ts`
- `src/providers/modelRegistry.ts` (+ `.test.ts`)
- `src/providers/index.ts` (+ `.test.ts`)
- `src/lib/providers/providerPresentation.ts` (+ `.test.ts`)
- `src/stores/providerStore.ts` (+ `.test.ts`)
- `src/locales/en/translation.json`
- `dev-docs/plans/20260615-feature-7-custom-provider.md`

## Round 1 — two parallel subagent auditors — CLEAN

### Auditor A — correctness + security

**VERDICT: CLEAN** (zero Critical/High/Medium/Low findings).

- **SSE stream correctness** matches the v2 plan spec: `[DONE]` terminates;
  malformed JSON → `requestFailed`; non-object/null/array payloads → `requestFailed`;
  in-stream `event.error` mapped (numeric `code` → `errorFromStatus`, else
  `providerDown`); only non-empty string `choices[0].delta.content` is yielded;
  `finish_reason` tracked and mapped after the loop (`content_filter` → refusal with
  `fallbackable = !produced`, `length` → incomplete, `!sawDone && finish_reason==null`
  → incomplete).
- **Abort** is honored — consumption stops, no further chunks (covered by the abort test).
- **Security**: the API key is sent only as a `Bearer` Authorization header; it is
  never logged, never persisted, never interpolated into the request body or any
  error. No vendor-specific response shape leaks past the provider boundary — the raw
  OpenAI chunk is reduced to `StreamChunk` / `ProviderOutcome` before it escapes.
- **baseUrl** trailing-slash normalization (`replace(/\/+$/,'')`) is correct;
  `${baseUrl}/chat/completions` is well-formed for both `…/v1` and `…/v1/` inputs.

### Auditor B — rules + dead code + tiers

**VERDICT: CLEAN** (zero findings).

- **Rule 65 §1/§2**: the custom vendor routes through the single `LLMProvider`
  interface via `createProvider`; no vendor SDK import anywhere; model IDs are not
  hardcoded — `allowAnyModel` lets the user supply any model, resolved through the
  registry, not a string literal in feature code.
- **Rule 51 (no dead UI)**: `custom` is deliberately excluded from
  `implementedPresentations()` so the provider switcher does not show an
  unconfigurable row before its config UI (#29) ships. Presentation entry exists for
  Record totality; switcher list does not include it. No invented/disabled UI.
- **No dead or speculative code**: `baseUrl` + `setBaseUrl` on the store are
  foundational state that WI-4 will bind to; they are already exercised by
  `isReady()` and tests, so not orphaned. The `// #2 adds a vendor switch here`
  stale comment was replaced with the real vendor switch (rule 22).
- **WI tiering**: WI-1/2/3 are correctly foundational/behavioral-headless — the
  engine + wiring + store changes have no user-observable surface yet (the surface is
  WI-4, design-gated). 100% coverage on all globbed files (`src/providers/**`,
  `src/lib/**`, `src/stores/**`).

## Resolution

Zero findings from either auditor — nothing to fix. `pnpm check:all` green at 100%
coverage.

## Verdict

**follow-up-recommended.** The engine (WI-1/2/3) is correct, secure, rule-compliant,
and ships as-is. The single follow-up is **WI-4 (Settings base-URL/model UI)**, which
is design-gated on **#29** per rule 51 and intentionally excluded from this diff —
so feature #7 stays `IN PROGRESS` (engine landed) rather than `DONE`/`VERIFIED` until
#29's design loop completes and WI-4 ships.
