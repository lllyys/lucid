# Architecture — LLM provider layer

The defining architecture of lucid: **all model access goes through one provider
abstraction** (`.claude/rules/65-llm-provider-integration.md`). UI and feature code depend
on the interface and the shared result/error types — never on a vendor SDK.

> Status: built incrementally by feature #1 (project scaffold). This doc describes the
> contract + resilience model as they land; sections marked _(WI-N)_ note where each piece
> is implemented.

## The contract (`src/providers/types.ts`) — WI-2

```
LLMProvider {
  vendor, model
  stream(request, options?)   // canonical, single-attempt, throws ProviderException
  translate(request, options?) -> Promise<ProviderOutcome>   // collect + retry/fallback
  polish(request, options?)    -> Promise<ProviderOutcome>
}
```

- **Requests** are a discriminated union: `TranslateRequest | PolishRequest`.
- **`ProviderOutcome`** (`done | cancelled | error`) is the terminal result of a
  collect-to-completion call. **`OperationState`** (`idle | streaming | ProviderOutcome`)
  is the UI/store lifecycle — *defined* here, *owned* by the operation store in feature #3.
  Keeping the two split is the forward-compat contract.
- **`ProviderError`** carries `kind` (a closed `ErrorKind` union), an i18n `messageKey`
  (flat dot, e.g. `error.rateLimited`), `retryable`, optional `fallbackable` /
  `retryAfterMs`, and a dev-only `detail`. **`ProviderException`** is the typed throwable
  that wraps it (what `stream()` throws).

## Error model (`src/providers/errors.ts`) — WI-2

Raw failures → `ProviderError` via `classifyStatus` (401/403→invalidKey, 429→rateLimited,
5xx→providerDown, 4xx→requestFailed), `parseRetryAfter` (delta-seconds or HTTP-date →
bounded ms), `errorFromStatus`, and `toProviderError` (abort vs timeout vs network vs
ProviderException vs unknown). `isRetryableError` = a transient-KIND allowlist **and** the
`retryable` flag, so a self-contradictory error can never be retried.

## Secret hygiene (`src/providers/redact.ts`) — WI-2

`detail` is dev-only diagnostics and must never carry a credential (rule 65 §5).
`sanitizeDetail` redacts sk-/API keys, Bearer tokens, OAuth `access_token`/`refresh_token`/
`client_secret`, and quoted-JSON `key:value` secrets. It is funneled through by
`makeProviderError`, `errorFromStatus`, `toProviderError`, and the `ProviderException`
constructor — no construction path can carry a raw key. `collectStream` also sanitizes
`error.detail` at the outcome boundary (WI-3) as a defense-in-depth net.

## Transport & framing (`src/providers/stream.ts`) — WI-3

`fetchStream` composes the caller signal with a request deadline (kept active through body
consumption; `TimeoutError` vs `AbortError` provenance preserved), throws `ProviderHttpError`
on non-2xx, yields raw body bytes, and runs idempotent best-effort cleanup (fire-and-forget
`reader.cancel()` + `releaseLock()`). `readSSE` is a **vendor-agnostic, line-based** SSE
framer: a streaming `TextDecoder` reassembles partial/multi-byte chunks, a blank line ends an
event (CRLF counts as one terminator, a trailing CR is deferred), and a single event's
multiple `data:` fields join with `\n`. It yields every payload verbatim — the OpenAI `[DONE]`
sentinel is the OpenAI adapter's concern (#2).

## Resilience (`src/providers/retry.ts`, `base.ts`) — WI-2 + WI-3

- **`withRetry`** (same model): retries only a retryable, zero-byte error; never an abort,
  4xx, refusal, incomplete, validation, or any outcome with partial text; timeout once;
  exponential backoff + jitter; honors `Retry-After` up to a 60s bound; abort-aware.
- **`withFallback`** (cross model): walks the ordered registry chain (`modelChain`), advancing
  only on a zero-output fallbackable error — distinct from same-model retry.
- **`collectStream`** turns one stream attempt into a terminal `ProviderOutcome`; **`defineProvider`**
  composes `withFallback ∘ withRetry ∘ collectStream` over a vendor's stream function (a lazy
  wrapper guarantees translate/polish always resolve to a `ProviderOutcome`, never reject).

## Model registry (`src/providers/modelRegistry.ts`) — WI-3

`ModelCapability` (context window, max output, streaming, vision, cost tier) + `VendorRegistryEntry`
(`implemented` flag, default model, ordered fallbacks). Anthropic defaults to `claude-fable-5`
(1M context / 128K output) with Opus 4.8 / Sonnet 4.6 fallbacks, per the claude-api skill
catalog. `resolveModel` / `capabilityOf` / `modelChain` (de-duped, order preserved); the other
vendors are registered but flagged unimplemented until #2.

## Prompts & request validation (`src/lib/prompts`) — WI-4

`buildPrompt` produces `{system, user}` for a translate/polish request: the source text is the
`user` content passed through verbatim, and a shared structure-preservation instruction (rule 66 §1)
goes in `system`. `PROMPT_VERSION` versions the templates. Language fields are interpolated **only**
as canonical labels from a curated registry (`resolveLanguage`) — never raw user input — closing the
prompt-injection surface. `validateRequest` rejects empty/oversized input, an unsupported language,
an unknown polish goal, or an unknown request kind (a `validation` ProviderError; never leaks the input).

## Anthropic provider + factory (`src/providers/anthropicProvider.ts`, `index.ts`) — WI-5

`anthropicStream` maps an `LLMRequest` to the Messages API request (`model` + clamped `max_tokens`
from the registry capability; `system` + one user message; `stream: true`; **no** `thinking`/
`temperature` — Fable 5 thinking is always-on), streams via `fetchStream` + `readSSE`, and translates
events: `text_delta` → chunk (non-empty only); `thinking_delta`/`message_start`/`content_block_*`
ignored; `message_delta.stop_reason` (`refusal` → fallbackable iff zero output; `max_tokens` /
`model_context_window_exceeded` → `incomplete`); `message_stop` → done; a mid-stream `error` →
the mapped kind (`streamErrorKind`); malformed/non-object JSON → `requestFailed`; EOF without
`message_stop` → `incomplete`. The API key appears only in the `x-api-key` header.
`createProvider(vendor, config, deps?)` is the public entry point: it refuses unimplemented vendors
and a missing key, resolves the model, and wires `defineProvider` with the real abort-aware backoff
sleep (`realSleep`, injectable for tests).

## Coming next

- _WI-6_ — the Zustand provider config store.
- _WI-7_ — i18n + App wiring.
