# Features

Feature tracker for lucid. Lifecycle: `TODO → PLANNED → IN PROGRESS → DONE → VERIFIED`
(see `.claude/rules/47-feature-workflow.md`). One row per feature.

| ID | Title | Status | Priority | Notes |
|----|-------|--------|----------|-------|
| 1 | Project scaffold — Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Zustand + Vitest, wired to a `pnpm check:all` gate | VERIFIED | High | The app foundation: build tooling + the LLM provider layer (Anthropic, behind the single interface) + config store + i18n, behind a minimal placeholder shell. All 7 WIs merged (v0.0.1 → v0.1.0). Plan: `dev-docs/plans/20260614-feature-1-project-scaffold.md` (Gate 2: 3 Codex rounds). Verified: `dev-docs/verification/feature-1-20260614.md`. GH: #1 |
| 2 | Lucid Workspace UI — translate + polish product surface (header + main-toolbar provider switcher, translate pane, polish pane with result/diff); no sidebar (→ #3) | PLANNED | High | Plan: `dev-docs/plans/20260614-feature-2-workspace-ui.md` (v5). Gate 2 closed via rule-47 accept after 3 Codex rounds (`019ec6a0` → `019ec6bb`: MAJOR GAPS → MAJOR GAPS → NEEDS REVISION). Mock-verified happy-path + headless logic; undesigned surfaces filed as needs-design #13–#18 and skipped (rule 51). Sidebar deferred to #3. 9 WIs. GH: #11 |
| 3 | Sessions & Glossary sidebar — data layer (sessions/tasks history, glossary store, persistence) split out of #2 | TODO | Medium | The sidebar's data + behavior, deferred from #2 per the layout-vs-data split. Depends on #2 + the sidebar layout design (#18). Own Gate-1 plan when started. GH: #19 |
