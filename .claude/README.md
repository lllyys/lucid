# .claude/ — AI Development Configuration

This directory contains configuration for AI coding tools — primarily [Claude Code](https://docs.anthropic.com/en/docs/claude-code), with cross-tool support via `AGENTS.md` at the project root.

`lucid` is a React 19 + TypeScript + Vite web app (Vitest, Tailwind v4, shadcn/ui, Zustand, pnpm) for **translation + writing-polish**: paste or type text, pick a target language or a polish goal (clarity / tone / grammar), and get a streamed result shown as an accept/reject diff against the original. LLM access goes through a configurable **multi-provider layer** (Anthropic / OpenAI / Gemini / local Ollama) behind one provider interface — UI and feature code never call a vendor SDK directly. It runs entirely in the **browser**: there is no Rust, no Tauri, and no native/desktop/iOS layer.

## Prerequisites

### Codex CLI (for `/cc-suite:*` audit commands)

The `cc-suite` plugin uses OpenAI's Codex as an independent second opinion for code audits, driving it via `codex exec` (a killable, deadline-bounded CLI runner). Claude writes the code; Codex audits it independently, catching blind spots a single model would miss. This cross-model verification is built into `/cc-suite:audit`, `/cc-suite:audit-fix`, and `/fix-issue`.

```bash
npm install -g @openai/codex
codex login                   # Log in with your ChatGPT subscription (recommended)
codex --version               # Verify it's on PATH
```

Subscription auth (`codex login` with ChatGPT Plus/Pro) is dramatically cheaper than `OPENAI_API_KEY` pay-per-token billing for sustained sessions. API keys work as a fallback (`codex login --with-api-key`). Codex audit logs land in `.claude/codex-audits/<branch>-audit.md` (created on demand by the workflow) and are enforced by the hooks below.

## Quality Gate

`pnpm check:all` is the single command that must pass before work is "done". It chains lint → `test:coverage` → build (Vitest + @testing-library for tests; Playwright for browser E2E where needed).

## Directory Structure

```
.claude/
├── README.md              # This file
├── settings.json          # Team-shared settings: enabled plugins + hooks
├── rules/                 # Auto-loaded project rules
├── commands/              # Project-specific slash commands
├── skills/                # Project-tracked skills (the relevant ones for lucid)
├── agents/                # Subagent definitions for /feature-workflow and /fix-issue
├── hooks/                 # PreToolUse / Stop / UserPromptSubmit hooks
├── cron-prompts/          # Prompts for unattended (cron-driven) sessions
├── tdd-guardian/          # TDD Guardian config (pnpm test / test:coverage)
├── docs-guardian/         # Docs-Guardian config (code → website/guide mappings)
└── loc-guardian.local.md  # Per-file LOC cap + TS/React extraction patterns
```

A personal `settings.local.json` (gitignored) may appear as you approve tool calls; it is not committed.

## Settings (`settings.json`)

| Key | Purpose |
|-----|---------|
| `enabledPlugins` | Team-wide plugin allowlist (see Plugins below) |
| `hooks` | UserPromptSubmit, PreToolUse, and Stop hooks (see Hooks below) |
| `permissions.allow` | Permission allowlist (currently empty) |

## Rules (`rules/`)

Auto-loaded into every Claude Code session as project context. After de-contamination, only rules that apply to lucid's React/Vite web stack remain:

| File | Scope |
|------|-------|
| `00-engineering-principles.md` | Local engineering principles + pointer to `AGENTS.md` |
| `10-tdd.md` | TDD workflow for Vitest, coverage thresholds, test patterns |
| `20-logging-and-docs.md` | Dev docs update policy |
| `22-comment-maintenance.md` | Keep code comments in sync with changes |
| `30-ui-consistency.md` | UI design principles |
| `32-component-patterns.md` | shadcn/ui component, popup, and menu patterns |
| `33-focus-indicators.md` | Accessibility focus rules |
| `34-dark-theme.md` | Dark theme implementation rules |
| `40-version-bump.md` | Web version bump procedure |
| `47-feature-workflow.md` | The binding 6-gate feature workflow |
| `48-parallel-execution.md` | Rules for parallel/concurrent task execution |
| `49-background-shells.md` | Background shell lifecycle (no ghost processes) |
| `51-no-self-designed-ui.md` | UI/UX only from a committed design bundle (no self-designed UI) |
| `53-codex-runner-isolation.md` | Codex runner isolation (no stdin-wedge ghosts) |
| `60-ai-governance.md` | AI governance and audit-loop policy |
| `65-llm-provider-integration.md` | The single LLM provider abstraction (interface, registry, streaming, resilience) |
| `66-translation-polish.md` | Translation & polish domain rules (structure preservation, diff/accept, i18n) |

## Slash Commands (`commands/`)

Project-specific commands (not provided by plugins):

| Command | Purpose |
|---------|---------|
| `/bump` | Bump the app version in `package.json`, commit, tag, push |
| `/cron-bootstrap` | Bootstrap unattended cron-driven sessions |
| `/file-bug` | Pointer at the `file-bug` skill (mirror a `docs/bugs.md` row to GH) |
| `/file-feature` | Pointer at the `file-feature` skill (mirror a `docs/features.md` row to GH) |
| `/fix` | Root-cause bug fixing with TDD (untracked, in-session fixes; GH-tracked bugs → `/fix-issue`) |
| `/merge-prs` | Review and merge open PRs sequentially |
| `/repo-clean-up` | Remove failed GitHub Actions runs and stale remote branches |
| `/test-guide` | Generate manual testing guide |

`/feature-workflow` and `/fix-issue` are skills (below), not command files.

## Skills (`skills/`)

Tracked in git; loaded on demand. All present skills are lucid-relevant (no Tauri / Tiptap / iOS-Simulator skills):

| Skill | When used |
|-------|-----------|
| `ai-coding-agents` | Multi-tool reference (Codex CLI / Claude Code CLI) — rule-53 stamped |
| `cc-suite` | Codex audit-loop helpers |
| `css-design-tdd` | CSS / design-token TDD |
| `dispatch` | Brief mechanics for spawning parallel subagents (templates, checklists, ledger) |
| `feature-workflow` | Orchestration playbook for the binding 6-gate feature workflow (dispatches agents, never implements inline) |
| `file-bug` / `file-feature` | Mirror tracker rows to GitHub issues |
| `fix-issue` | Orchestration playbook for end-to-end GitHub issue resolution (worktree implementers, serial integrator tail) |
| `mcp-dev` / `mcp-server-manager` | MCP server configuration |
| `react-app-dev` | React UI changes (components, hooks, stores) |
| `triage` | Classify reported issues into bugs/features |
| `verify` | Browser/integration verification (Gate 5 + bug close-gate) |

## Agents (`agents/`)

Subagent definitions dispatched by `/feature-workflow` and `/fix-issue` (brief mechanics live in the `dispatch` skill):

| Agent | Role |
|-------|------|
| `planner` | Gate 1+2 — authors the plan and drives its own Codex plan-audit loop; writes only `dev-docs/plans/**` |
| `implementer` | Gate 3+4 — worktree-native TDD implementation (feature WI or bug fix) plus its own Codex audit loop |
| `auditor` | Independent read-only reviewer — manual Gate-2/4 fallback and orchestrator spot-checks |
| `gate-runner` | Report-only quality-gate executor — runs `pnpm check:all` in a named tree, never edits |
| `verifier` | Gate 5a/5b browser verification — owns a port+profile, writes evidence files, never flips tracker rows |
| `integrator` | The single serial merge-tail owner — per branch: rebase, re-gate, doc deltas, bump, PR, merge, tag |

## Hooks (`hooks/`)

Wired up in `settings.json`:

| File | Event | Purpose |
|------|-------|---------|
| `refine_prompt.sh` (+ `refine_prompt.txt`) | UserPromptSubmit | On a `>>>`-prefixed prompt, refines it and blocks the original |
| `tdd-guard.mjs` | PreToolUse (Edit/Write/MultiEdit) | Scoped TDD guard: blocks edits to high-risk source (`src/providers/**`, `src/lib/{translation,polish,providers,sync}/**`, `src/stores/**`) unless a sibling `*.test.ts(x)` exists |
| `check_terminal_status_evidence.sh` | PreToolUse (Edit/Write/MultiEdit) | Blocks flipping a `docs/features.md` row to VERIFIED without a `dev-docs/verification/` evidence file (bug FIXED flips are not hook-enforced — bug evidence gates GH-issue close) |
| `check_gh_issue_mirror.sh` | PreToolUse (Edit/Write/MultiEdit) | Blocks tracker rows that lack a `GH: #N` mirror cross-reference |
| `check_codex_audit_artifact.sh` | PreToolUse (Bash) | Blocks `gh pr merge` without a passing Codex audit log for the branch |
| `check_unfinished_verification.sh` | Stop | Warns (non-blocking) about unfinished verification debt at session end |
| `check_audit_debt.sh` | Stop | Warns about recent merges that skipped the Gate-4 Codex audit |

## Cron Prompts (`cron-prompts/`)

Prompts for unattended, cron-driven sessions (paired with `/cron-bootstrap`). Each logs FIRED/ENDED to `.claude/cron-logs/`:

| File | Task |
|------|------|
| `feature.md` | Pick a feature and run `/feature-workflow` |
| `bugfix.md` | Pick an open `bug` issue and run `/fix-issue` |
| `verify.md` | Run `/verify` over the verification backlog |
| `watchdog.md` | Renew session-only crons + sweep for rule-49 ghost shells |

## Guardian Configs

- **`tdd-guardian/config.json`** — drives the TDD Guardian agents: `pnpm test` / `pnpm test:coverage` with 100% line/function/branch/statement thresholds and enforced red-green-refactor (`stack: node-pnpm`).
- **`docs-guardian/config.json`** — maps code paths (providers, `src/lib/translation`, `src/lib/polish`, diff/streaming, stores, components) to `website/guide/*.md` for staleness audits (`strictness: warn`).
- **`loc-guardian.local.md`** — 300-line pure-LOC cap per file, with TS/React extraction patterns (types → `types.ts`, constants → `constants.ts`, hooks → `use<Name>.ts`, sub-components → new `.tsx`).

## Plugins

Enabled in `settings.json` (`enabledPlugins`):

| Plugin | Source | Purpose |
|--------|--------|---------|
| `frontend-design` | `@claude-code-plugins` | Frontend UI design assistance |
| `cc-suite` | `@xiaolai` | Codex-powered audit / verify / implement loop |
| `tdd-guardian` | `@xiaolai` | Strict TDD orchestration and coverage gates |
| `claude-english-buddy` | `@xiaolai` | English review/correction and prompt refinement |
| `docs-guardian` | `@xiaolai` | Code ↔ docs staleness audits |

Codex (via `cc-suite`) powers the independent cross-model audit loop.

## Related Files (Project Root)

| File | Purpose |
|------|---------|
| `AGENTS.md` | Single source of truth for AI tool instructions (read by Claude, Codex, etc.) |
| `CLAUDE.md` | Claude Code entry point — `@AGENTS.md` directive |
