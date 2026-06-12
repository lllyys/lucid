# 65 - LLM Provider Integration

The defining architecture of lucid. **All model access goes through one provider
abstraction.** This rule expands the "LLM provider layer" section of `AGENTS.md`
into enforceable MUST/NEVER bullets. Paths under `src/providers/**`,
`src/lib/translation/**`, `src/lib/polish/**`, and `src/stores/**` are TDD-gated
(see `10-tdd.md`) — treat every bullet here as a test obligation, not a suggestion.

## 1. The single `LLMProvider` interface

One contract, implemented per vendor (Anthropic, OpenAI, Gemini, local/Ollama).
UI and feature code depend on the **interface**, never on a vendor.

- **MUST** define one `LLMProvider` contract with the domain methods the app needs
  — at minimum `translate()`, `polish()`, and a low-level `stream()`. Vendor
  implementations live in `src/providers/<vendor>Provider.ts`; the active provider
  is user-selectable in settings.
- **MUST** type provider results as discriminated unions
  (`idle | streaming | done | error`) per `AGENTS.md` stack conventions — no `any`.
- **NEVER** import a vendor SDK or call a vendor HTTP endpoint from UI, hooks,
  stores, or feature code (`src/components/**`, `src/lib/translation/**`,
  `src/lib/polish/**`). Those layers talk only to `LLMProvider`.
- **NEVER** leak a vendor-specific response shape past the provider boundary.
  Each implementation maps its raw response into the shared interface types.
- **MUST** keep provider construction injectable (e.g. `createXProvider({ fetch, apiKey })`)
  so the network boundary can be mocked in tests (see §8).

## 2. Central model registry

Model IDs and capabilities live in **one** config module, not scattered literals.

- **MUST** keep all model IDs + capability metadata (context window, streaming
  support, vision, cost tier) in a single registry module (e.g.
  `src/providers/modelRegistry.ts`). Code references registry entries by symbol.
- **NEVER** hardcode a model-ID string literal anywhere outside the registry
  (no `"claude-..."`, `"gpt-..."`, `"gemini-..."` inline in providers, prompts,
  stores, or UI).
- **MUST** default each provider to its **latest capable** model. For Anthropic,
  default to the latest Claude (e.g. `claude-fable-5`, then Opus/Sonnet as
  fallbacks) — never pin an older ID as the default.
- **MUST consult the `claude-api` skill before writing or changing any Anthropic
  call** (current model IDs, streaming shape, pricing, limits). Do not rely on
  memory for model IDs — they drift. This mirrors the hallucination guard in
  `60-ai-governance.md`.
- **MUST** express fallbacks as an ordered list in the registry so a deprecated or
  unavailable model degrades to the next capable one without code changes.

## 3. Streaming first

Translation and polish results stream token-by-token. Streaming is the primary
path, not an enhancement.

- **MUST** implement `stream()` as the core primitive and build `translate()` /
  `polish()` on top of it (collect-to-completion is a thin wrapper over the stream).
- **MUST** handle **partial streams**: a stream that ends early must surface what
  was received plus an explicit `error`/incomplete state — never silently present
  a truncated result as complete.
- **MUST** support **user-initiated abort** via `AbortController`. Aborting stops
  token consumption promptly, releases the network request, and transitions state
  to a clean cancelled state (not `error`).
- **MUST** handle **mid-stream errors** (connection drop, malformed SSE chunk,
  provider error event mid-flight): stop, map to a user-facing error (§4), and keep
  any already-streamed text visible.
- **NEVER** buffer the entire response before showing anything when streaming is
  available — the user sees tokens as they arrive.

## 4. Resilience

Networks and providers fail. The user sees a clear message, never a stack trace.

- **MUST** apply **retries with backoff** (exponential + jitter) for transient
  failures only. **NEVER** retry a user abort, a 4xx auth/validation error, or a
  request that already streamed partial output.
- **MUST** set a **request timeout**; a hung request fails into the error path
  rather than spinning forever.
- **MUST** handle **rate limits (429)** explicitly — respect `Retry-After` when
  present, surface a distinct "rate limited" message, and back off rather than
  hammering.
- **MUST** handle **provider outages** (5xx, network unreachable) distinctly from
  user/auth errors, and suggest switching providers where appropriate.
- **MUST** map every failure to a **localized, user-facing error** via `t()` (see
  `AGENTS.md` i18n — e.g. `error.rateLimited`, `error.providerDown`,
  `error.invalidKey`). **NEVER** render a raw exception, stack trace, or vendor
  error payload in the UI.

| Failure | Detection | User-facing key (example) | Retry? |
|---|---|---|---|
| Rate limit | HTTP 429 | `error.rateLimited` | Yes, after `Retry-After` |
| Provider outage | HTTP 5xx / network | `error.providerDown` | Yes, backoff |
| Invalid/missing key | HTTP 401/403 | `error.invalidKey` | No |
| Bad request | HTTP 4xx | `error.requestFailed` | No |
| Timeout | abort on deadline | `error.timeout` | Yes, once |
| User abort | `AbortController` | (none — cancelled state) | No |

## 5. API key & secret hygiene

Keys are sensitive credentials. Treat them like passwords.

- **NEVER** log API keys — not in `console`, not in diagnostics, not in error
  messages, not in telemetry.
- **NEVER** commit keys to the repo (no `.env` with real keys checked in; keep
  example files keyless).
- **NEVER** ship a key in plaintext in the client bundle. Build-time string
  inlining of a real key is forbidden.
- **MUST** store user-supplied keys via the browser's secure mechanisms and treat
  them as sensitive at rest and in transit.
- **MUST** redact keys in any diagnostic, log, or bug-report path (e.g. show
  `sk-…last4`), and scrub them from anything copied to the clipboard or attached
  to an issue.
- **Server/proxy boundary (future):** if/when a thin server or proxy is added for
  production key handling, the trust boundary, what crosses it, and where the key
  actually lives **MUST be documented in this section** when it lands. Until then,
  keys live client-side and that constraint is explicit to the user (§6).

## 6. Privacy & transparency

User text leaves the device when a hosted provider is active. Be honest about it.

- **MUST** make it explicit in the UI where text goes for the active provider —
  hosted providers (Anthropic / OpenAI / Gemini) send the user's text to a third
  party.
- **MUST** treat **local/Ollama as a first-class, privacy-preserving path**, not an
  afterthought — it is the option for text that must not leave the machine.
- **MUST** surface the active provider's privacy posture at the point of action
  (near translate/polish), not buried in settings.
- **NEVER** send user text to any endpoint not selected by the active provider, and
  **NEVER** add silent analytics that exfiltrate document content.

## 7. Prompts

Prompts are versioned, tested code — not strings glued into components.

- **MUST** keep prompt templates in a dedicated module (e.g. `src/lib/prompts/`),
  versioned and unit-tested.
- **MUST** unit-test prompt builders for the contract that matters: structure
  preservation instructions present, target language / polish goal interpolated
  correctly, no accidental injection of untrusted input into instruction slots.
- **NEVER** inline large or load-bearing prompt strings in components, hooks, or
  stores.
- **MUST** keep prompts provider-agnostic where possible; vendor-specific phrasing
  is an explicit, documented variant in the prompt module, not an ad-hoc tweak.

## 8. Testing the provider layer

The provider layer is mocked in unit tests. `pnpm check:all` never touches a live
API. (See `10-tdd.md` §"Provider Tests" for the canonical pattern.)

- **MUST** mock the **network boundary** (`fetch`) in provider unit tests — never
  mock the vendor SDK or the provider's own logic, and never mock away the behavior
  under test.
- **NEVER** hit a live LLM API in `pnpm check:all`, CI, or any default test run.
  Live calls are nondeterministic, costly, and leak keys.
- **MUST** assert on **behavior**, not exact model wording:
  - Source **structure is preserved** (Markdown, line breaks, lists, code blocks,
    inline code, URLs, placeholders survive — see `AGENTS.md` domain rules).
  - **Abort is honored** (consumption stops, state is cancelled, no further chunks).
  - **Errors are mapped** to the correct localized state (§4 table), not surfaced raw.
  - **Partial streams** yield received text plus an incomplete/error state.
- **NEVER** snapshot or assert on the exact translated/polished text the model
  returns — it changes between models and runs.
- **MUST** cover request mapping, streaming, abort, retry/backoff, and each failure
  row in §4 for every provider implementation before it is considered done.

## Relationship to other rules

- **`AGENTS.md` (LLM provider layer / domain rules):** the source this rule
  enforces; structure-preservation and determinism-in-tests originate there.
- **`10-tdd.md`:** providers are an **ALWAYS-test** category; this rule defines
  *what* those tests assert.
- **`60-ai-governance.md`:** the model-registry + `claude-api` guard in §2 is the
  provider-layer instance of the dependency/hallucination discipline there.
