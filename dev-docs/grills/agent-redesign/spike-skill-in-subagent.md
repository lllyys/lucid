# Spike — can a spawned subagent invoke the Skill tool (plugin skills)?

- **Date:** 2026-07-08
- **Spec:** `dev-docs/plans/20260708-agent-arch-redesign.md`, §6 row T0 (rule 60 §7 Phase-0 spike)
- **Verdict:** **PASS** (with caveat below)

## Context

The redesign specs the planner and implementer agents to drive their own cc-suite
gate loops from inside a dispatched subagent: `Skill(cc-suite:review-plan)` for
Gate 2 and `Skill(cc-suite:audit)` for Gate 4 (§1.1, §1.2). If a subagent cannot
invoke plugin skills at all, that design collapses to the rule-53 §2 fallback
(bounded direct `codex exec "<prompt>" < /dev/null`) or to main-session-only
cc-suite calls. This spike probes the assumption empirically before any agent
file hardcodes it.

## Probes run

1. **Skill tool exposure.** Inspected the tool set exposed to this spawned
   subagent: a `Skill` tool is present, and the available-skills list includes
   the plugin-namespaced `cc-suite:*` skills (`cc-suite:status`,
   `cc-suite:audit`, `cc-suite:review-plan`, …).
2. **Live invocation.** Called `Skill(skill: "cc-suite:status")` (harmless
   status query, no Codex job launched).
3. **End-to-end usability.** Executed the loaded skill's step-1 command — a
   `node -e` import of the plugin's
   `~/.claude/plugins/cache/xiaolai/cc-suite/0.8.0/scripts/lib/job-control.mjs`
   and a `buildStatusSnapshot(process.cwd())` call.
4. **Rule-53 fallback viability.** `command -v codex`.

## Raw observed results

- Probe 1: `Skill` tool present in the subagent harness; `cc-suite:*` skills
  listed as invocable.
- Probe 2: invocation returned `Launching skill: cc-suite:status` and injected
  the skill's full workflow instructions into the subagent turn — no
  unknown-skill error, no permission block.
- Probe 3: the skill's backing script ran and returned valid JSON:
  `{"running": 0, "recent": 0, "latestFinished": null, "reviewGate": null}`.
- Probe 4: `command -v codex` → `/opt/homebrew/bin/codex` (exit 0). The rule-53
  §2 direct fallback (`codex exec "<prompt>" < /dev/null`) is viable on this
  machine as a secondary path.

## Verdict — Skill-in-subagent: PASS

A spawned subagent can invoke plugin skills, including `cc-suite:*`, and execute
their backing scripts. The planner/implementer designs (§1.1 item 4, §1.2
item 5) can keep `Skill(cc-suite:…)` as the PRIMARY gate path, with the rule-53
fallback ladder retained as written: Skill tool unavailable → bounded direct
`codex exec … < /dev/null` → codex unavailable → return BLOCKED for orchestrator
manual fallback.

## Caveat (honest scope limit)

This probe ran inside a **workflow-orchestration subagent** (spawned by a
script, with a broad default tool set), not an **Agent-tool custom agent**
defined by a `.claude/agents/*.md` file with an explicit `tools:` frontmatter
list. The harness is close but not identical: a custom agent only receives the
tools its frontmatter names, so `Skill` must appear in `tools:` (as §1.1/§1.2
already spec) — and whether frontmatter-granted `Skill` resolves plugin-scoped
skills identically was not directly observed here. Also, cc-suite's job state
keys on `process.cwd()`; a worktree-cwd invocation reads/writes worktree-local
job state, which is acceptable (each implementer owns its own audit loop) but
worth knowing. First real planner/implementer dispatch should confirm the PASS
holds in the custom-agent harness before removing any fallback wording.

## Consequence line

**PASS →** keep `Skill(cc-suite:*)` primary in `planner.md`/`implementer.md`;
fallback ladder unchanged. **(If a later custom-agent run shows FAIL →** the
codex-exec-direct fallback (rule 53 §2, stdin from `/dev/null`) becomes the
PRIMARY path in `planner.md`/`implementer.md` wording, and cc-suite runs only
from the main session on the orchestrator's behalf when needed.)
