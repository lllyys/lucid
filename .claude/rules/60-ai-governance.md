# 60 - AI Governance

Rules for keeping AI-assisted implementation honest across long-running
multi-phase work. Background and field practices: see
`dev-docs/grills/ai-governance-2026-05.md`.

## 1. Plan files are the contract

Long-running features (>1 day, >5 files) must have a plan in
`dev-docs/plans/YYYYMMDD-name.md`. Plans contain ADRs, work items
(`WI-N.M`), and a Definition of Done per phase. Implementation references
the plan; the plan does not chase implementation.

## 2. Work items must be linked

Every WI in a "complete" phase must be traceable in **either** a commit
message **or** a top-of-file comment in its test file:

| Linkage path | Format |
|---|---|
| Commit message | `feat(scope): <change> (WI-1.2)` |
| Test header | `// WI-1.2 — <one-line description>` |

Verify with the WI-linkage checker (`scripts/check-wi-linkage.sh <plan-file>
[--phase=N]`) — the intended gate, **not yet in the repo** (there is no
`scripts/` dir yet), so until it is added, verify linkage by hand against the
table above.

## 3. Phase boundaries are gated by scripts, not prose

Each plan phase has machine-checkable Definition of Done. A per-plan
phase-gate script (`bash scripts/check-<plan>-phase.sh <phase-number>`)
must exit 0 before the plan's Status header ticks to the next phase.

When you start a new long-running plan, author its phase-gate script
(`scripts/check-<plan>-phase.sh`) and fill in per-phase assertions. **No
phase-gate script exists yet** — the first long-running plan creates the first
one (there is no template to copy until then).

## 4. New dependencies are reviewed for hallucination

LLMs hallucinate package names at 5-22% rate (USENIX 2025), with active
slopsquatting attacks. Every PR that adds a dependency should run a
new-dependency check (`scripts/check-new-deps.sh`) — **not yet wired into CI
and not yet in the repo**; until it is, vet new deps by hand against the
criteria below. The check flags packages that:
- Don't exist on npm (404)
- Were created less than 30 days ago
- Have fewer than 1000 weekly downloads

A flagged package isn't necessarily wrong, but it requires explicit
acknowledgment in the PR description before merge.

## 5. Test-first is hook-enforced for high-risk paths

For the high-risk paths, a Claude Code PreToolUse hook in `.claude/hooks/`
blocks `Write`/`Edit` on production source files unless a sibling
`*.test.ts` exists. This is structural enforcement of
`.claude/rules/10-tdd.md`, not a replacement for it.

Scoped to lucid's high-risk paths:
- `src/providers/**` (the LLM provider layer)
- `src/lib/translation/**`
- `src/lib/polish/**`
- `src/stores/**`

Allow-list within scope: `*.test.ts(x)`, `types.ts`, `*.d.ts`, `*.css`.

To extend the scope to a new feature path, edit the `SCOPED` array in
`.claude/hooks/tdd-guard.mjs` (rename or add a parallel hook for larger
features).

## 6. Cross-model review at risk points

Use `/cc-suite:review-plan` against any plan exceeding ~500 lines or
spanning >3 phases before starting Phase 1. Codex (different training data,
different blind spots) catches package-name hallucinations and API
assumptions that a single-model review will miss. This is mandatory for
plans that introduce new external dependencies.

## 7. Spike before commit on high-risk technology choices

When a plan ADR rests on an unverified assumption about an external library
or a provider's API/streaming shape, a Phase 0 spike (under
`dev-docs/grills/<feature>/`) must validate the assumption with a runnable
probe before any other phase commits. A Phase 0 of small, runnable spikes
that each PASS before any feature WI starts is the template.

## 8. Subagent context isolation

Every frontier model degrades from ~300k tokens (Chroma 2025), well below
the 1M ceiling. For verbose tasks (search, audit, research), dispatch a
subagent rather than letting the main thread accumulate context. Use:

| Task class | Subagent |
|---|---|
| Open-ended search across the codebase | `Explore` |
| Multi-source web research | `coding-researcher` |
| Independent plan/code review | `cc-suite:review-plan`, `auditor` |
| Implementation of a single scoped WI | `execution-agent` or `implementer` |

Aggressive `/clear` between unrelated tasks; new session per phase.

## 9. Don't bypass; ask

If a hook or gate blocks legitimate work, fix the gate rather than skip
it. `--no-verify` on `git commit`, removing the hook from
`.claude/settings.json`, or changing the WI-linkage script's regex are all
forbidden without explicit user authorization. Document the bypass reason
if granted.

## 10. Version bump is a single-file, last-commit step

lucid versions in **one place** — `package.json`. The version bump is the
last commit before opening a PR; it does not touch any other manifest. The
mechanics live in `.claude/rules/40-version-bump.md` (this rule does not
duplicate them). The governance point: an AI agent must not invent a
parallel version-bump across multiple files — there is only `package.json`.
