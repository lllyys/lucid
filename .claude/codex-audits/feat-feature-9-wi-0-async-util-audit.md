---
branch: feat/feature-9-wi-0-async-util
threadId: subagent-claude
rounds: 1
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #9 WI-0 (extract shared async primitives)

WI-0 of the self-hosted sync feature: extract the generic abortable-sleep + jittered-exponential-backoff
primitives (`realSleep`, `expBackoff`, `clampMs`) from the provider layer into a neutral
`src/lib/async/backoff.ts`, so the upcoming sync layer (WI-4) reuses them without cross-importing
`src/providers/**` internals (review Medium #9 — `retry.ts`'s `withRetry`/`backoffDelay` are provider-typed;
`realSleep` lived in `providers/index.ts`).

Author/auditor separation (rule 48): implementing Claude authored; a fresh independent in-harness `claude`
subagent (read-only) audited. Codex unavailable — `subagent-claude`.

## Round 1 — `subagent-claude` — CLEAN (zero findings)

- **Behavior-preserving:** `realSleep` byte-for-behavior identical to the version removed from index.ts;
  `clampMs` identical to retry.ts's private copy; `expBackoff` reproduces the old inline exponential branch
  exactly (`clampMs(random() * min(base*2^i, max), max)`). `backoffDelay` unchanged for both the
  rateLimited-`Retry-After` branch (still bounded by 60s, not `max`) and the exponential branch.
- **Imports repointed:** index.ts imports `realSleep` from `@/lib/async/backoff` for `defaultRetryDeps`
  (no longer defines/exports it); retry.ts imports `clampMs`+`expBackoff`; base.ts still imports
  `backoffDelay` from `./retry` (unchanged). No dangling `realSleep` import from `@/providers` anywhere.
- **Neutral module:** `backoff.ts` has zero imports + no domain types — genuinely shared (no cross-feature
  inversion).
- **Coverage:** 100% on `src/lib/async/**` — `clampMs` (finite/negative/non-finite), `expBackoff`
  (exp/jitter/clamp), `realSleep` (aborted-before/resolves/abort-during) all meaningfully tested; the moved
  realSleep tests were removed from index.test.ts (no duplicate/orphan).
- **No regression:** `pnpm check:all` green — 614 tests / 46 files + build; retry suite green.

## Verdict

**ship-as-is.** A clean, behavior-preserving extraction that unblocks the sync layer's reuse of the
abortable-sleep + backoff primitives without coupling it to the provider layer.
