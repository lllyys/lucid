---
branch: feat/feature-1-wi-5-anthropic
threadId: 019ec654-05e4-7351-aaff-5dc4c920545b
rounds: 3
final_verdict: ship-as-is
date: 2026-06-14
---

# Gate 4 — Implementation Audit: feature #1 WI-5 (Anthropic provider + factory)

Independent Codex audit (read-only, gpt-5.5), **3 rounds** (the Gate-4 ceiling). threadIds:
`019ec64c…` (r1), `019ec651…` (r2), `019ec654…` (r3). No Critical/High at any round — the
**API key never leaks** (only in the `x-api-key` header; absent from URL/body/detail/logs,
re-verified each round). All Medium/Low resolved with tests.

## Round 1 (block-recommended) — all fixed

| severity | finding | resolution |
|---|---|---|
| Medium | streamed `error` always mapped to retryable `providerDown` | `streamErrorKind` maps Anthropic error types to the right kind (see thread). |
| Medium | `model_context_window_exceeded` treated as a silent `done` | `isTruncationStop` (with `max_tokens`) → `incomplete`. |
| Medium | `realSleep` leaked its abort listener on normal timer completion | single `settle()` clears the timer AND removes the listener on both paths. |
| Low | `JSON.parse(... as SSEEvent)` accepted `null`/primitives | validate parsed is a non-null object before use → `requestFailed`. |
| Low | empty `text_delta` set `produced=true`, blocking refusal fallback | `produced` set only for non-empty text. |
| Low | `maxOutputTokens` override unclamped | `sizeMaxTokens` clamps to `[1, capability]`; non-finite → capability. |

## Error-mapping thread (rounds 1→3)

- r1: all stream errors → `providerDown`. Fixed with `streamErrorKind`.
- r2 (FAIL): mapping missed `billing_error` / `request_too_large` (→ `requestFailed`) and
  `timeout_error` (→ `timeout`). **Fixed** + tests. Also r2 Low: arrays passed the object
  check (`data: []`) — **fixed** with `Array.isArray` → `requestFailed`.
- r3 (Medium): HTTP **504** (`classifyStatus`, errors.ts) mapped to `providerDown` (3 retries)
  although 504 is a gateway timeout. **Fixed**: `classifyStatus(504) → timeout` (retried once);
  tests in `errors.test.ts` + the provider HTTP matrix.

## Verdict

All Critical/High/Medium across 3 rounds resolved with regression tests. API-key hygiene,
request shape (POST `/v1/messages`, correct headers, `model`/`max_tokens`/`system`/one user
message/`stream:true`, no `thinking`/`temperature`), SSE event handling, abort/timeout
propagation, refusal-fallback logic, and `realSleep` cleanup all pass. `pnpm check:all` green:
236 tests, 100% coverage on the provider layer. **final_verdict: ship-as-is.**
