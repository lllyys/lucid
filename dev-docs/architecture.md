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
constructor — no construction path can carry a raw key. (Outcome-boundary sanitization in
`collectStream` is a planned defense-in-depth net — _WI-3_.)

## Resilience (`src/providers/retry.ts`) — WI-2; `base.ts` — _WI-3_

- **`withRetry`** (same model): retries only a retryable, zero-byte error; never an abort,
  4xx, refusal, incomplete, validation, or any outcome with partial text; timeout once;
  exponential backoff + jitter; honors `Retry-After` up to a 60s bound; abort-aware.
- **`withFallback`** _(WI-3)_: walks the ordered registry model chain, advancing only on a
  zero-output fallbackable error — distinct from same-model retry.

## Coming next

- _WI-3_ — `stream.ts` (event-framed SSE transport, abort/timeout), `base.ts`
  (`collectStream`, `defineProvider`, `withFallback`), `modelRegistry.ts` (capabilities +
  ordered fallbacks + `implemented` flag).
- _WI-4_ — `lib/prompts` (versioned builders + request validation).
- _WI-5_ — `anthropicProvider.ts` + the `createProvider` factory.
- _WI-6_ — the Zustand provider config store.
- _WI-7_ — i18n + App wiring.
