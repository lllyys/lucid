# Lucid

A web app for **translation and writing-polish**: paste or type text, pick a target
language or a polish goal (clarity, tone, grammar), and get a streamed result you can
compare against the original and accept. Powered by a configurable, multi-provider LLM
layer (Anthropic, OpenAI, Gemini, local/Ollama) behind a single provider interface.

> **Status:** early foundation. This repository currently contains the project scaffold
> (build tooling + app shell) and the agent toolkit under `.claude/`. The provider layer,
> translation/polish flows, and UI are tracked in `docs/features.md` and built feature by
> feature.

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
