# Feature #1 — Project Scaffold

> Status: **PLANNED** (Gate 1 + Gate 2 complete; user-accepted at the round-3 audit ceiling on
> 2026-06-14; Gate 3 TDD build starting at WI-1) · GH: #1
> Tracker row: `docs/features.md` #1

## Revision history

| Rev | Date | Change |
|-----|------|--------|
| v1 | 2026-06-14 | Initial plan (Gate 1). |
| v2 | 2026-06-14 | Gate 2 round 1 (Codex, MAJOR GAPS) → rewrite. Fixed `message_stop` (not `[DONE]`), `content-type` header, retry module, Fable-5 default + `stop_reason`, abort/timeout provenance + deadline-through-body + reader cleanup, `ProviderOutcome`/`OperationState` split, concrete signatures, Node engines/lockfile, coverage globs, re-sequenced WIs. |
| v3 | 2026-06-14 | Gate 2 round 2 (Codex, NEEDS REVISION; 8/9 round-1 items PASS, item-1 FAIL) → rewrite. Fixed: **event-framed `readSSE`** (blank-line-delimited, multi-`data:` concat, streaming `TextDecoder`, boundary-split + mid-UTF-8 tests); **model fallback** (`withFallback` consumes the ordered registry list — distinct from same-model `withRetry`); **abort-aware retry** (signal threaded into `withRetry` + abort-aware sleep); **domain edge-case test catalogue** (empty/huge/CJK/RTL/mixed/emoji/placeholders/markdown/code/URLs/malformed-JSON/input-validation); **vendor `implemented` metadata** (store can't select/ready an unimplemented vendor); **`anthropicProvider.ts`** filename (rule 65 §1); **registry capability schema**; **request-aware output budget** + input cap; **idempotent best-effort cleanup**; **typed `ProviderException extends Error`**; **concrete dependency manifest**; **flat dot i18n keys** (`error.rateLimited`). Scope-deferred: operation-lifecycle cancellation on vendor switch (store stays config-only — see Scope). See "Audit fixes applied (round 2 → v3)". |
| v4 | 2026-06-14 | Gate 2 round 3 (Codex, NEEDS REVISION; 9/14 round-2 items PASS — every Medium + scope-deferral + manifest cleared, architecture confirmed sound) → **round-3 ceiling reached** (rule 47 max-3-rounds). Applied the 5 residual *precision* fixes (no design change): threaded explicit per-attempt `model` through `StreamOptions.model` + `withFallback`/composition so the contract typechecks and respects the user-selected model; made `withRetry`'s `AbortSignal` explicit in the signature (`policy.signal`) + composition; specified SSE `data:` join as `\n` and accept **CR-only / LF / CRLF** line endings; added an explicit **malformed-`data:`-JSON** test (before and after partial output); named + documented `anthropic-dangerous-direct-browser-access` as browser-transport-specific (not part of `LLMProvider`). **Escalated to user** per rule 47 Gate 2 — recommend ACCEPT. See "Audit fixes applied (round 3 → v4)". |

---

## Problem

lucid has no application code — only the `.claude/` toolkit and instruction docs. Every
translation/polish feature depends on a working foundation: a Vite + React 19 + TypeScript app
that builds and runs, the **single `LLMProvider` architecture** of
`.claude/rules/65-llm-provider-integration.md` (interface, registry, streaming, **resilience**,
error mapping), app state, localizable UI, and a green `pnpm check:all` gate. This feature builds
that foundation — the prerequisite for feature work, nothing more.

## Scope

**In scope:** build tooling + `pnpm check:all`; a minimal running app shell; the **provider core**
(interface + result/error types + typed `ProviderException`, central registry with capability
metadata + ordered fallbacks, event-framed streaming transport with abort/timeout, **same-model
retry/backoff** and **cross-model fallback**, error mapping, and the **Anthropic** reference
implementation behind a factory); versioned/tested prompt builders + request validation; a Zustand
**configuration** store (active vendor + model + readiness); an i18n scaffold; tests for every logic
module with a 100%-coverage gate scoped to the logic layer.

**Out of scope** (later features, with rationale):

- OpenAI/Gemini/Ollama implementations (#2 — the interface + `implemented` registry flag here make
  them drop-in; until then the store/factory refuse to select or construct them).
- The translation/polish UI and accept/reject diff view (#3+).
- **Operation lifecycle** — running a translate/polish operation, owning live `OperationState`, and
  **cancelling/superseding an in-flight operation on vendor switch** (the round-2 stale-completion
  concern). This feature's store is **configuration-only** (vendor/model/readiness); `OperationState`
  is *defined* here as the forward-compat contract but is *owned and driven* by the behavioral
  feature (#3) that actually starts operations. Generation/request-id cancellation lands there, where
  there is an operation to cancel. Documented so the boundary is explicit, not hand-waved.
- **Input chunking** for documents larger than the per-request output budget (#3+) — this feature
  caps input at `MAX_INPUT_CHARS` and returns a clear validation error above it; it does not split.
- Secure key storage beyond in-memory (future server/proxy boundary, rule 65 §5); settings UI; full
  shadcn set.

## Interface signatures (concrete — `src/providers/types.ts`)

```ts
export type Vendor = 'anthropic' | 'openai' | 'gemini' | 'ollama'
export type PolishGoal = 'clarity' | 'tone' | 'grammar' | 'concise'
export const POLISH_GOALS: readonly PolishGoal[] = ['clarity', 'tone', 'grammar', 'concise']

export interface TranslateRequest { kind: 'translate'; text: string; targetLang: string; sourceLang?: string }
export interface PolishRequest    { kind: 'polish';    text: string; goal: PolishGoal;   lang?: string }
export type LLMRequest = TranslateRequest | PolishRequest

export interface StreamChunk  { text: string }
export interface StreamOptions { signal?: AbortSignal; timeoutMs?: number; maxOutputTokens?: number; model?: string }
export interface ProviderConfig { apiKey?: string; model?: string; baseUrl?: string; fetch?: typeof fetch }

export type ErrorKind =
  | 'rateLimited' | 'providerDown' | 'invalidKey' | 'requestFailed'
  | 'timeout' | 'aborted' | 'refusal' | 'incomplete' | 'validation' | 'unknown'

export interface ProviderError {
  kind: ErrorKind
  messageKey: string         // flat dot key per rule 66 §5, e.g. 'error.rateLimited'
  retryable: boolean         // same-model transient retry eligibility
  fallbackable?: boolean     // cross-model degradation eligibility (model-unavailable / zero-output refusal)
  retryAfterMs?: number      // bounded, parsed from Retry-After (seconds OR HTTP-date)
  detail?: string            // dev-only; NEVER secrets
}

// Typed throwable: stream() throws THIS (a real Error subclass), never a bare ProviderError object.
export class ProviderException extends Error {
  constructor(readonly providerError: ProviderError) { super(providerError.kind) }
}

// Terminal result of a collect-to-completion call (translate/polish):
export type ProviderOutcome =
  | { status: 'done';      text: string }
  | { status: 'cancelled'; text: string }                         // user abort; partial text retained
  | { status: 'error';     text: string; error: ProviderError }   // partial text retained

// UI/store lifecycle (DEFINED here, OWNED by the operation-running store in #3, not by this feature):
export type OperationState =
  | { status: 'idle' }
  | { status: 'streaming'; text: string }
  | ProviderOutcome

export interface LLMProvider {
  readonly vendor: Vendor
  readonly model: string
  stream(request: LLMRequest, options?: StreamOptions): AsyncIterable<StreamChunk>   // canonical, single-attempt, throws ProviderException
  translate(request: TranslateRequest, options?: StreamOptions): Promise<ProviderOutcome>  // collect + retry-if-no-bytes
  polish(request: PolishRequest, options?: StreamOptions): Promise<ProviderOutcome>
}
```

`VendorStreamFn` and other adapter mechanics are **internal to `base.ts`**, not exported from
`types.ts`. `stream()` is canonical and throws a typed `ProviderException` (carrying the mapped
`ProviderError`) on failure; `translate()`/`polish()` are collect-to-completion conveniences that
catch it and return `Promise<ProviderOutcome>`.

### Model registry schema (`src/providers/modelRegistry.ts`)

```ts
export interface ModelCapability {
  id: string                 // the only place model-ID literals live (rule 65 §2)
  contextWindow: number
  maxOutputTokens: number
  streaming: boolean
  vision: boolean
  costTier: 'low' | 'medium' | 'high'
}

export interface VendorRegistryEntry {
  vendor: Vendor
  implemented: boolean        // false for openai/gemini/ollama in this feature
  defaultModel: string        // latest capable; Anthropic → 'claude-fable-5'
  fallbacks: string[]         // ordered, consumed by withFallback (rule 65 §2)
  models: Record<string, ModelCapability>
}

// resolveModel(vendor, requested?) → requested if known, else defaultModel.
// modelChain(vendor, selected?) → [resolveModel(vendor, selected), ...fallbacks not already first] for withFallback.
// capabilityOf(vendor, model) → ModelCapability (drives the per-attempt maxOutputTokens ceiling).
// isVendorImplemented(vendor) → entry.implemented.
```

## Streaming & completion protocol (event-framed)

- **`readSSE` parses events, not lines.** It buffers bytes through a streaming `TextDecoder({stream:true})`,
  normalizes line endings (accepts **CR-only, LF, and CRLF**), splits the buffer on the SSE event
  delimiter (a blank line: `\n\n`, `\r\n\r\n`, or `\r\r`), and for each event **joins its `data:` fields
  with `\n`** (per the SSE spec a single event may carry multiple `data:` lines) into one payload before
  yielding. A trailing partial event stays buffered until more bytes arrive — a `data:` line or JSON
  object split across two network reads is reassembled, never parsed half-formed. `[DONE]` is
  recognized only as an OpenAI sentinel (ignored for Anthropic; kept for #2).
- **Anthropic** (`anthropicProvider.ts`) switches on the parsed JSON `type` of each event payload:
  - `content_block_delta` → yield `delta.text`.
  - `message_delta` → capture `stop_reason` (`end_turn` | `max_tokens` | `refusal` | …).
  - `message_stop` → normal completion (mark "saw stop"); `message_start`/`content_block_start`/
    `content_block_stop`/`ping` → ignored.
  - `error` (e.g. `overloaded_error`) → throw a `ProviderException` (mid-stream, before or after deltas).
- **Early-end**: if the reader reaches EOF **without** a `message_stop`, throw an `incomplete`
  `ProviderException` — `collectStream` returns `error` with the retained partial text, never a silent `done`.
- **`stop_reason` handling** (matters for Fable 5, the default): `refusal` → `error` kind `refusal`,
  marked `fallbackable` only when **zero output** was streamed (HTTP 200, possibly empty); `max_tokens`
  → `incomplete` (partial retained, non-retryable). Malformed event `data:` JSON → `requestFailed`
  (logged detail, never raw to UI).
- **Request headers** are an `anthropicProvider.ts` transport detail, **not** part of the
  `LLMProvider` contract: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`,
  and `anthropic-dangerous-direct-browser-access: true`. The last is required **only** because lucid
  calls the Messages API directly from the browser (rule 65 §5 client-side keys) — it is
  browser-transport-specific, not a universal Messages API requirement, and would disappear behind a
  future server/proxy.

## Abort, timeout & cleanup

- `fetchStream` composes the caller's `signal` with a **deadline** signal. Provenance is preserved:
  the timeout aborts with `new DOMException('timeout','TimeoutError')`; a caller abort forwards the
  caller's reason. `toProviderError` maps `TimeoutError` → `timeout` (retryable once), `AbortError`
  → `aborted` → `cancelled`.
- The deadline stays **active through body consumption** (a stalled stream body aborts on the same
  controller) — it is NOT cleared when `fetch()` resolves headers.
- The stream generator's `finally` runs **idempotent best-effort cleanup**: cancel the reader and
  abort the controller, each guarded so a `reader.cancel()` rejection (it can reject after EOF/abort)
  is swallowed and can **never** replace the primary outcome or the original `ProviderException`.
  `collectStream` also stops on `signal.aborted` and returns `cancelled` with partial text.

## Resilience: same-model retry + cross-model fallback (rule 65 §4 + §2)

Two distinct mechanisms, never conflated:

- **`src/providers/retry.ts` — `withRetry(attempt, policy, deps)`** (same model, transient errors),
  where `policy` carries the abort signal: `policy: { maxAttempts?: number; signal?: AbortSignal }`,
  `deps: { sleep: (ms: number, signal?: AbortSignal) => Promise<void>; random: () => number }`:
  - `attempt: () => Promise<ProviderOutcome>`.
  - Retries ONLY when `outcome.status === 'error' && outcome.error.retryable && outcome.text === ''`
    (no bytes streamed). NEVER retries: `cancelled`, a non-retryable error
    (`invalidKey`/`requestFailed`/`refusal`/`incomplete`/`validation`), or any outcome with partial text.
  - Backoff: exponential + jitter; honors `retryAfterMs` for `rateLimited`; `timeout` retried once.
  - **Abort-aware**: `deps.sleep(ms, policy.signal)` short-circuits on abort; `withRetry` checks
    `policy.signal?.aborted` before each attempt, before sleep, and after sleep, and returns
    `cancelled` without starting another attempt.
  - `maxAttempts` default 3. `deps` injected so tests are deterministic.
- **`withFallback(chain, run)`** (cross model, in `base.ts`/`index.ts`): `chain = modelChain(vendor,
  opts.model)` (the resolved selected model first, then registry fallbacks); `run(model)` is invoked
  per attempted model. Advances to the next model ONLY when the outcome is an `error` whose
  `error.fallbackable` is true **and zero bytes streamed** (model-unavailable, or a zero-output Fable
  refusal). NEVER replays after partial output, on `cancelled`, or on non-fallbackable errors. This is
  what makes the ordered registry list actually degrade "without code changes" (rule 65 §2).
- Composition: `translate()`/`polish()` = `withFallback(modelChain(vendor, opts.model), (model) =>
  withRetry(() => collectStream(stream(req, { ...opts, model })), { maxAttempts: 3, signal: opts.signal }, deps))`.
  Each attempt streams with an explicit per-attempt `model` (valid because `StreamOptions.model` exists);
  `anthropicProvider` caps that attempt's output at `capabilityOf(vendor, model).maxOutputTokens` unless
  `opts.maxOutputTokens` overrides. `stream()` itself is single-attempt.

## Surface area (file-by-file)

- **Build/config** — concrete manifest (WI-1). `package.json`:
  - scripts: `dev` (vite), `build` (`tsc -b && vite build`), `preview`, `lint` (eslint),
    `typecheck` (`tsc -b --noEmit`), `test`, `test:watch`, `test:coverage` (`vitest run --coverage`),
    **`check:all`** (`pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`).
  - `engines.node >= 20.19`; `packageManager: pnpm@<pinned>`; commit `pnpm-lock.yaml`; exact-resolved ranges.
  - deps: `react`, `react-dom`, `zustand`, `i18next`, `react-i18next`.
  - devDeps: `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `typescript`,
    `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
    `@testing-library/user-event`, `eslint`, `@eslint/js`, `typescript-eslint`,
    `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `@types/react`, `@types/react-dom`.
  - `tsconfig.{json,app,node}.json` (strict, `@/*`→`src/*`), `vite.config.ts` (`react()`+`tailwindcss()`,
    `@` alias, `test` block from `vitest/config`: `environment:'jsdom'`, `setupFiles`, coverage v8 +
    `json-summary`/`text`, **include** `['src/providers/**/*.{ts,tsx}','src/lib/**/*.{ts,tsx}','src/stores/**/*.{ts,tsx}']`,
    **exclude** `['**/*.test.*','src/providers/types.ts']`, thresholds 100), `eslint.config.js`,
    `index.html`, `.gitignore`.
- **App shell:** `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/test/setup.ts`.
- **Provider core:** `types.ts` (signatures above incl. `ProviderException`), `errors.ts`
  (`isAbortError`, `classifyStatus`, `parseRetryAfter`, `toProviderError`), `retry.ts` (`withRetry`,
  abort-aware `sleep`), `stream.ts` (`ProviderHttpError`, `fetchStream`, `readSSE` event-framed,
  streaming-`TextDecoder` buffering), `base.ts` (`collectStream`, `defineProvider`, `withFallback`,
  internal `VendorStreamFn`), `modelRegistry.ts` (schema above), `anthropicProvider.ts`, `index.ts`
  (`createProvider`; unimplemented vendors throw a `validation`/`requestFailed` `ProviderException`).
- **Prompts + validation:** `src/lib/prompts/index.ts` (`buildPrompt`, `validateRequest` — empty/
  whitespace-only input, oversized > `MAX_INPUT_CHARS`, unknown `goal`/empty `targetLang` → `validation`).
- **Store:** `src/stores/providerStore.ts` (config-only). **i18n:** `src/i18n.ts`,
  `src/locales/en/translation.json` (single namespace, flat dot keys `error.*`, `common.*`).

## Work-item sequencing

Tier definition: **foundational** = no user-facing UI surface; verified by unit + integration tests
(the whole provider layer qualifies). **behavioral** = changes the running app's user-facing behavior
(only the final wiring WI).

| WI | Title | Tier | PR |
|----|-------|------|----|
| WI-1 | Build tooling + app shell; concrete manifest, `engines`/`packageManager`/lockfile; `pnpm check:all` green | foundational | M |
| WI-2 | Provider contract + `ProviderException` + error mapping + abort-aware retry — `types.ts`, `errors.ts`, `retry.ts` + tests | foundational | M |
| WI-3 | Transport + base + registry + fallback — `stream.ts` (event-framed SSE), `base.ts` (`collectStream`/`withFallback`), `modelRegistry.ts` (schema + capabilities + `implemented`) + tests | foundational | M |
| WI-4 | Prompt builders + request validation — `lib/prompts` (`buildPrompt`, `validateRequest`) + edge-case tests | foundational | S |
| WI-5 | Anthropic provider + factory — `anthropicProvider.ts`, `index.ts` (event-framed parse / stop_reason / mid-stream error / content-type / refusal-fallback) + retry+fallback wiring + mocked-fetch tests | foundational | M |
| WI-6 | Provider config store — `stores/providerStore.ts` (atomic `setVendor`, refuses unimplemented vendors) + tests | foundational | S |
| WI-7 | i18n + App wiring + final integration test | behavioral (final) | M |

7 WIs, each independently green.

## Test catalogue

- `errors.test.ts` — `classifyStatus` 401/403/429(+Retry-After)/500/overloaded/other-4xx;
  `parseRetryAfter` seconds / HTTP-date / negative / past-date / NaN / huge → bounded ms;
  `toProviderError` abort vs timeout vs TypeError vs unknown; `isAbortError`; `fallbackable` set for
  model-unavailable + zero-output refusal only.
- `retry.test.ts` — retries 429 (honors retryAfterMs) / 5xx / network / timeout-once; NEVER retries
  abort / 4xx auth / refusal / incomplete / validation / partial-bytes; backoff with injected
  `sleep`+`random`; **abort during backoff** (signal trips before sleep, during sleep, before next
  attempt → `cancelled`, no extra attempt); max-attempts exhaustion → last error.
- `stream.test.ts` — `fetchStream` default-vs-injected fetch, signal absent/present/pre-aborted,
  timeout fires (fake timers), **deadline survives header-resolve and aborts a stalled body**, non-2xx
  → `ProviderHttpError`; **idempotent cleanup** (reader/controller cancelled in `finally`;
  `reader.cancel()` rejection after success / after timeout / after provider error does NOT mask the
  primary outcome); `readSSE` **event framing**: multi-`data:` fields joined with `\n`, event split
  across two reads, JSON split across two reads, **mid-UTF-8 code point split**, **CR-only / LF / CRLF
  / mixed** line endings, ignored non-data fields / comments / `ping`, OpenAI `[DONE]` sentinel.
- `base.test.ts` — `collectStream` done / cancelled (mid-abort + thrown-abort) / error
  (`ProviderHttpError` + `ProviderException` + generic) / **incomplete (EOF, partial retained)**;
  `withFallback` advances on zero-output fallbackable error, STOPS on partial/cancelled/non-fallbackable,
  exhausts chain → last error; `defineProvider` translate/polish return `ProviderOutcome`.
- `modelRegistry.test.ts` — Anthropic default `claude-fable-5`; fallbacks `['claude-opus-4-8','claude-sonnet-4-6']`;
  every model entry has complete `ModelCapability`; `resolveModel` known/unknown/none; `modelChain(vendor,
  selected?)` puts the resolved selected model first then dedups fallbacks (selected absent / selected =
  a fallback / unknown selected); `capabilityOf` per model; `isVendorImplemented` true for anthropic,
  false for the other three.
- `anthropicProvider.test.ts` — mocked-fetch SSE `ReadableStream`: text deltas via `content_block_delta`;
  `message_stop` → done; **EOF w/o message_stop → incomplete**; `message_delta.stop_reason:refusal`
  with zero output → fallbackable refusal; with partial output → non-fallbackable; `max_tokens` →
  incomplete; mid-stream `event:error` (overloaded) → providerDown, before AND after deltas; abort →
  cancelled; **malformed event `data:` JSON → `requestFailed`, tested both before any delta (empty
  text) and after partial deltas (partial retained)**; 429/500/401 → mapped; asserts `content-type`,
  `x-api-key`, `anthropic-version`, and `anthropic-dangerous-direct-browser-access`; request body
  sends no `thinking`/`temperature`; respects per-attempt `maxOutputTokens` from options/registry.
- `index.test.ts` — `createProvider('anthropic')` resolves model + builds; `createProvider('openai'|'gemini'|'ollama')`
  throws a mapped `ProviderException` (not implemented).
- `prompts/index.test.ts` — `buildPrompt` structure-preservation instruction present; target lang /
  each goal interpolated; routes translate vs polish; **`validateRequest`** edge cases: empty /
  whitespace-only input → `validation`; input > `MAX_INPUT_CHARS` → `validation`; unknown goal /
  empty targetLang → `validation`; **domain fixtures preserved**: CJK (no spaces), RTL (Arabic/Hebrew),
  mixed-script, emoji/grapheme clusters, placeholders (`{name}`/`%s`/`{{count}}`), Markdown lists,
  fenced + inline code, URLs — asserted to pass through the prompt untranslated/structurally intact.
- `providerStore.test.ts` — actions via `getState()`; `setVendor` atomically sets vendor + its default
  model; **`setVendor` on an unimplemented vendor is refused (state unchanged) / never becomes ready**;
  rapid repeated switching converges; reset is atomic; `isReady()` requires implemented vendor + apiKey.
- `App` smoke test (WI-7) — renders; reads store; provider construction via mocked fetch; an i18n
  `error.*` key round-trips through `t()`.

## Risks + mitigations

| Risk | Mitigation |
|------|-----------|
| Anthropic protocol drift (events, model IDs) | Consult `claude-api` skill before WI-5; switch on JSON `type`; IDs only in registry. |
| SSE framing (split events / JSON / UTF-8) | Event-framed `readSSE` with streaming `TextDecoder` + buffered partial event; boundary-split tests incl. mid-code-point. |
| Fable-5 refusal / thinking eats `max_tokens` | `stop_reason` → refusal/incomplete; **zero-output refusal is fallbackable** to next chain model; request-aware `maxOutputTokens` from registry capability; input capped at `MAX_INPUT_CHARS` (chunking deferred to #3). |
| Retry runs through an abort | Abort-aware `sleep(ms, signal)`; signal checked before/around sleep and before each attempt. |
| Selecting an unimplemented vendor | Registry `implemented` flag; store refuses it; factory throws a mapped error. |
| Abort/timeout conflation, stalled-body hang, leaked/rejecting readers | Distinct abort reasons; deadline through body; idempotent best-effort cleanup that can't mask the primary outcome. |
| 100% coverage on transport/retry/fallback | Fake timers, `vi.stubGlobal('fetch')`, injected `sleep`/`random`, mocked `ReadableStream`; explicit coverage globs. |
| Node/Vite 7 version floor | `engines.node >= 20.19`; commit lockfile; pin `packageManager`. |

## Backward compatibility

Greenfield — none. The provider **interface + `ProviderOutcome`/`OperationState` split + registry
`implemented` flag** is the forward-compat contract: #2 adds the other vendors behind it (flip
`implemented` + add the impl file) with zero caller/store change; #3 takes ownership of `OperationState`
and operation cancellation.

## Audit fixes applied (Gate 2, round 1 → v2)

Resolved in v2 (all PASS on round-2 re-verification except item 1): `message_stop` not `[DONE]`;
`content-type` header; retry module; `incomplete` on early EOF; abort/timeout provenance + deadline +
cleanup; Fable-5 default + `stop_reason`; concrete signatures; `ProviderOutcome`/`OperationState` split;
mid-stream `error`; `VendorStreamFn` internal; Node engines/lockfile/coverage globs/tiering/atomic `setVendor`.

## Audit fixes applied (Gate 2, round 2 → v3)

Round-2 verdict NEEDS REVISION. All High/Medium resolved; both Low fixed:
- **H (item-1 FAIL)** Event-framed `readSSE`: blank-line-delimited events, multi-`data:` concat,
  streaming `TextDecoder`, buffered partial event; boundary-split + mid-UTF-8 tests.
- **H** `withFallback` consumes the ordered registry chain (rule 65 §2) — distinct from same-model
  `withRetry`; fallback only on zero-output fallbackable errors; never after partial output.
- **H** Abort-aware `withRetry` (`sleep(ms, signal)`; signal checked before/around sleep + each attempt).
- **H** Domain edge-case test catalogue (empty/huge/CJK/RTL/mixed/emoji/placeholders/markdown/code/
  URLs/malformed-JSON) + `validateRequest`.
- **H** Registry `implemented` flag; store refuses unimplemented vendor; factory throws.
- **M** Filename `anthropicProvider.ts` (rule 65 §1).
- **M** `ModelCapability` schema (contextWindow/maxOutputTokens/streaming/vision/costTier) + tests.
- **M** Request-aware `maxOutputTokens` from registry; `MAX_INPUT_CHARS` cap; chunking deferred (#3).
- **M** Idempotent best-effort cleanup that can't mask the primary outcome + cancel-rejection tests.
- **M** Typed `ProviderException extends Error` carrying `ProviderError`; `stream()` throws it.
- **M** Concrete dependency manifest (deps/devDeps/scripts incl. `@vitest/coverage-v8`, jsdom, Testing
  Library, ESLint plugins, `typecheck`).
- **M (scope-deferred, rationale)** Stale async completion: store is **configuration-only** this feature;
  `OperationState` ownership + cancellation-on-switch belongs to #3 (no operation exists to cancel yet).
- **L** Flat dot i18n keys `error.rateLimited` (rule 66 §5); single namespace.
- **L** Browser-direct header documented as browser-transport-specific, not a universal API requirement.

## Audit fixes applied (Gate 2, round 3 → v4) — round-3 ceiling

Round-3 verdict NEEDS REVISION, but the auditor cleared the substance: "scope-deferring operation
lifecycle to feature #3 is legitimate ... no current correctness hole"; "the dependency manifest is
sufficient ... can support a green `check:all`"; 9/14 round-2 items PASS (every Medium + manifest +
scope-deferral + filename + schema + cleanup + `ProviderException` + i18n keys). The 5 residual items
are *specification-precision* corrections, not design changes — all applied in v4:
- **H** Cross-model fallback now type-implementable: `StreamOptions.model?` added; the attempt fn takes
  an explicit `model`; composition is `withFallback(modelChain(vendor, opts.model), (model) => withRetry(
  () => collectStream(stream(req, { ...opts, model })), …))`; `modelChain` starts at the resolved
  *selected* model; per-attempt output cap via `capabilityOf(vendor, model)`.
- **H** `withRetry`'s `AbortSignal` is explicit in the signature (`policy.signal`) and passed in the composition.
- **H** Explicit malformed-`data:`-JSON test added (before any delta → empty-text error; after partial
  deltas → partial retained) — distinct from the JSON-split-across-reads (reassembly) test.
- **M** SSE precision: `data:` fields joined with `\n` (per spec, not raw concat); line-ending handling
  accepts CR-only / LF / CRLF / mixed, with tests.
- **L** `anthropic-dangerous-direct-browser-access` named and documented as browser-direct transport
  behavior (not part of `LLMProvider`), in the streaming protocol section.

**Round-3 ceiling decision (rule 47 Gate 2):** max audit rounds (3) reached. Remaining findings were
all mechanical and are fixed above with no architectural change; a 4th Codex round is disallowed by the
rule. Escalated to the user — **user ACCEPTED on 2026-06-14** (any further drift is caught by Gate 4
per-WI audits during TDD). Gate 2 closed; `docs/features.md` #1 → `PLANNED`; Gate 3 build proceeds.

## Definition of Done

`pnpm check:all` green (lint + typecheck + 100% logic coverage + build); `pnpm dev` serves a running
app; `createProvider('anthropic', {apiKey, fetch})` streams a translate/polish result and correctly
handles event-framed SSE, `message_stop`, mid-stream error, abort (cancelled), timeout, refusal
(with zero-output fallback), `max_tokens` incomplete, retry-when-no-bytes, and cross-model fallback
per rule 65; selecting an unimplemented vendor is refused; all 7 WIs merged; Gate 5b acceptance
evidence recorded.
