# Feature #7 — Custom / OpenAI-compatible provider

> Status: **PLANNED** (Gate 2 PASSED — round 1: model assumptions verified READY; SSE edge-cases NEEDS REVISION → v2 resolves with the finish_reason mapping + quirk handling + expanded test catalogue. Independent subagent audit.) · Tracker: `docs/features.md` #7 (★ top priority) · GH: #31
> Depends on the VERIFIED provider layer (#1/#2). Branch `feat/feature-7-custom-provider` (main protected).

## Gate-2 round-1 resolutions (v2)

Round 1 (independent subagent audit): model assumptions all verified (READY); the test catalogue
under-specified OpenAI-compatible SSE quirks (NEEDS REVISION). Resolved here (authoritative).

**`finish_reason` → outcome mapping** (the adapter applies this on each `choices[0].finish_reason`):

| finish_reason | outcome |
|---|---|
| `stop` / `null`/absent / `tool_calls` / `function_call` | normal completion (we never request tools) |
| `length` | throw `incomplete` (truncated) |
| `content_filter` | throw `refusal` (fallbackable iff nothing was produced) |

**SSE-quirk handling** (mirrors `anthropicStream`'s tolerance):

- **role-only / empty deltas** — `{choices:[{delta:{role:'assistant'}}]}` or a delta without a string
  `content` → yield nothing (only a non-empty string `delta.content` counts as output).
- **keepalive comments** (`:` lines) — already dropped by `readSSE` (yields data payloads only).
- **usage-only / empty-choices final chunk** — `{choices:[],usage:{…}}` → no content, no finish →
  ignored; termination comes from `[DONE]` or a `finish_reason`.
- **in-stream error object on HTTP 200** — a data payload `{error:{message,type,code}}` → throw a
  mapped `ProviderException` (`errorFromStatus(error.code)` when `code` is a number, else
  `streamErrorKind`/`providerDown`). Guards the "choices undefined" crash.
- **non-2xx HTTP** — handled by the shared `fetchStream` (→ `errorFromStatus(status)`), same as
  Anthropic; the adapter never sees a non-2xx body.
- **`delta.content` non-string** (e.g. `null`) — treated as no content (skip), never a throw.

**baseUrl normalization** — strip a single trailing slash, then append `/chat/completions`
(`${baseUrl.replace(/\/+$/,'')}/chat/completions`). baseUrl is the API root (e.g.
`https://api.openai.com/v1`). Tested with and without a trailing slash.

**Validation boundary** — `createProvider` validates non-empty `baseUrl` + `model` for `custom` and
throws up front; the adapter assumes valid inputs (documented; one validation point, factory-tested).

## Problem

The provider set is the closed `Vendor = 'anthropic' | 'openai' | 'gemini' | 'ollama'`; there is no
way to point Lucid at a **custom endpoint**. Users with OpenAI-compatible gateways (LM Studio,
vLLM, OpenRouter, self-hosted, corporate proxies) — or who simply want to use an OpenAI-compatible
model — can't. This is the user's **top-priority** feature. The **engine** (a generic
OpenAI-compatible streaming adapter) is also the foundation that feature #5 (OpenAI / Ollama) reuses.

## Scope

**In scope (buildable now, headless + TDD):**

- **`openaiCompatibleStream(deps)`** — a new `VendorStreamFn` (`src/providers/openaiCompatibleProvider.ts`)
  mirroring `anthropicStream`: maps `LLMRequest` via `buildPrompt(request)` → an OpenAI
  **chat/completions** body (`{ model, messages: [{role:'system',content:system},{role:'user',
  content:user}], stream: true }`), `Authorization: Bearer <apiKey>` + `content-type: application/json`,
  POSTs to `${baseUrl}/chat/completions` via the shared `fetchStream` + `readSSE`, parses the OpenAI
  SSE (`data:` JSON `{ choices: [{ delta: { content }, finish_reason }] }`; `data: [DONE]` terminates;
  yield `delta.content`). Error mapping: a non-200 → `errorFromStatus(status)` (already exists);
  `finish_reason === 'length'` → `incomplete`; stream end without `[DONE]`/finish → `incomplete`;
  malformed SSE JSON → `requestFailed`; an OpenAI error object in the stream → mapped kind. No vendor
  shape leaks past the adapter (rule 65 §1).
- **`custom` vendor** — extend `Vendor` with `'custom'`; registry entry `implemented: true` with **no
  fixed model** (model is user-supplied via `config.model`; `capabilityOf('custom', …)` returns
  undefined → fallback `maxOutputTokens`). `resolveModel('custom', m)` returns the supplied `m`
  (required for custom — a custom provider with no model is a validation error surfaced up front).
- **Factory wiring** — `createProvider` gains the vendor switch (`// #2` hook): `custom` →
  `openaiCompatibleStream({ apiKey, baseUrl: config.baseUrl, model, fetch })`. A custom provider with
  **no `baseUrl`** throws `requestFailed` up front (like the missing-key guard).
- **Config carrier** — `providerStore` gains `baseUrl: string` (additive; in-memory, like `apiKey`)
  so the custom endpoint can be held for the session. `isReady()` for `custom` additionally requires a
  non-empty `baseUrl` + `model`.
- **Presentation** — `providerPresentation` adds a `custom` entry (label key `provider.custom`, a dot
  token, `isLocal:false`); it appears in the switcher/Settings via the existing implemented-only list.

**Out of scope / design-gated (rule 51):**

- **The Settings UI for the custom provider** — the base-URL + model **input fields** are NOT in the
  committed design bundle. Per rule 51 they cannot be invented; they are tracked under the Settings/
  provider **redesign (#29)** which the user carries through `claude.ai/design`. So WI-4 (UI) is
  **BLOCKED on #29** — the engine (WI-1..3) ships and is unit-verified, but the feature does not reach
  `VERIFIED` (no user-configurable entry point) until #29's bundle lands. This is stated, not silent.
- Vendor-keyed credentials for the *named* providers (that's feature #5); per-endpoint history; auth
  schemes other than Bearer (custom-header support is a follow-up).

### Files OUT of scope (consumed, not changed)

- `src/providers/{base,stream,errors,retry,redact}.ts`, `src/lib/prompts/**` — reused as-is
  (`buildPrompt`, `fetchStream`, `readSSE`, `errorFromStatus`, `defineProvider`). `anthropicProvider`
  unchanged.

## Prior art / precedent / rejected alternatives

- **Mirror `anthropicStream`** — the proven adapter shape (VendorStreamFn + fetchStream + readSSE +
  ProviderException). *Chosen* over a bespoke transport. The OpenAI chat/completions SSE is simpler
  than Anthropic's event types (just `choices[].delta.content` + `[DONE]`).
- **One OpenAI-compatible adapter, parameterized by baseUrl/model** — *chosen* so #5's OpenAI and
  Ollama (both expose `/v1/chat/completions`) reuse it; only Gemini needs its own adapter (or its
  OpenAI-compat endpoint) under #5. *Rejected: a separate adapter per vendor* (duplication).
- **`custom` as a first-class vendor** vs a per-vendor "advanced: override base URL" toggle — *chosen*
  the explicit `custom` vendor (clear model: user supplies URL+model+key); a base-URL override on a
  named vendor is a different concern.

## Work-item sequencing

| WI | Title | Tier | PR |
|----|-------|------|----|
| WI-1 | `openaiCompatibleStream` adapter (chat/completions + SSE + error mapping) | foundational (provider, 100%) | M |
| WI-2 | `custom` vendor + registry (no fixed model; resolveModel/capability handling) + types | foundational | S |
| WI-3 | `createProvider` custom switch (baseUrl/model guards) + `providerStore.baseUrl` + `isReady` + presentation | foundational (+store) | M |
| WI-4 | Settings UI — base URL + model fields for the custom provider | behavioral | **BLOCKED on #29** (rule 51) |

WI-1..3 are TDD at 100% against a **mocked `fetch`** (rule 65 §8) — request mapping, streamed chunks,
`[DONE]`, `finish_reason: length` → incomplete, HTTP-status error mapping, abort, malformed SSE,
missing baseUrl/model guards. WI-4 is filed against #29 and resumes when the design bundle commits.

## Test catalogue

- `src/providers/openaiCompatibleProvider.test.ts` — maps an LLMRequest → chat/completions body
  (system+user messages, model, stream:true, Bearer header, `${baseUrl}/chat/completions`); yields
  `delta.content` chunks; stops on `[DONE]`; 401/403 → `invalidKey`, 429 → `rateLimited`, 5xx →
  `providerDown` (via `errorFromStatus`); malformed SSE → `requestFailed`; abort stops consumption;
  stream-end-without-DONE → `incomplete`. **SSE quirks (v2):** role-only first delta → yields
  nothing then content; `delta.content: null` → skipped (no throw); usage-only/empty-choices final
  chunk → ignored, terminates on `[DONE]`; **in-stream `{error:{…}}` on HTTP 200 → mapped throw**;
  **finish_reason mapping** — `stop` → done, `length` → `incomplete`, `content_filter` → `refusal`;
  **baseUrl with and without trailing slash** → same `/chat/completions` URL (no double slash).
- `src/providers/modelRegistry.test.ts` (extend) — `custom` is implemented; `resolveModel('custom', m)`
  returns m; `capabilityOf('custom', …)` undefined → fallback maxTokens.
- `src/providers/index.test.ts` (extend) — `createProvider('custom', {apiKey, baseUrl, model})` wires
  the OpenAI-compatible streamFn; missing `baseUrl` or `model` → throws `requestFailed`/`invalidKey`.
- `src/stores/providerStore.test.ts` (extend) — `baseUrl` setter; `isReady()` for `custom` requires
  key + baseUrl + model; reset clears baseUrl.
- `src/lib/providers/providerPresentation.test.ts` (extend) — `custom` present in `implementedPresentations()`.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Custom Settings UI is undesigned (rule 51) | WI-4 BLOCKED on #29; engine ships + unit-verified; feature not VERIFIED until the bundle lands — stated in DoD. |
| Provider-specific SSE quirks (some emit `delta.role` first, keepalive `: ping`) | `readSSE` already filters comments; ignore deltas without `content`; tolerate non-content deltas. |
| `custom` has no registry model/limits | model from `config.model` (required); `capabilityOf` undefined → fallback max-tokens; no capability lookups assumed. |
| Untrusted custom endpoint (SSRF-ish / privacy) | Client-side fetch only (no server proxy yet); surface where text goes (rule 65 §6) when the UI lands; key in-memory (§5), never logged. |
| Reused by #5 | adapter parameterized by baseUrl/model so OpenAI (fixed URL) + Ollama (`/v1/...`) reuse it; keep it vendor-agnostic. |

## Backward compatibility

- `Vendor` gains `'custom'` (union widened; exhaustive switches updated). `providerStore` gains an
  additive in-memory `baseUrl` (empty default) — existing Anthropic behavior unchanged. No persisted
  data, no API change to existing flows. `anthropicProvider` untouched.

## Definition of Done

- WI-1..3 done; provider/registry/store at 100% coverage (mocked fetch — never a live API, rule 65 §8);
  `pnpm check:all` green; per-WI commits; version bump.
- The custom provider **engine** works end-to-end against a mocked OpenAI-compatible endpoint
  (request mapped, chunks streamed, errors mapped, abort honored).
- **WI-4 (Settings UI) is BLOCKED on the #29 design** — when the bundle commits, WI-4 adds the
  base-URL/model fields and the feature reaches `VERIFIED` (real custom endpoint usable). Until then
  the row stays `IN PROGRESS` with the WI-4 block noted (rule 51 file-and-skip).
- Reusable by #5 (OpenAI / Ollama adapters built on `openaiCompatibleStream`).
