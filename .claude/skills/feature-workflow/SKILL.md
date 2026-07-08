---
name: feature-workflow
description: "Run the binding 6-gate feature workflow (/feature-workflow) end-to-end per rule 47 (Plan → Independent Plan Audit → TDD Implementation → Implementation Audit Loop → Browser/Integration Verification → Merge) — as an ORCHESTRATION playbook: the main session dispatches planner/implementer/verifier/integrator agents and integrates their envelopes; it never implements, tests, audits, or merges inline. Use this skill whenever the user wants to implement a new feature in lucid, asks 'implement feature #N', 'work on feature 47', 'start the feature workflow', 'build the provider-switch UI', 'plan + build feature X', or describes building a new capability that doesn't yet exist. NOT for fixing broken implementations (that's fix-issue). The skill drives the row from `TODO` → `VERIFIED` through six gates that must never be skipped — author/auditor separation, evidence files, hook compliance are all binding."
---

# Feature Workflow — orchestration playbook (rule 47, six gates, never skip one)

Drives a feature from `TODO` → `VERIFIED` through the binding 6-gate sequence
in `.claude/rules/47-feature-workflow.md` (Plan → Independent Plan Audit → TDD
Implementation → Implementation Audit Loop → Browser/Integration Verification →
Merge → close gate).

**Design axiom**: the main session (you, the orchestrator) triages, computes the
fan-out DAG, dispatches agents, and integrates their bounded return envelopes —
it **never** implements, tests, audits, verifies, merges, or reads transcripts.
Gates run inside dispatched agents:

| Gate | Who runs it | Agent file |
|---|---|---|
| 1 + 2 | one planner dispatch (authors plan + drives its own Codex Gate-2 loop) | `.claude/agents/planner.md` |
| 3 + 4 | wave-dispatched implementers (TDD + own Gate-4 Codex loop, in worktrees) | `.claude/agents/implementer.md` |
| 5a | verifier dispatches (branch worktree, assigned port) | `.claude/agents/verifier.md` |
| 6 | one integrator dispatch per ready set (rebase → re-gate → bump → PR → merge → tag) | `.claude/agents/integrator.md` |
| 5b | verifier dispatch on main at the merge SHA | `.claude/agents/verifier.md` |

**All brief mechanics** — the brief template, the rule-48 worktree
preamble (verbatim, no small-task exemption), pre-spawn / post-return
checklists, the failure policy, and the resource registry — live in
`.claude/skills/dispatch/SKILL.md`. Follow it for every spawn; never improvise
or duplicate briefs here.

## Input and scope guard

`$ARGUMENTS` is the feature identifier — a numeric id from `docs/features.md`
(e.g. `48`) or a short slug (e.g. `materializing-restore`). If empty, list
`TODO`/`PLANNED` candidates and ask the user to pick. **Features only**
(capabilities never implemented) — fixing a broken implementation is
`/fix-issue`; the bug-vs-feature distinction is binding per AGENTS.md.

## Entry / resume table

Note the current row status, then check whether
`dev-docs/plans/*-feature-<id>-*.md` exists. The combination decides where to
enter:

| Row status | `dev-docs/plans/*-feature-<id>-*.md` present? | Enter at |
|---|---|---|
| `TODO` | no | **Gate 1** (write the plan) |
| `TODO` | yes (drafted ahead, not yet audited) | **Gate 2** |
| `PLANNED` | no | **Gate 1** (drawing up the plan IS the work — do not bail out) |
| `PLANNED` | yes, no audit revision history | **Gate 2** |
| `PLANNED` | yes, audited (revision history shows clean Gate 2) | **Gate 3** |
| `IN PROGRESS` | yes (assumed) | **resume next pending WI / re-enter Gate 4 if a WI is mid-audit** |
| `IN PROGRESS`, mid-WI state unclear (session died) | yes | **resume from GH timeline + ledger**: rebuild the ledger from the GH issue's gate-progress comments + the tracker row + `git worktree list` + branch/audit-log state, then re-enter at the first incomplete step |
| `DONE` | yes | **Gate 5b** (post-merge final acceptance) |
| `VERIFIED` | yes | already complete; nothing to do |

**Do not stop because the plan doc is missing** — it is Gate 1's deliverable,
not a precondition. Only TODO/IDEA-level rows whose row-template itself is
empty (no Problem/Scope/Edge Cases at all) redirect to /triage.

---

# Playbook — one feature, N WIs

1. **Inline pre-flight:** read the feature row only; `git status --porcelain`
   clean; `/clear` if prior unrelated context. Re-confirm this is a feature,
   not a bug (bug → redirect to `/fix-issue`, STOP).
2. **Dispatch planner** (Gates 1+2, one dispatch). On BLOCKED `needs-design`:
   file the needs-design issue automatically (rule 51), annotate the row Notes,
   stop that slice.
3. **Inline:** commit the plan file. If the row lacks `GH: #N`, the working
   order is: create the GH issue directly with `gh issue create` (using
   file-feature's title/label/body format — the file-feature skill itself
   refuses `TODO` rows, and the mirror hook blocks a bare `PLANNED` flip),
   then flip the row `PLANNED` **and** stamp `GH: #N` in ONE single Edit (the
   mirror hook simulates the post-edit content, so the combined edit passes);
   commit and push the tiny main commit. Post the Gate-2 timeline comment
   (plan path, threadId, rounds, verdict, WI list with tiers).
4. **Compute waves** from the WI table: strata by `depends-on`; within a
   stratum, only pairwise-disjoint write-sets run together; cap 3.
5. **Per wave:** create worktrees from clean main; dispatch implementers **in
   one message**; update the ledger.
6. **Per envelope:** run the post-return checklist (dispatch skill); drift →
   re-brief once → collapse+discard.
7. **Gate 5a:** dispatch verifiers for behavioral WIs with distinct ports —
   may run while other implementers are still in Gate 3 (rule 48 matrix:
   mixed Gate 5 + Gate 3 OK).
8. **Integration:** assemble the ordered ready-list (bump levels: intermediate
   WI = patch, final WI = minor, breaking = major); flip `DONE` on main only
   when this slot is the final WI; **dispatch the integrator once** for the
   ready set. Post one per-WI timeline comment per returned row (WI+tier, PR#,
   version, merge SHA, Gate-4 verdict, 5a result). Bounced branches →
   re-dispatch to a fresh implementer on the same worktree, re-queue in a later
   integrator call.
9. **Next wave:** dispatch after its dependencies' branches have MERGED
   (worktrees created from the updated main). Independent later-strata WIs may
   join earlier waves if write-sets stay disjoint.
10. **After the final WI merges** (row already flipped `DONE` at step 8 —
    that flip's timing is authoritative; do not flip again): post "Shipped in
    vX.Y.Z (commit <sha>). Awaiting Gate 5" + `awaiting-browser-verification`
    label (or `verification-exception` / `verification-blocked` per AGENTS.md).
11. **Gate 5b:** dispatch verifier on main at the merge SHA. `pass` → commit
    evidence + `VERIFIED` flip together, closure comment citing the evidence
    file, `gh issue close`. `partial` → stays `DONE` + follow-up filed.
    `fail` → back to `IN PROGRESS` + rework dispatch.
12. **End-of-flow checklist:** ledger closed; no live worktrees unaccounted;
    `pgrep -x codex` = 0; no background shells (rule 49).

---

# Gate detail — what each dispatch must satisfy

## Gates 1 + 2 — one planner dispatch

Brief the planner with the feature row's id/title/Problem field. It authors
`dev-docs/plans/YYYYMMDD-feature-<id>-<slug>.md` (rule 47 Gate 1's seven
sections, including the **mandatory WI table**
`| WI | tier | depends-on | write-set prefix(es) | design-bundle path or needs-design |`)
and drives its own `/cc-suite:review-plan` Gate-2 loop. Author/auditor
separation holds: Codex audits, the planner authors (rule 48).

**Rule-51 design gate in Gate-1 content**: every behavioral WI that introduces
UI must name the committed `dev-docs/designs/<bundle>/` artifact depicting its
surface; a UI WI without a bundle is flagged `needs-design` in the WI table —
the planner never invents UI, and neither do you.

**Gate 1 acceptance bar**: plan file exists at the documented path with all
required sections filled in.

**Gate 2 acceptance bar**: zero open Critical/High/Medium findings; Low
findings fixed or explicitly accepted with rationale in the plan; **maximum 3
audit rounds** — if unresolved findings remain after round 3, STOP and escalate
to the user (accept, defer, or redesign). If Codex is genuinely unavailable,
the planner returns BLOCKED and you dispatch the auditor agent for the rule-47
`Manual Audit Evidence` fallback — never skip the audit.

**On the planner's DONE envelope (inline):** commit the plan file; if the row
lacks `GH: #N`, create the GH issue with `gh issue create` (file-feature's
title/label/body format), then flip the row `PLANNED` and stamp `GH: #N` in
one single Edit (see step 3's ordering); post the Gate-2 timeline comment. The WI table arrives in the envelope —
reference the plan by path thereafter; do not read its body.

> **Hard dependency**: Gate 3 cannot start on an unaudited plan (rule 48 matrix).

## Gates 3 + 4 — wave-dispatched implementers

**Wave computation** (from the plan's WI table):

- Stratify WIs by `depends-on` — a WI enters a wave only after every dependency
  has **MERGED** (not just PR'd).
- Within a stratum, only WIs with **pairwise-disjoint write-set prefixes** run
  concurrently. Overlap → serialize (rule 48 hard rule 3).
- Cap **3 concurrent implementers**. cc-suite queues their Gate-4 Codex audits.
- Create each worktree from **clean main** at
  `.claude/worktrees/feature-<id>-wi-<n>/` with branch
  `feat/feature-<id>-wi-<n>-<slug>`; dispatch the whole wave **in one message**.

Each implementer (WI mode) runs RED → GREEN → REFACTOR, `pnpm check:all` in
its worktree, then its own Gate-4 `/cc-suite:audit` loop, committing
`.claude/codex-audits/<branch-with-/→->-audit.md` on the branch. Shared-doc
deltas return as envelope text — implementers never edit shared docs,
trackers, `package.json`, or PRs.

**Status transition**: when the first wave dispatches, flip the row
`IN PROGRESS` (tiny main commit).

**Gate 3 acceptance bar (per WI)**: tests pass under `pnpm check:all`; new code
follows codebase conventions.

**Gate 4 acceptance bar (per WI)**: zero open Critical/High/Medium findings;
Low findings fixed or accepted with rationale; **max 3 audit rounds** — after
round 3, escalate. Audit log committed on the branch with valid frontmatter
(`branch`, `threadId`, `rounds`, `final_verdict`, `date`).

**Batch-Gate-4 allowance** (rule 47 audit-count table): mechanical, low-risk
WIs that share the same surface MAY batch under one audit — note the batching
in each covered branch's audit log.

**Spot-check**: on ~1 in 5 branches, additionally dispatch the read-only
auditor agent against the worktree as an independent second look.

**Dropped by design — do not reintroduce:** no `git diff main` dump step
(`--name-only` only, for the post-return checklist), and no per-WI inline
version-bump or PR-open steps — bump, PR, merge, and tag are the integrator's.

## Gate 5a — verifier dispatches (pre-merge slice)

| WI tier | Verification depth (pre-merge) |
|---|---|
| **Foundational** (types, interfaces, pure utilities) | Unit + integration tests + Gate 4 audit suffice — no verifier dispatch |
| **Behavioral** | Verifier dispatch against the WI's worktree: exercise the slice end-to-end in the browser (Playwright where possible; mocked transport or local Ollama for provider features) |
| **Final WI** | Pre-merge slice of the acceptance criteria; defer anything needing a merged-on-main build to 5b |

Assign each verifier a distinct port from the pool **5180–5189** plus its own
profile dir (dispatch skill's resource registry). 5a dispatches may overlap
running Gate-3 work. The verifier's envelope feeds the integrator's PR-body
content; 5a alone never changes row status.

## Gate 6 — one integrator dispatch per ready set

**You are forbidden from running `gh pr merge`.** Merges belong to the
integrator, executed FROM each branch's worktree (so
`check_codex_audit_artifact.sh` binds). You also never bump versions or open
PRs inline.

Assemble the ordered ready-list — per branch: `{worktree path, branch, bump
level, PR title/body content (incl. feature reference + Gate-5a record),
doc-delta text}` — and dispatch the integrator once. Per slot it rebases,
re-runs `pnpm check:all`, applies doc deltas (rule 20 same-PR), verifies
sibling tests, computes the **concrete X.Y.Z at slot time** from current
package.json/tag state + your bump level, commits the bump last, opens the PR,
merges, tags.

**Bump levels (you assign; integrator computes concrete versions):**

| WI | Level |
|---|---|
| Intermediate WI (foundational or behavioral, not final) | `patch` |
| Final WI of the feature | `minor` |
| Breaking change | `major` |

**Reference convention (binding)**: intermediate WI PRs use plain prose
`Part of feature #<gh-issue>` (no magic words — `Refs`/`Fixes` would trip the
merge gate on an open feature); the final WI PR uses `Refs #<gh-issue>`.
**Never `Fixes #N`** — the issue stays open until Gate 5b; auto-close is wrong.

**Gate 6 acceptance bar (per PR)**: tests green post-rebase; Gate-4 audit log
present with `final_verdict` ∈ {ship-as-is, follow-up-recommended}; Gate-5a
slice recorded for the WI's tier; docs sync applied if triggered; version bump
is the last commit before PR-open (rule 40); reference convention satisfied.

**Bounced branches** (semantic rebase conflict, re-gate failure, missing
sibling test): re-dispatch a **fresh implementer on the same worktree** with
the bounce reason as input, then re-queue the branch in a later integrator
call — never repair a bounced branch inline. After the envelope returns, post
the per-WI timeline comments from the returned table and flip statuses.

## Gate 5b + close gate

After the final WI merges (row flipped `DONE`, shipped comment + label
posted): dispatch the verifier on **main at the merge SHA**, with a port
assignment. It runs every acceptance criterion from the plan and writes
`dev-docs/verification/feature-<id>-<YYYYMMDD>.md` per SCHEMA.md (frontmatter
incl. `commit_sha` (40-hex), `app_version`, `result: pass | partial | fail`).

**Result-field semantics (binding)**:

- `pass` — commit the evidence file **and** the `VERIFIED` flip together (the
  evidence file must exist on disk before the tracker edit — hook order); post
  the closure comment citing the evidence file; `gh issue close`.
- `partial` — row stays `DONE`; file the follow-up; a follow-up evidence file
  is required.
- `fail` — row back to `IN PROGRESS`; file a bug; dispatch rework; do NOT close.

Non-browser-reproducible features close under `verification-exception` with a
high-fidelity integration test at real subsystem boundaries; harness-missing
features stay open under `verification-blocked` with a follow-up filed.

> **"Tooling unavailable" is NOT an acceptable deferral reason** unless a
> specific tool is named and confirmed missing. "I'll do it next session" is a
> discipline lapse, not a tool-unavailability claim.

---

# GH issue gate-progress timeline (append-only, short, factual)

The GH issue is the running record of the feature's path through the gates
(rule 47). Post one comment per transition; back-fill before the next
transition if one was skipped. Never paste plan contents into the issue.

| Transition | Comment records |
| --- | --- |
| Gate 2 passes (issue just created) | plan path + audit verdict (Codex threadId + rounds, or `manual-fallback`) + the WI list with foundational/behavioral tiers |
| Each WI's PR merges (Gate 6) | WI number + tier, PR number, version bumped to, merge-commit SHA, Gate 4 audit verdict, Gate 5a slice result |
| Final WI merges → row `DONE` | "Shipped in vX.Y.Z (commit `<sha>`). Awaiting Gate 5" — do not double-post a per-WI comment for the final WI |
| Gate 5b acceptance pass → row `VERIFIED` | evidence-file path + `result:` + a one-line acceptance-criteria summary, posted just before `gh issue close` |

# Mixed mode — feature WIs + bugs in flight together

One global ledger, one integration queue, one version sequence. Disjointness
is checked across the **whole** active set (a bug touching
`src/providers/x.ts` blocks a WI touching it — rule 48 hard rule 3 knows no
feature/bug distinction). Bugs typically queue first (patch), then feature WIs,
in one orchestrator-chosen merge order; the single integrator instance is the
only serialization point. Codex cap and browser ports are shared across both
pipelines. Gate-2-of-a-plan never overlaps Gate-3-on-that-plan (rule 48
matrix); everything else overlaps freely by write-set.

# NEVER inline — context-hygiene policy (binding)

**Never enters the main session:** full `git diff` output; `pnpm
check:all`/test/build logs; Codex rawOutput or audit transcripts;
Playwright/dev-server transcripts and screenshots; plan bodies (the WI table
arrives in the planner's envelope; the plan is referenced by path thereafter);
bug-repro transcripts; bulk source reads; full `gh pr view` bodies;
rebase/merge output (the integrator returns a table).

**The orchestrator MAY read inline:** single tracker rows, agent envelopes,
one-line `gh` results, `--name-only` diff lists for the post-return checklist.

**The orchestrator NEVER runs:** `pnpm` anything, `codex`, Playwright,
`gh pr merge`, or `git diff` beyond `--name-only`.

**Enforcement mechanics:** every envelope is capped at 30 lines; overflow goes
to `<worktree>/.reports/` and comes back as paths; needing detail = dispatch
the auditor or Explore, not reading it yourself. Per rule 60 §8: start a **new
session per feature** for 5+-WI features; `/clear` between unrelated batches;
the **ledger + tracker rows + GH timeline are the resumable state** (they
survive session death). Re-brief once on drift, then collapse (rule 48).

# Tracker-write policy (orchestrator-only)

`docs/features.md` (and `docs/bugs.md`) are edited by the orchestrator ONLY,
on **main** only, **one row at a time**, each flip committed immediately as a
tiny `chore(tracker)` commit **and pushed immediately** (`git push`) — unpushed
tracker commits make local main diverge from remote after the integrator's
merges, which its post-merge `git pull --rebase` step tolerates but the next
wave's worktrees should never be created from stale main. Agents never touch
trackers. Sequencing:
`IN PROGRESS` at first dispatch; `DONE` on main immediately before the final
WI's integration slot; `VERIFIED` only after the evidence file exists on disk.

# Hooks you'll trip

| Hook | Event | Triggers when | What it requires |
|---|---|---|---|
| `check_gh_issue_mirror.sh` | PreToolUse `Edit\|Write\|MultiEdit` | edits to `docs/features.md` rows | mirror-required rows (`PLANNED`/`IN PROGRESS`/`DONE`/`VERIFIED`) must have `GH: #N` in Notes column |
| `check_terminal_status_evidence.sh` | PreToolUse `Edit\|Write\|MultiEdit` | tracker flip to `VERIFIED` on `docs/features.md` only (bug `FIXED` flips are NOT hook-enforced — bug evidence is enforced at GH-issue-close, not at the row flip) | matching `dev-docs/verification/feature-<id>-<YYYYMMDD>.md` evidence file exists (existence check) |
| `tdd-guard.mjs` | PreToolUse `Edit\|Write\|MultiEdit` | production-source writes on TDD-scoped paths (`src/providers/**`, `src/lib/{translation,polish,providers,sync}/**`, `src/stores/**`) | a sibling `*.test.ts(x)` must exist — a block on an implementer is the gate working, not an error (test committed first) |
| `check_codex_audit_artifact.sh` | PreToolUse `Bash` | `gh pr merge` on a source-touching PR | `.claude/codex-audits/<branch>-audit.md` with `final_verdict` ∈ {ship-as-is, follow-up-recommended} — binds in the integrator's worktree |
| `check_unfinished_verification.sh` | Stop | session end | surfaces `DONE` rows still awaiting Gate-5b verification — close the gap, don't carry it silently |
| `check_audit_debt.sh` | Stop | session end | surfaces recent source-touching merges lacking audit logs |

Plan around them; never bypass (rule 60 §9 — if a hook blocks legitimate work,
fix the gate, don't skip it).

# The ledger (orchestrator's inline working state)

Maintain one line per in-flight job, updated on every dispatch and envelope:

```
job | agent | branch | write-set | port | status | verdict/version
```

Statuses: `dispatched → returned → verified-5a → queued → merged | bounced |
collapsed`. The ledger + tracker rows + GH timeline are the resumable state —
a fresh session rebuilds the ledger from the latter two + `git worktree list`.

## Error handling

| Scenario | Action |
|---|---|
| Planner returns BLOCKED `needs-design` | File the needs-design issue (rule 51, automatic — never ask), annotate row Notes, stop the slice |
| Implementer returns BLOCKED `needs-design` (WI hit undesigned UI) | File the needs-design issue (rule 51, automatic), annotate the WI row Notes, fix the Gate-1 plan (the WI was misclassified), stop that slice |
| Codex unavailable (planner/implementer BLOCKED on it) | Dispatch the auditor agent for the manual-fallback evidence; `threadId: manual-fallback` |
| 3 audit rounds with findings still open (Gate 2 OR Gate 4) | STOP. Escalate to user — accept, defer, or redesign |
| Implementer envelope fails post-return checklist (write-set drift) | Re-brief once, narrower; still bad → collapse to main, discard the worktree whole |
| Integrator returns `bounced` | Fresh implementer on the same worktree with the bounce reason; re-queue |
| Verifier 5b returns `fail` | Row back to `IN PROGRESS`, file a bug, dispatch rework; do NOT close the issue |

If uncertain at any gate: stop and ask. Never guess your way past a gate.
