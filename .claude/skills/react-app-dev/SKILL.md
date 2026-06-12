---
name: react-app-dev
description: Implement or modify lucid React UI with project conventions (Zustand selectors, Tailwind v4, shadcn/ui). Use for components, hooks, stores, providers, and UI behavior changes.
---

# React App Dev (lucid)

## Overview
Apply lucid frontend conventions for React 19 + Zustand v5 + Tailwind v4 + shadcn/ui. lucid is a browser-only translation + writing-polish app: paste/type text, pick a target language or polish goal, get a streamed result shown as an accept/reject diff. LLM access always goes through the multi-provider layer in `src/providers/` — UI/feature code never calls a vendor SDK directly.

## Workflow
1) Read relevant files before editing (components, hooks, stores, providers, services).
2) Follow the lucid rules in `AGENTS.md` (no store destructuring; use selectors).
3) Keep code files under ~300 lines; split when needed.
4) Prefer local feature boundaries; avoid cross-feature imports.
5) Route all model calls through `src/providers/**` — never import a vendor SDK from UI/feature code.
6) Update tests for new behavior and run `pnpm check:all` when asked.

## References
- `references/paths.md` for common source locations and scans.
- Docs map: `dev-docs/README.md`.
