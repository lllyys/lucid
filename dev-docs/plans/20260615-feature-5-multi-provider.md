# Feature #5 — Multi-provider + redesigned Settings surface

> **Status:** PLANNED (Gate 2 passed, v2 — READY TO BUILD) · GH: #27 (umbrella) · Size: **Large** (8 WIs)
> Folds in the now-unblocked design-gated work: **#6** (test connection), **#7 WI-4**
> (custom endpoint Settings field), **#29** (Settings/provider redesign). Design committed
> in PR #39 (`dev-docs/designs/lucid-workspace/project/Lucid Workspace.dc.html`, chat3).

## Problem

Only Anthropic is wired. `createProvider` throws `requestFailed` for openai/gemini/ollama
(`modelRegistry` marks them `implemented:false`), so users can't add or use another provider.
The committed #29 redesign depicts the full multi-provider Settings surface — per-vendor keys,
per-provider model picker, test connection, custom self-hosted endpoint, Ollama "no key", stat
tiles, workspace-default — and the provider switcher with all four named vendors. This feature
implements both the provider-layer backing and that redesigned surface.

## Research (grounds the model IDs / API shapes — AGENTS.md "research before building")

Verified mid-2026 (sources in the session research log; rule 60 §4 — do not hallucinate IDs):

- **OpenAI** — OpenAI-compatible `/v1/chat/completions` (reuse `openaiCompatibleStream`), base
  `https://api.openai.com/v1`, `Authorization: Bearer sk-…`, SSE `choices[].delta.content` +
  `[DONE]`, `finish_reason` stop/length/content_filter. Current IDs: `gpt-5.5` (flagship),
  `gpt-5.4-mini`, `gpt-5.4-nano`. (`gpt-5-pro` is Responses-API-only — exclude.)
- **Gemini** — NOT OpenAI-compatible. `POST .../v1beta/models/{model}:streamGenerateContent?alt=sse`,
  header `x-goog-api-key: AIza…`, body `{contents:[{role,parts:[{text}]}], systemInstruction:{parts:[{text}]},
  generationConfig:{maxOutputTokens}}`, SSE `candidates[].content.parts[].text` + `finishReason`
  STOP/MAX_TOKENS/SAFETY/RECITATION, errors `{error:{code,message,status}}`. Needs a **new adapter**.
  GA default `gemini-3.5-flash` (+ `gemini-3.1-flash-lite`); Pro tier is preview-only → not defaulted.
- **Ollama** — OpenAI-compatible at `http://localhost:11434/v1` (reuse `openaiCompatibleStream`),
  **API key required-but-ignored** (send any non-empty placeholder; UI shows "no key needed").
  User-installed models, no fixed catalog → `allowAnyModel: true`, default `llama3.2`.

The design's display names (GPT-5, Gemini 3 Pro, Llama 4) and stat values (pricing/latency/rate)
are **illustrative placeholders** (handoff note) — the registry uses the real API IDs above; stat
tiles render registry metadata where we have it and a documented placeholder where we don't.

## Surface area (file-by-file)

### Provider layer (`src/providers/`)
- **`modelRegistry.ts`** — populate `defaultModel` + `fallbacks` + `allowAnyModel:true` for
  `openai`/`gemini`/`ollama` using the real researched IDs. **`implemented` stays `false` in WI-1 and
  is flipped to `true` in WI-4 alongside the factory switch** — flipping it without the switch would
  make `createProvider` fall through to the anthropic `else` and silently build the WRONG adapter (and
  break `index.test.ts`'s "throws for unimplemented vendor"). So WI-1 = dormant data, WI-4 = activate.
  - **No fabricated capability numbers.** All three use `allowAnyModel:true` + `models:{}` (mirroring
    `custom`), so `resolveModel` returns the user/registry model as-is and `capabilityOf` is undefined
    (no clamp). The Settings model picker lists `modelChain(vendor)` = `[defaultModel, ...fallbacks]`.
    This avoids inventing context-window/max-token figures the research couldn't verify (rule 60 §4);
    the registry stays the single swap point (rule 65 §2) and a drifted ID is a zero-code change.
  - Defaults/fallbacks: openai `gpt-5.5` ← `[gpt-5.4-mini, gpt-5.4-nano]`; gemini `gemini-3.5-flash` ←
    `[gemini-3.1-flash-lite]` (Pro tier preview-only — not defaulted); ollama `llama3.2` ← `[]`.
- **`geminiProvider.ts`** (NEW) — `geminiStream(deps:{apiKey,baseUrl?,fetch?}): VendorStreamFn`,
  mirroring `anthropicProvider.ts` structure. Maps Gemini SSE → `StreamChunk`/`ProviderOutcome`;
  classifies `finishReason` (STOP→done, MAX_TOKENS→incomplete, SAFETY/RECITATION→refusal) + HTTP/
  `error.status` → ErrorKind. Reuses `fetchStream`/`readSSE`/`buildPrompt`/`validateRequest`.
- **`index.ts`** (`createProvider`) — replace the anthropic-only `else` with a vendor switch:
  `openai`→`openaiCompatibleStream({apiKey, baseUrl:'https://api.openai.com/v1', fetch})`,
  `ollama`→`openaiCompatibleStream({apiKey: apiKey || 'ollama', baseUrl:'http://localhost:11434/v1', fetch})`
  (the `'ollama'` placeholder bearer is harmless — Ollama ignores it), `gemini`→`geminiStream({apiKey, fetch})`,
  `anthropic`→`anthropicStream(...)`, `custom`→existing. **The current unconditional missing-key throw
  (`index.ts:44`, `if (!config.apiKey) throw invalidKey`) must be made vendor-aware: skip it for
  `vendor==='ollama'`** (move the guard after the vendor decision or special-case ollama before it),
  else ollama can never build. WI-3↔WI-4 coupling: ollama only works once BOTH `isReady()` returns
  true without a key (WI-3) AND the factory accepts an empty key (WI-4) — they must merge before the
  ollama runtime path (`usePanelRun`) is exercised; neither alone suffices.
- **`testConnection.ts`** (NEW, feature #6) — `probeProvider(provider, {signal,timeoutMs}) →
  Promise<{ok:true,latencyMs} | {ok:false,kind:ErrorKind}>`. `LLMProvider.stream()` exists and yields
  `StreamChunk`s / throws `ProviderException`, but applies **no default timeout** (only translate/polish
  inject `DEFAULT_TIMEOUT_MS`), so the probe passes its own `{signal, timeoutMs}` straight into
  `stream()`. The probe request must satisfy `validateRequest` — non-empty text + a SUPPORTED target
  language: `{kind:'translate', text:'ping', targetLang:'en'}` (a bad lang errors as `validation`, not a
  real connection result). "1-token" is aspirational — `stream()` can't cap output, so the probe
  consumes until the **first yielded chunk, times it, then aborts** (releases the request). Maps errors
  via the §4 table; never logs the key; bounded by the timeout; **never run in `check:all`** (mocked).

### Store (`src/stores/providerStore.ts`)
- `apiKey: string` → `apiKeys: Record<Vendor,string>` (per-vendor, in-memory only — rule 65 §5,
  NOT persisted). **Retain a backward-compat active-vendor `apiKey` read accessor** (a derived
  `get apiKey()` / selector returning `apiKeys[vendor]`) so existing reads in `keyChange.ts:20` and
  `usePanelRun.ts:28` keep working without each being rewritten. `model: string` stays as the active
  vendor's selection, backed by `models: Record<Vendor,string>`.
- **`setVendor` semantics change (flagged):** today `setVendor` does `set({ vendor, model:
  resolveModel(vendor) })` — it RESETS the model to the vendor default. It must change to **restore**
  `models[vendor] ?? resolveModel(vendor)` so switching away and back keeps the prior selection. The
  active `model` field is derived from `models[activeVendor]`. (Test: switch-away-then-back restores.)
- Keep `baseUrl` (custom) + add `customUrlSaved` (the committed base URL).
- Actions: `setApiKey(key)` (active vendor) / `clearKey()` (active vendor); `setModel(model)`
  (active vendor, writes `models[vendor]`); `setBaseUrl`/`saveCustomUrl`. `isReady()`: implemented &&
  (ollama OR (custom ? baseUrl+model : apiKeys[vendor] non-empty)) && (custom ? model : true).
- Add `testStatus: Record<Vendor,'idle'|'testing'|'ok'|'fail'>` + `testResult` (latency/when/msg)
  for the Settings test-connection panel, with injectable clock (mirror `operationStore`'s
  module-level `clock` + `setOperationClock` seam).
- **Caller blast radius (WI-3 edits / verifies these):** `src/lib/providers/keyChange.ts` (reads
  `provider.apiKey`, calls `setApiKey`/`clearKey` with no vendor arg — kept working by the active-vendor
  accessor + active-vendor actions); `src/hooks/usePanelRun.ts:28` (`createProvider(vendor, {apiKey:
  cfg.apiKey, model})` — the runtime provider-build path; for ollama `cfg.apiKey` is `''` and must pass
  through, see WI-3↔WI-4 coupling below); `SettingsDialog.tsx`, `ProviderSwitcher.tsx`, any footer/
  privacy reader of `apiKey`/`model`. `pnpm check:all` green after WI-3 before the UI WIs start.

### UI (`src/components/workspace/`)
- **`SettingsDialog.tsx`** — rebuilt to the #29 880px provider surface: left provider rail (rows
  with connection dot + status + selected model + "In use" badge), detail pane (header + workspace-
  default badge / "Use for this workspace", connection card + Test button, model picker dropdown,
  credentials: Ollama no-key card / custom base-URL field / remote key panel with mask+reveal+clear,
  stat tiles 2×2, privacy note). All tokens from the design; ARIA-role queries in tests. Split into
  two PRs (see WI table): **WI-6a** = rail (incl. custom) + provider detail + per-vendor key panel +
  model picker + the custom base-URL + optional key field (#7-WI-4) + the `usePanelRun` baseUrl
  run-path wiring; **WI-6b** = test-connection panel + stat tiles (#6). (v3: the custom config surface
  moved into WI-6a — it is the natural credentials slice, and shipping it without WI-6b avoids a
  configurable-but-unrunnable custom provider once the run path is wired in the same WI.)
  - **Stat-tile data source:** `ModelCapability` has no price/rate/latency fields and they are out of
    scope to add. Only **Last tested** + **Latency** (post-test) come from `testResult`; **Pricing**
    and **Rate limit** (and pre-test Latency) render a documented placeholder (`—` or a per-vendor
    `STAT_PLACEHOLDER` constant). WI-6b tests assert placeholder rendering for those tiles, NOT
    registry values.
  - **Honesty override (rule 65 §5):** do NOT lift the design's save toast "Key saved to this
    browser's secure storage" (design line 724) — it is false; keys are in-memory only. Use in-memory
    wording (e.g. `settings.keySaved` = "Key saved for this session"). The design's own rail note
    ("Keys live in memory for this session only") + privacy note already use the correct framing; the
    toast is an internal design inconsistency resolved in favor of the in-memory truth. The current
    SettingsDialog already deliberately avoids "secure storage" — preserve that.
- **`ProviderSwitcher.tsx`** — already renders `implementedPresentations()`; once the registry flips,
  it shows all four automatically. Verify model sub-label + per-vendor active mark; no structural change.
- **`providerPresentation.ts`** — `implementedPresentations()` already returns implemented non-custom
  vendors; once the registry flips it returns 4. Confirm custom stays excluded from the switcher
  (its config lives only in Settings).

### i18n (`src/locales/en/translation.json`)
- Add the new Settings strings (test connection, stat-tile labels, "no key needed", base-URL,
  workspace-default, "Use for this workspace", masked-key "saved", per the design copy). All via `t()`.

### OUT of scope
- Non-localhost Ollama base-URL field — **not designed** (#29 assumes localhost) → would be a new
  `needs-design` issue if requested.
- Real pricing/latency/rate figures — illustrative placeholders (handoff note); wire later.
- Persisting keys to disk — explicitly forbidden (rule 65 §5); keys stay in-memory.
- Tool/function calling, vision input — not in this feature.

## Work-item sequencing

| WI | Tier | Scope | PR size |
|----|------|-------|---------|
| **WI-1** | foundational | `modelRegistry` populate openai/gemini/ollama model DATA (real IDs, `allowAnyModel`, **`implemented` stays false**) + tests | S |
| **WI-2** | foundational | `geminiProvider.ts` (`geminiStream`) + tests | M |
| **WI-3** | foundational | `providerStore` per-vendor keys/models + test-state + tests; update callers | M |
| **WI-4** | behavioral (headless) | flip `implemented:true` (openai/gemini/ollama) + `createProvider` vendor switch + ollama no-key + tests (incl. updating `index.test.ts`'s now-build cases) | S |
| **WI-5** | behavioral (headless) | `testConnection.ts` probe (#6) + tests | S |
| **WI-6a** | behavioral (UI, designed) | `SettingsDialog` rebuild — rail (incl. custom) + provider detail + per-vendor key panel + model picker + **custom base-URL + optional key field (#7-WI-4)** + workspace-default + **`usePanelRun` baseUrl run-path wiring** (so an active custom provider is runnable) + ARIA tests | L |
| **WI-6b** | behavioral (UI, designed) | test-connection panel (wires WI-5 `probeProvider`) + stat tiles (#6) + ARIA tests | M |
| **WI-7** | behavioral (UI, designed) | `ProviderSwitcher` 4-provider verification + i18n strings + final acceptance | S |

WI-1→WI-4 are headless and independent of the UI; **WI-3 is the linchpin** the UI depends on, and
**WI-3+WI-4 must both land before the ollama runtime path works** (empty-key coupling). WI-6 was split
into 6a/6b (audit: one PR folding 4 issues was oversized) — both draw on the one committed bundle, and
serialize per rule 48 (one writer for `SettingsDialog.tsx`). WI-7 completes the feature (flips #5 to
DONE; #6/#7-WI-4/#29 close with it).

## Test catalogue

- `modelRegistry.test.ts` — implemented flags, default+fallbacks exist in models, ollama allowAnyModel
  resolves user model, capability metadata present for the catalogued IDs.
- `geminiProvider.test.ts` — request shape (contents/systemInstruction/generationConfig, `?alt=sse`,
  `x-goog-api-key`), streamed text from `candidates[].content.parts[].text`, finishReason mapping
  (STOP/MAX_TOKENS/SAFETY), HTTP 401/403/429/5xx → ErrorKind, `error.status` mapping, malformed
  payload → requestFailed, abort honored, no key in any thrown message.
- `index.test.ts` — createProvider builds openai/ollama/gemini; ollama with empty key succeeds;
  openai/gemini without key throw invalidKey; each streams through the right engine (mocked fetch).
- `providerStore.test.ts` — per-vendor key set/clear/isolation; model-per-vendor restore on switch;
  ollama isReady without key; custom isReady needs baseUrl+model; testStatus transitions; reset.
- `testConnection.test.ts` — ok+latency on a 1-chunk mock; invalidKey/rateLimited/providerDown/timeout
  mapping; abort; key never logged; timeout bound.
- `SettingsDialog.test.tsx` — rail switches active provider; remote key save (prefix-valid/invalid);
  clear; Ollama shows no-key card (no input); custom shows base-URL field + save; model picker opens +
  selects; test-connection updates status; "Use for this workspace" sets active; ARIA-role queries.
- `ProviderSwitcher.test.tsx` — lists 4 providers, switches active, shows per-vendor model + private badge.

Determinism: provider layer + probe mock `fetch`; no live APIs in `check:all` (rule 65 §8 / 66 §4).

## Risks + mitigations

- **Per-vendor key refactor breaks callers.** `apiKey` is read in SettingsDialog/keyChange/App.
  *Mitigation:* do WI-3 as a focused refactor with the full `pnpm check:all` green before WI-6; keep
  the active-vendor `model`/key derivable so component reads change minimally.
- **Gemini API shape wrong.** *Mitigation:* research-grounded (sources logged); WI-2 tests assert the
  exact request/response shape against a mocked fetch; Gate-2 audit verifies signatures.
- **Hallucinated model IDs.** *Mitigation:* IDs from the research log; `allowAnyModel` for ollama; the
  registry is the single swap point (rule 65 §2) so a drifted ID is a one-line fix, not a code change.
- **SettingsDialog rebuild scope.** *Mitigation:* it is one WI (one writer, rule 48), built against the
  committed design; logic (store/probe) is already TDD-tested in WI-3/WI-5 so the component is wiring.
- **Ollama empty key vs invalidKey throw.** *Mitigation:* factory special-cases ollama (key optional);
  tested in WI-4.

## Backward compat

- Existing single-key Anthropic users: `apiKeys.anthropic` carries the old `apiKey` semantics; the
  active-vendor accessors preserve current behavior. Keys remain in-memory (no migration — never
  persisted). The switcher gaining 3 providers is additive; Anthropic stays the default vendor.

## Definition of Done

- All 4 named providers usable behind the single `LLMProvider` interface (Anthropic, OpenAI, Gemini,
  Ollama); custom unchanged (#7 engine). Per-vendor keys (in-memory). Test-connection works (#6).
  Custom base-URL field in Settings (#7 WI-4). Settings matches the #29 design. `pnpm check:all` green —
  **100% coverage on the logic layer (`src/providers/**`, `src/lib/**`, `src/stores/**`); components
  (`src/components/**`) are behavior-tested via ARIA queries, not under the 100% gate** (so WI-6a/6b
  chase behavior, not impossible component coverage). No key logged/persisted. Browser slice
  verification on the Settings + a real/mocked provider call (Gate 5).

## Revision history

- **v1 (2026-06-15):** initial plan. Gate 2 audit pending.
- **v2 (2026-06-15):** Gate-2 round-1 fixes (independent subagent audit, `manual-fallback` — Codex
  unavailable; spine verified feasible). Resolved 2 High + 4 Medium + 3 Low: (H) retain an
  active-vendor `apiKey` read accessor so `keyChange.ts` keeps working, and add `usePanelRun.ts` to
  WI-3's blast radius + name the WI-3↔WI-4 ollama empty-key coupling (both must land before the ollama
  runtime path); (M) flag `setVendor`'s reset→restore-last-model semantics change; split oversized WI-6
  into WI-6a (#5/#29 core) + WI-6b (#6/#7-WI-4); name the stat-tile placeholder data source
  (`ModelCapability` has no price/rate/latency — render placeholders, test asserts that); reject the
  design's false "secure storage" toast in favor of in-memory wording (rule 65 §5); (L) specify the
  probe's valid request + own-timeout + abort-after-first-byte, the WI-4 empty-key guard placement, and
  correct the DoD coverage wording (100% on logic layer; components behavior-tested only). **Verdict
  after v2: READY TO BUILD** (zero open Critical/High/Medium).
- **v3 (2026-06-16):** WI-6a build + Gate-4 fixes. **User decision (#5/#7/#29):** custom gets an
  OPTIONAL API-key field (the committed design showed none) so keyed proxies (OpenRouter) AND keyless
  self-hosted both work → `isReady(custom)` = baseUrl + model (key optional); the factory exempts custom
  from the key requirement. **Scope:** the custom config surface (rail row + base-URL + optional key)
  moved from WI-6b into WI-6a (the credentials slice), and the `usePanelRun` baseUrl run-path wiring
  landed in the same WI so custom is never configurable-but-unrunnable (Gate-4 High). Gate-4 was a 4-lens
  adversarial workflow (behavior/design/security/coverage): 1 High (usePanelRun baseUrl — fixed), 1
  Medium (this scope-drift doc-sync), and Lows (omit empty `Bearer` for keyless custom; dead i18n key
  removed; dialog dims 880/252; rail status color; selected-row treatment; model context label;
  +5 strengthened tests). WI-6b is now just test-connection panel + stat tiles.
