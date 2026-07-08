---
name: dispatch
description: "how the orchestrator briefs, spawns, and accepts parallel subagents — the brief template, worktree preamble, pre-spawn/post-return checklists, failure policy, resource registry, and ledger format (use when dispatching any agent or running /feature-workflow or /fix-issue fan-out)"
---

# Dispatch

The single source for brief mechanics. Both workflow skills
(`/feature-workflow`, `/fix-issue`) reference this skill and embed no
templates of their own — if a brief field, checklist item, or resource limit
changes, it changes here and nowhere else.

The dispatch contract is encoded twice, split by volatility: **statics** (cwd
discipline, forbidden lists, the return envelope, stop conditions, hook
awareness, rule 49/53 hygiene) live in each agent's `.md` under
`.claude/agents/`; **variables** live in the brief. A brief never restates an
agent's standing contract — it fills in the job-specific values.

## The brief template

Every spawn uses this template (the rule-48 subagent contract):

```
OBJECTIVE: <one sentence — the deliverable>
INPUTS: <exact file paths / issue # / plan path + WI id / findings text — never "you have context">
WORKTREE: <ABSOLUTE path>            # omit for planner/auditor/gate-runner-on-main
ALLOWED WRITES: <path prefix(es)> | none
FORBIDDEN: <deltas beyond the agent's standing list>
OUTPUT: return envelope per your agent contract
STOP: <explicit completion criteria>
PARAMS: <port=518x profile=<dir> | bump levels + ordered merge list | round budget>
```

## The worktree preamble (rule 48, verbatim)

The block below is copied verbatim from
`.claude/rules/48-parallel-execution.md` §"Copy-pasteable preamble template".
It is appended to **every** brief that carries `WORKTREE:` — there is no
small-task exemption. The agent-side cwd-discipline statics do NOT replace it:
rule 48 mandates the preamble in the brief itself, so both exist by design.

```
## CRITICAL OPERATIONAL — binding

Your worktree path is: <ABSOLUTE-WORKTREE-PATH>

Every `Bash` tool call you issue MUST begin with `cd "<ABSOLUTE-WORKTREE-PATH>"`.
Before your first edit or write, run `pwd` and confirm it prints the worktree
path. If `pwd` does NOT match, stop and report — do NOT attempt to recover by
guessing.

The Agent harness creates the worktree but does NOT set your initial cwd to
it. Your Bash tool starts with cwd = the orchestrator's main checkout
(`/Users/ll/Desktop/workspace/lucid`). A single Bash call that forgets the `cd`
prefix can write to the main checkout instead of your worktree; stray files
then get committed or imported and break the build on every clean clone with
module-not-found / unresolved-import errors. Standing precedent: this class of
contamination has required hotfix PRs to restore main, and careful agents have
had to self-rescue from the same drift mid-flow.

This is binding for every Bash call, not just the first. Do not skip this in
the interest of brevity.
```

## Pre-spawn checklist

Run before every spawn. Each item is scoped to the spawn types it applies to —
only the applicable items must hold, and a failed applicable item blocks the
spawn, not the review. For the initial planner dispatch (no worktree by design,
GH issue not yet created — feature-workflow creates it AFTER Gate 2), only
item 1 applies.

1. *(all spawns)* Main tree clean: `git status --porcelain` is empty.
2. *(worktree spawns only — brief carries `WORKTREE:`)* Worktree created at
   `.claude/worktrees/<feature-<id>-wi-<n> | issue-<N>>/`
   via `git worktree add <path> -b <branch>`.
3. *(worktree spawns only)* The worktree path in the brief is **absolute**,
   not relative.
4. *(spawns for an already-tracked WI/bug slice — i.e. post-Gate-2:
   implementer/verifier/integrator)* The GH issue exists and the `GH: #N`
   stamp is already on the tracker row.
5. *(worktree spawns only)* Dependency edges satisfied: every dependency's
   branch is MERGED, not just PR'd.
6. *(worktree spawns only)* Write-set is pairwise-disjoint against every
   in-flight job (check the ledger — rule 48 hard rule 3 knows no feature/bug
   distinction).
7. *(implementer and browser spawns)* Concurrency within limits: ≤3
   implementers running; a port + profile assigned from the registry if the
   job needs a browser.

## Post-return checklist

Run on every envelope before accepting the agent's work:

1. Main checkout clean **apart from the agent's briefed main-checkout
   deliverables**: every path in `git status --porcelain` in
   `/Users/ll/Desktop/workspace/lucid` must be within the brief's ALLOWED
   WRITES. Two agents legitimately leave uncommitted files on main by design —
   the planner (`dev-docs/plans/**`) and the 5b verifier
   (`dev-docs/verification/**` + screenshots); the orchestrator commits those
   after return. Anything else is contamination.
2. Write-set diff audit — every file the agent touched is within its brief:

   ```bash
   git -C <worktree> diff --name-only origin/main...HEAD
   ```

   The output must be a subset of the briefed write-set, plus sibling tests,
   the committed audit log (`.claude/codex-audits/**`), and `.reports/`.
3. Contamination smell (main's `git status` shows files outside the briefed
   deliverables, or the branch imports modules whose source isn't tracked on
   the branch) → treat the envelope as suspect and inspect main's working
   tree before accepting anything.
4. No committed contamination — a drifted agent that ran
   `git add && git commit` from the main-checkout cwd leaves main's status
   clean, so also check:

   ```bash
   git -C /Users/ll/Desktop/workspace/lucid log origin/main..main --oneline
   ```

   The output must contain only the orchestrator's own
   `chore(tracker)`/plan/evidence commits. Any unexpected commit → treat as
   contamination and inspect before accepting anything.

## Failure policy (rule 48)

- Subagent output is **advisory until reviewed** by the orchestrator.
- If it drifts, **re-brief ONCE** with a narrower task. Don't ask it to
  self-correct indefinitely.
- If still bad, **collapse to the main agent and discard** the subagent's
  output. Never merge or apply unreviewed work.
- Discarded worktrees are removed whole: `git worktree remove --force
  <path>` plus artifact cleanup (the worktree's own `node_modules` and Vite
  cache).
- **Main is never repaired around a drifted agent** — discard the drift; do
  not patch the main checkout to accommodate it.

## Resource registry

| Resource | Limit |
|---|---|
| Dev-server / Playwright ports | pool **5180–5189**, one per browser job, plus a per-run Playwright profile dir |
| Concurrent implementers | max **3** |
| Integrator | exactly **one instance ever** — the single serial merge tail |
| Browser jobs | **one** at a time unless each job has its own assigned port + profile |
| Codex (Gate 2/4 audits) | cc-suite queues Codex jobs, each bounded by the codex-runner timeout per rule 53 |

## The ledger format

The orchestrator's inline working state — one row per dispatched job, updated
on every spawn and every envelope:

```
job | agent | branch | write-set | port | status | verdict/version
```

## Universal return envelope

Quoted exactly from the architecture spec §0 — agents and skills both
reference it:

> Every agent's final message uses exactly this shape, hard cap 30 lines /
> ~350 words:
>
> ```
> STATUS: DONE | BLOCKED | FAILED
> ARTIFACTS: <absolute paths: branch, worktree, plan file, audit log, evidence file, report/log files>
> FACTS: <=10 one-line bullets (verdicts, counts, versions, SHAs, threadIds)
> NEXT: <the one decision/action the orchestrator must take>
> ```
>
> Anything longer (gate logs, Codex rawOutput, Playwright traces, repro
> transcripts) is written to `<worktree>/.reports/*.log` (gitignored) and
> returned as a path. BLOCKED envelopes must describe left-behind state.
