---
branch: feat/feature-1-wi-2-provider-contract
threadId: 019ec60d-f4b0-72e1-a337-691ed400d04c
rounds: 3
final_verdict: follow-up-recommended
date: 2026-06-14
---

# Gate 4 — Implementation Audit: feature #1 WI-2 (provider contract + retry)

Independent Codex audit (read-only, gpt-5.5) of the `feat/feature-1-wi-2-provider-contract`
diff vs `main`, across **3 rounds** (the Gate-4 ceiling). Codex threadIds:
`019ec602…` (r1), `019ec607…` (r2), `019ec60d…` (r3).

## Round 1 (verdict: block-recommended) — all resolved

| severity | finding | resolution |
|---|---|---|
| High | `Retry-After` capped by the 30s exponential `maxDelayMs`, shortening a 45–60s server delay. | **Fixed** (r1). `backoffDelay` honors `retryAfterMs` up to an independent 60s bound (`RATE_LIMIT_MAX_MS`), not the exp cap. |
| High | `ProviderError.detail` copied arbitrary error text verbatim → credential leak risk. | **Fixed** (r1→r3). Centralized `sanitizeDetail`; see redaction thread below. |
| Medium | `withRetry` trusted the mutable `retryable` flag alone. | **Fixed** (r1). New `isRetryableError` = transient-KIND allowlist AND the flag; a self-contradictory error can't be retried. |
| Medium | `retryAfterMs`/delays not validated → NaN/negative/Infinity reached `sleep`. | **Fixed** (r1). `clampMs` coerces to finite, non-negative, bounded before `sleep`. |
| Low | no-retry matrix missing `aborted`/`unknown` + contradictory/long/invalid-delay cases. | **Fixed** (r1). Matrix + cases added. |
| Low | "huge" Retry-After test didn't actually overflow to Infinity. | **Fixed** (r1). 400-digit test asserts the 60s clamp. |

## Redaction thread (rounds 1→3) — secret-leak prevention (rule 65 §5)

- r1: introduced `sanitizeDetail` (sk- keys, Bearer, key=value).
- r2 (block-recommended, finding 2a/2b): `sanitizeDetail` bypassable (uppercase `SK-`, JSON
  `"api_key":"x"`, Bearer with `+`/`/`/`=`); and `ProviderException` returned `providerError`
  verbatim. **Fixed**: extracted `src/providers/redact.ts` (case-insensitive sk-, full Bearer
  charset, quoted-JSON keys); imported by BOTH `errors.ts` and `types.ts`; `ProviderException`
  now sanitizes `detail` at construction (2b **PASS**).
- r3 (block-recommended, 2a still FAIL + new Medium):
  - **High** — OAuth `access_token=…` not redacted (bare `token` rule won't cross the `_`
    word-boundary). **Fixed**: added `access[_-]?token` / `refresh[_-]?token` / `client[_-]?secret`
    to the keyword set + tests (query-string, JSON). 2a now closed.
  - **Medium** — the exported structural `ProviderError` *permits* a hand-built error with raw
    `detail`, bypassing the construction funnels. **DEFERRED to WI-3 with a concrete plan**
    (accepted with rationale, see below).

## Accepted / deferred (with rationale)

**Medium — opaque/factory-only `ProviderError`.** Every *real* construction path in WI-2 sanitizes:
`makeProviderError`, `errorFromStatus`, `toProviderError`, and the `ProviderException` constructor
all funnel `detail` through `redact.sanitizeDetail`. No WI-2 code path emits an unsanitized
`ProviderError`. Making the type opaque/branded is a cross-cutting change touching every WI-3/5/6
construction site; doing it ad hoc in WI-2 is disproportionate. Instead, the auditor's alternative
fix — **"sanitize at the final outcome boundary"** — is adopted and **scheduled in WI-3**:
`collectStream` will run `error.detail` through `sanitizeDetail` when it builds an error
`ProviderOutcome`, a defense-in-depth net that scrubs even a hand-built error before it surfaces
(recorded in the plan's `base.test.ts` line). This is a follow-up, not an open leak.

## Verdict

3-round ceiling reached (rule 47 Gate 4 max-3-rounds). All Critical/High resolved; the one residual
Medium is deferred to WI-3 with a concrete, tested plan. `pnpm check:all` green: 100 tests, 100%
coverage on `errors.ts`/`retry.ts`/`redact.ts` (`types.ts` excluded). **final_verdict:
follow-up-recommended** (follow-up = WI-3 outcome-boundary sanitization).
