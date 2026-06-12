# AGENTS.md

Shared instructions for all AI agents (Claude, Codex, etc.) working on **Lucid**.

Lucid is a web app for **translation and writing-polish**: paste or type text, pick a
target language or a polish goal (clarity, tone, grammar), and get a streamed result you
can compare against the original and accept. Powered by a configurable, multi-provider
LLM layer (Anthropic, OpenAI, Gemini, local/Ollama).

> **Status:** Greenfield. The stack below is the agreed target — scaffolding may not exist
> yet. When you add a tool, wire it into `pnpm check:all` (see Gates) in the same change.

## Working agreement

- You are an AI assistant working on the Lucid project.
- Use English unless another language is requested.
- Run `git status -sb` at session start.
- Read relevant files before editing.
- Keep diffs focused; avoid drive-by refactors.
- Do not commit unless explicitly requested.
- Keep code files under ~300 lines (split proactively).
- Keep features local; avoid cross-feature imports unless truly shared.
- **Research before building**: For new features, search for industry best practices,
  established conventions, and proven solutions (web search, official docs, prior art in
  popular open-source projects). Don't invent when a well-tested pattern exists.
- **Edge cases are not optional**: Brainstorm as many as possible — empty input,
  null/undefined, huge documents, mixed scripts, Unicode/CJK, RTL text, emoji, rapid
  repeated actions, provider timeouts, rate limits, network failures, missing/invalid API
  keys, partial streams, aborted requests. Write tests for every one.
- **Test-first is mandatory** for new behavior:
  - Write a failing test (RED), implement minimally (GREEN), refactor (REFACTOR).
  - Coverage thresholds are enforced — `pnpm check:all` fails if coverage drops.
  - Exceptions: CSS-only, docs, config.
- Run `pnpm check:all` before declaring work done (see Gates).

## Tech stack

- React 19 + TypeScript
- Vite v7 (build/dev), Vitest v4 (test)
- Tailwind v4 + shadcn/ui v4 (components)
- Zustand v5 (state)
- pnpm (package manager)
- **Web app — no Rust/Tauri/native layer.** Runs in the browser.

### Stack conventions

- **Zustand**: Do not destructure stores in components; use selectors
  (`const x = useXStore((s) => s.x)`). Prefer `useXStore.getState()` inside callbacks.
- **shadcn/ui**: Add components via the CLI; don't hand-copy. Keep customizations in
  wrapper components, not in the generated primitives.
- **TypeScript**: No `any` in committed code. Prefer discriminated unions for provider
  responses and request states (`idle | streaming | done | error`).

## Gates

`pnpm check:all` is the single command that must pass before work is "done". As the project
grows, it should chain (at minimum): `lint` → `test:coverage` → `build`. Add new linters/
checks to this script when you introduce them so they can't be skipped.

- No backend dev server to babysit; for interactive flows, ask the user to run the app.
- Browser E2E (Playwright) is allowed for this web app.

## LLM provider layer

The defining architecture of Lucid. **All model access goes through one provider
abstraction** — never call a vendor SDK directly from UI/feature code.

- **Provider interface**: A single `LLMProvider` contract (e.g. `translate()`, `polish()`,
  `stream()`) implemented per vendor: Anthropic, OpenAI, Gemini, local (Ollama). UI talks to
  the interface; the active provider is user-selectable in settings.
- **Model registry**: Keep model IDs and capabilities in one central config, not scattered
  string literals. Default each provider to its latest capable model. For Anthropic, default
  to the latest Claude models (e.g. `claude-fable-5`, then Opus/Sonnet as fallbacks) — do not
  hardcode older IDs. **Consult the `claude-api` skill before writing Anthropic calls** (model
  IDs, streaming, pricing) rather than relying on memory.
- **Streaming first**: Translation and polish results stream token-by-token. Always handle
  partial streams, user-initiated abort (`AbortController`), and mid-stream errors.
- **Resilience**: Implement retries with backoff, timeouts, and explicit handling for rate
  limits (429) and provider outages. Surface a clear, localized error to the user — never a
  raw stack trace.
- **API keys & secrets**:
  - **Never log API keys, never commit them, never put them in client bundles in plaintext.**
  - Store user keys via the browser's secure mechanisms and treat them as sensitive; redact
    in any diagnostics.
  - Prefer a thin server/proxy for production key handling if/when one is added; document the
    boundary here when it lands.
- **Privacy & transparency**: User text is sent to third-party LLMs. Be explicit in the UI
  about where text goes. The **local/Ollama** provider is the privacy-preserving option — keep
  it a first-class path, not an afterthought.
- **Prompts**: Keep prompt templates in a dedicated module, versioned and unit-tested. Don't
  inline large prompts in component code.

## Domain rules (translation & polish)

- **Preserve structure**: When translating or polishing, preserve the source's formatting —
  Markdown, line breaks, lists, code blocks, inline code, URLs, and placeholders must survive
  round-trips. Test this explicitly.
- **Diff/compare**: Polish results are shown against the original so the user can review and
  accept/reject changes. Treat the diff view as core, not decoration.
- **Language handling**: Support auto-detection of source language. Handle CJK (no word
  spaces), RTL scripts (Arabic, Hebrew), and mixed-script text correctly in both logic and
  layout.
- **Determinism in tests**: Mock the provider layer in unit tests; never hit live APIs in
  `pnpm check:all`. Assert on behavior (structure preserved, abort honored, error mapped),
  not on exact model wording.

## Internationalization (i18n)

Lucid's own UI must be localizable (it's a translation tool — dogfood it).

- All user-facing strings go through `t()`; never hardcode display strings in components.
- Keys are flat, dot-separated camelCase (e.g. `toolbar.translate`, `error.rateLimited`).
- New strings require adding keys to `src/locales/en/*.json`.

## Styling rules

- **Tokens first**: Never hardcode colors; use CSS variables / Tailwind theme tokens.
- **Focus indicators**: MUST be visible (accessibility). Don't remove focus rings without a
  compliant replacement.
- **Dark theme**: Use a single agreed selector (e.g. `.dark`); don't mix mechanisms.
- **Radii / shadows**: Use shared tokens, not per-component magic numbers.

## Writing style

- **Em-dash spacing**: Always use spaces around em-dashes in English: `word — word`, not
  `word—word`. (Applies to UI copy, docs, and commit messages.)

## Mermaid diagrams

- Use Mermaid v11 syntax. Quote node labels containing special characters: `["Label (detail)"]`.
  No trailing semicolons. Prefer `flowchart` over `graph`.

## AI coding tool auth

- **Prefer subscription auth over API keys** for coding tools (Claude Code via Claude Max,
  Codex CLI via ChatGPT Plus/Pro, Gemini CLI via Google login). Sustained coding on API
  billing can cost 10–30× more. API keys are a fallback for light/automated use.
- This is separate from the app's *runtime* provider keys above.
