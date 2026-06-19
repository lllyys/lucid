---
branch: fix/issue-126-test-connection-incomplete
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — bug #126 (test connection fails on a working OpenAI-compatible endpoint)

Independent separate-context Claude `auditor` (read-only, worktree); Codex quota-blocked (rule 48 via subagent).

## Fix
`src/lib/providers/testConnection.ts` — in `probeProvider`'s catch, an `incomplete` outcome now returns
`{ ok:true, latencyMs }` instead of `{ ok:false, kind:'incomplete' }`. The probe sends `maxOutputTokens: 1`,
so an OpenAI-compatible endpoint finishes with `finish_reason: 'length'` → `incomplete`, and a reasoning
model (deepseek-v4-flash) consumes the single token on hidden reasoning → the cap throws before any visible
byte (so the success-on-first-chunk `break` never fires). `incomplete` proves the endpoint replied + the key
is valid — the probe verifies reachability/auth, not completion. Tests: +1 (`rejectingProvider(incomplete)`
→ ok:true); the pre-existing "truncated stream → ok:false:incomplete" test flipped to ok:true (it encoded the
old buggy semantics). Header + function doc updated (rule 22).

## Verdict: ship-as-is — 0 Critical / 0 High / 0 Medium (2 Low)

Auditor traced every `ErrorKind` against `mapStreamError`/`fetchStream`: `incomplete` is emitted ONLY after
HTTP 200 + a clean SSE end (length/max_tokens/EOF-without-message_stop). Every transport failure surfaces as
`ProviderHttpError`→status-kind or TypeError/Timeout/Abort BEFORE the completion check — so auth (401/403→
invalidKey), rate-limit (429), outage (5xx/network→providerDown), bad-request (400→requestFailed), timeout,
and user-abort all still return `ok:false`. No genuine connection failure maps to `incomplete`; the fix masks
nothing. Success-on-first-chunk path + latency clamping unchanged; only the `incomplete` catch-branch changed.
Tests prove the fix and nothing meaningful was weakened (the flipped test corrects buggy-semantics, asserts a
concrete `{ok:true, latencyMs:0}`); all `ok:false` tests intact; 100% on the new branch. No `any` (prod), file
57 lines, no key leaked (catch reads only `outcome.error.kind`), no dead code.

### Low
| # | finding | resolution |
|---|---|---|
| A | header `Purpose:` block didn't mention the incomplete-is-connected semantics (function doc did). | **FIXED** — header now states the probe verifies reachability+auth, not completion. |
| B | `refusal` still returns `ok:false` (a refusal also proves connectivity). | By-design — scoped to `incomplete` (the bug); `refusal` is a distinct user-meaningful signal. No action. |

## Verification
Pure-logic fix at the provider-interface boundary → the RED→GREEN unit test IS the verification (fix-issue
Phase 6a). `pnpm check:all` green (lint + typecheck + 100% gated coverage + build).
