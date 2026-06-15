# Lucid

A web app for **translation and writing-polish**: paste or type text, translate it
(automatic two-way Chinese ↔ English) or polish a draft against its original meaning, and get
a streamed result you can compare against the original and accept. Powered by a configurable,
multi-provider LLM layer (Anthropic, OpenAI, Gemini, local/Ollama) behind a single provider
interface.

> **Status:** the workspace is implemented and verified through **v0.4.0** — the
> translate/polish product surface, the provider layer behind the single `LLMProvider`
> interface, dark theme, bidi/RTL, the error/cancelled banner, per-hunk diff accept/reject,
> and the Sessions & Glossary sidebar are all shipped. **Anthropic** is the implemented
> provider today (OpenAI / Gemini / Ollama are registered behind the same interface, not yet
> wired). Verified against a **mocked** provider (the test suite never hits a live API); to
> use it for real, enter your own provider API key in **Settings**. Progress is tracked in
> `docs/features.md`.

## Features

- **Translate** — automatic two-way 中↔EN (direction detected from the source; an override
  controls only the visual layout, never the request). Streams token-by-token; Copy / Accept;
  Stop mid-stream keeps the partial text.
- **Polish** — refine a draft against its original meaning + domain keywords. Result and
  **Compare** (word-level diff) views; per-hunk keep/reject, Keep-all / Reject-all, and an
  explicit **Reject** (discard the polish, keep the draft). Accept commits the chosen changes.
- **Providers** — a single `LLMProvider` contract per vendor (model IDs live in one registry).
  Switch the active provider; enter / clear an API key in Settings (held **in memory for the
  session only — never persisted, never logged**). Streaming-first with retry/backoff, timeouts,
  and localized error states (rate-limited, provider-down, invalid-key, timeout).
- **Sessions & Glossary sidebar** — accepted translate/polish results are recorded as tasks in a
  session (searchable, renamable); a reusable domain **glossary** whose terms feed the polish
  keywords. Persisted locally (localStorage); your text never leaves the device except via the
  active provider.
- **Dark theme** — follows the OS; **i18n** — all UI strings localizable (the app dogfoods its
  own product); **accessibility** — visible focus, AA-checked contrast.

## Tech stack

- React 19 + TypeScript
- Vite 7 (build/dev), Vitest 4 (test)
- Tailwind v4 + shadcn/ui (components)
- Zustand 5 (state)
- pnpm (package manager)

Runs in the browser — no Rust/Tauri/native layer.

## Requirements

- Node.js **>= 20.19** (Vite 7 floor)
- pnpm (pinned via `packageManager` in `package.json`; run with Corepack or a matching
  global pnpm)

## Setup

```bash
pnpm install
pnpm dev          # start the Vite dev server
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Type-check then build for production |
| `pnpm preview` | Preview the production build |
| `pnpm lint` | ESLint over the app + root tooling |
| `pnpm typecheck` | `tsc -b --noEmit` across the project references |
| `pnpm test` | Run the test suite once (Vitest) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Tests with coverage (100% thresholds, scoped to the logic layer) |
| `pnpm check:all` | The full gate — `lint` → `typecheck` → `test:coverage` → `build` |

`pnpm check:all` is the single command that must pass before any change is considered
done.

## Contributing

Contributor and AI-agent guidance lives in `AGENTS.md` (shared) and `.claude/` (rules,
workflows, and skills). Work is test-first; see `.claude/rules/10-tdd.md`. Features and
bugs are tracked in `docs/features.md` and `docs/bugs.md`.
