---
branch: feat/feature-5-wi-5-test-connection
threadId: workflow-3lens+subagent-verify
rounds: 2
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #5 WI-5 (test-connection probe, #6)

Independent audit of `src/lib/providers/testConnection.ts` (+ `.test.ts`) — the headless
`probeProvider` for the "test connection" affordance. It makes ONE minimal authenticated call via the
RAW single-attempt `provider.stream()` (so retry/fallback can't mask the real connection state) and
reports `{ok:true, latencyMs}` or `{ok:false, kind}`, reusing `mapStreamError`.

Author/auditor separation (rule 48): implementing Claude authored. Round 1 was an **adversarial
3-lens workflow** (3 independent read-only agents: correctness/contract, security, coverage-honesty).
Round 2 was an independent verifier confirming the fixes. Codex unavailable — sanctioned subagent
fallback (recorded `workflow-3lens+subagent-verify`).

## Round 1 — 3-lens workflow

- **Correctness & contract — CLEAN.** Confirmed: raw single-attempt `stream()` (one fetch, no
  retry/fallback); first-byte timing + `break` releases the request via the native-generator `.return()`
  → fetchStream `finally`; `mapStreamError` reuse maps every kind correctly; **the probe request
  `{translate,'ping','en'}` PASSES `validateRequest`** (`resolveLanguage('en')`='English', non-empty) —
  never a spurious `validation`; zero-chunk clean stream → ok; timeoutMs forwarded (stream has no
  default). 1 Low (the "release" claim is asserted only indirectly via `toHaveBeenCalledOnce`).
- **Security — CHANGES_NEEDED (1 Medium).** The probe is safe by construction (`ProbeResult` has no
  detail field; only `kind` is surfaced; no logging/persistence). BUT the "never leaks the API key"
  test was **vacuous** — `JSON.stringify(res)` can never contain the body (no detail field), and the
  chosen token `sk-test-LEAK` is redacted by `sanitizeDetail` while the real fixture `sk-test` is not,
  so the test proved neither drop nor redaction.
- **Coverage honesty — CHANGES_NEEDED (2 Medium + 1 Low).** Excellent mock hygiene (fetch boundary +
  clock only; never mocks `mapStreamError`/provider logic). BUT: (M) the **in-stream `ProviderException`
  path** (refusal / `error` SSE event / incomplete — HTTP 200, routed via `toProviderError`, NOT
  `errorFromStatus`) was untested though a real probe hits it; (M) `toHaveBeenCalledOnce` only on the
  happy path is a **vacuous** single-attempt proof — never asserted on a RETRYABLE 429/500 where a
  rewired retrying probe would fire multiple fetches; (Low) the `Math.max(0, …)` backwards-clock clamp
  was unexercised.

All findings were **test-strength**, not implementation bugs — every lens confirmed the code correct.

## Round 1 → fixes (test-only; implementation unchanged)

- Replaced the vacuous leak test with **"drops the error detail"**: a `rejectingProvider` whose raw
  `stream()` rejects with a `ProviderException` carrying an un-redactable secret in `.detail`; asserts
  the secret is absent from the result and only `kind` is surfaced — proving the PROBE drops detail
  independent of redaction.
- Added 3 in-stream tests through the **real anthropic adapter** (HTTP 200): refusal stop_reason →
  `refusal`; `error` event `authentication_error` → `invalidKey`; truncated (`ping` only, no
  `message_stop`) → `incomplete`.
- Added a **no-retry** test: exactly one fetch on 429 AND 500 (retryable) — proves the probe never
  retries.
- Added a **backwards-clock** test: end < start → `latencyMs: 0`.

## Round 2 — independent verifier — CLEAN

Confirmed all 4 findings GENUINELY resolved (not papered over): the secret survives `sanitizeDetail`
and is dropped by the probe; the in-stream tests take the `toProviderError` route (distinct from the
HTTP table) through the real adapter; the no-retry test is meaningful on retryable statuses; the clamp
test is genuine. No tautologies introduced, no implementation drift. 580 tests, 100% coverage.

## Verdict

**ship-as-is.** Implementation correct and secure from round 1; the test suite was strengthened to
non-vacuously prove the load-bearing invariants (detail-drop, in-stream error mapping, no-retry, clamp).
