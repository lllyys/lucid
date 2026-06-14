# Features

Feature tracker for lucid. Lifecycle: `TODO → PLANNED → IN PROGRESS → DONE → VERIFIED`
(see `.claude/rules/47-feature-workflow.md`). One row per feature.

| ID | Title | Status | Priority | Notes |
|----|-------|--------|----------|-------|
| 1 | Project scaffold — Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Zustand + Vitest, wired to a `pnpm check:all` gate | VERIFIED | High | The app foundation: build tooling + the LLM provider layer (Anthropic, behind the single interface) + config store + i18n, behind a minimal placeholder shell. All 7 WIs merged (v0.0.1 → v0.1.0). Plan: `dev-docs/plans/20260614-feature-1-project-scaffold.md` (Gate 2: 3 Codex rounds). Verified: `dev-docs/verification/feature-1-20260614.md`. GH: #1 |
| 2 | Lucid Workspace UI — translation + polish product surface (header + provider switcher, sessions/glossary sidebar, translate pane, polish pane with result/diff) | TODO | High | Product UI from a committed design bundle (`dev-docs/designs/lucid-workspace/`, rule 51). Depends on #1 (VERIFIED — provider layer + store + i18n). Large/multi-WI — implement via `/feature-workflow` (Gate 1 plan first), not ad hoc. Triaged 2026-06-14 from a claude.ai/design handoff. GH: #11 |
