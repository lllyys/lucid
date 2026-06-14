---
branch: feat/feature-1-wi-3-transport-registry
threadId: 019ec62f-f5b0-7e40-b833-74034ef1c5ea
rounds: 3
final_verdict: ship-as-is
date: 2026-06-14
---

# Gate 4 — Implementation Audit: feature #1 WI-3 (transport + base + registry)

Independent Codex audit (read-only, gpt-5.5) of the `feat/feature-1-wi-3-transport-registry`
diff vs `main`, across **3 rounds** (the Gate-4 ceiling). threadIds: `019ec625…` (r1),
`019ec62a…` (r2), `019ec62f…` (r3). All findings resolved with regression tests.

## Round 1 (block-recommended) — all fixed

| severity | finding | resolution |
|---|---|---|
| High | `readSSE` filtered `[DONE]` globally (OpenAI-only) → vendor coupling in the framer | `readSSE` is now vendor-agnostic: yields every `data:` payload verbatim; `[DONE]` filtering is the OpenAI adapter's concern (#2). Proper SSE field parsing (colonless / no-space `data`). |
| Medium | `collectStream` returned `done` for a pre-aborted signal / abort-at-end | Checks `signal.aborted` before iterating and before returning `done` → `cancelled` (partial text retained) in both cases. |
| Medium | `await reader.cancel()` could hang and mask the outcome | Fire-and-forget `void reader.cancel().catch(() => {})`. |
| Low | colonless SSE `data` field ignored | Parsed per spec as `data: ""`. |
| Low | `modelChain` dedup removed only the first model | De-dupes the whole chain with `Set` (order preserved). |

## Round 2 (follow-up-recommended) — both fixed

| severity | finding | resolution |
|---|---|---|
| Medium | fire-and-forget cancel left the reader lock held if cancel never settles | `reader.releaseLock()` after initiating cancel; cleanup runs only when no read is in-flight, so it cannot throw. |
| Medium | stale capability metadata (under-reported context/output) | Corrected per the **claude-api skill catalog** (`shared/models.md`): 1M context window; Fable 5 / Opus 4.8 = 128K max output, Sonnet 4.6 = 64K. (The 200K figure elsewhere is the compaction threshold, not the window.) A test asserts the exact documented limits. |

## Round 3 (follow-up-recommended) — fixed in-WI

| severity | finding | resolution |
|---|---|---|
| Medium | a **synchronous** throw from `streamFn(...)` bypassed `collectStream`, so `translate()`/`polish()` would reject instead of returning a `ProviderOutcome` | `defineProvider` now wraps the vendor stream in a lazy `async function*` (`yield* streamFn(...)`) so even a sync throw lands inside `collectStream`'s try. Regression test: a sync-throwing `streamFn` yields `{status:'error'}`, never rejects. |

Round-2 items re-verified PASS in round 3 (reader-lock release safe in all reachable cleanup
paths; registry limits correct). The round-3 Medium was fixed after the ceiling with a
regression test rather than a 4th audit round (rule 47 Gate-4 caps at 3 rounds).

## Verdict

All Critical/High/Medium across 3 rounds resolved, each with a test. `pnpm check:all` green:
161 tests, 100% coverage on `stream.ts`/`base.ts`/`modelRegistry.ts`. **final_verdict: ship-as-is.**
