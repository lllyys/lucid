---
name: fix-issue
description: "End-to-end GitHub issue resolver — the ORCHESTRATION playbook. Classifies inline, then dispatches implementer/verifier/integrator agents: TDD bug fix + Codex audit in a worktree, tracker flips on main, single serial merge tail, post-merge close-gate. Use this skill whenever the user wants to fix a bug from a GH issue, asks 'fix issue #N', 'fix bug 115', 'work on issues #123 #456 #789', 'resolve this GH bug', or pastes a GH issue URL/number for resolution. Also handles `question`-labeled issues (inline answer + comment, no branch). REDIRECTS feature/enhancement issues to feature-workflow per rule 47. Supports both single-issue and multi-issue (parallel worktree) pipelines."
---

# Fix Issue — Orchestration Playbook

You are the **orchestrator**. You triage, flip tracker rows on main, dispatch
agents, and integrate their return envelopes. You never implement, test, audit,
verify, or merge inline. All brief mechanics (brief template, rule-48 worktree
preamble, pre-spawn/post-return checklists, failure policy, port registry,
ledger format) live in `.claude/skills/dispatch/SKILL.md` — reference it for
every spawn; do not restate templates here.

## Input

Parse the user's request to extract one or more issue numbers (e.g. `#123`,
`123`, `#123 #456`). If no numbers were provided, print usage and STOP.

## Scope

| Issue type | Path inside this skill |
|---|---|
| Bug (label `bug` or body describes broken behavior) | Single-issue pipeline below |
| Question (label `question`) | Inline answer + comment, no branch/PR |
| Feature / enhancement | **REDIRECT** to `/feature-workflow` (see below) |
| Multiple issues at once | Multi-issue pipeline (one worktree per issue) |

### Feature handling — read this before fixing a feature here

`.claude/rules/47-feature-workflow.md` is **binding for every feature
implementation**: Plan → Independent plan audit → TDD → Implementation
audit → Browser/integration verification → Merge. Six gates, never skip
one. **Always redirect features to `/feature-workflow`. STOP this
pipeline.** No user waiver bypasses Gates 2 or 5 — rule 47 is binding for
every feature regardless of size.

## Hooks in play

| Hook | Triggers when | What it requires |
|---|---|---|
| `check_codex_audit_artifact.sh` | `gh pr merge` on a source-touching PR | `.claude/codex-audits/<branch-with-/→->-audit.md` with valid frontmatter (`branch`, `threadId`, `rounds`, `final_verdict`, `date`). The implementer writes and commits it; the integrator merges **from the worktree** so the hook binds |
| `check_gh_issue_mirror.sh` | `Edit/Write/MultiEdit` on `docs/{features,bugs}.md` | mirror-required rows must have `GH: #N` in Notes column |
| `check_terminal_status_evidence.sh` | tracker flip to `VERIFIED` on `docs/features.md` | matching `dev-docs/verification/` evidence file. **Bug `FIXED` flips on `docs/bugs.md` are NOT hook-enforced** — verification is enforced at GH-issue-close time, not at row flip |
| `tdd-guard.mjs` | agent `Write/Edit` on TDD-scoped source paths (works inside `.claude/worktrees/**`) | sibling test exists — a block is the gate working, not an error; the implementer handles it |

Plan around them; never bypass (rule 60 §9).

## Ownership invariants (binding)

- **Tracker flips are orchestrator-only, main-only.** `docs/bugs.md` /
  `docs/features.md` are edited only by you, only on main, one row at a time,
  each committed immediately as a tiny `chore(tracker): …` commit **and pushed
  immediately** (`git push`) — unpushed tracker commits leave local main
  divergent from remote after the integrator's merge (its post-merge step is
  `git pull --rebase` for exactly this reason, but don't rely on it). No agent
  ever touches a tracker file.
- **Merges are integrator-only, always from worktrees.** You are forbidden
  from running `gh pr merge`. Version bump (rule 40) + PR + merge + tag live
  in the integrator's serial slot.
- **Rule-51 checkpoint lives in the implementer's bug mode**: a fix that would
  introduce new visible chrome without a committed `dev-docs/designs/` bundle
  returns BLOCKED `needs-design`. On that envelope: file the `needs-design`
  issue automatically (rule 51 — never ask), annotate the bug row's Notes with
  `BLOCKED: needs-design (#<new>)`, stop that slice.

---

# Single-Issue Pipeline

### 1. Classify (inline)

```bash
gh issue view {N} --json number,title,body,labels,state,assignees
```

- Not found or closed: warn user, ask whether to proceed, or STOP.

| Classification | Trigger | Path |
|---|---|---|
| Bug | label contains `bug`, or body mentions error/crash/broken | continue |
| Feature | label contains `feature`/`enhancement` | **redirect to `/feature-workflow`**, STOP |
| Question | label contains `question` | **Question Path** below |
| Ambiguous | no matching labels | ask user to classify |

### 2. Stamp + IN PROGRESS flip (orchestrator, on main)

- If the `docs/bugs.md` row lacks `GH: #{N}` in Notes, add it (the `/file-bug`
  skill covers the mirror-an-existing-row case; the issue already exists here,
  so stamping the ref usually suffices).
- No `docs/bugs.md` row exists for #{N} at all (bug filed directly on GH) →
  create the row first (the `/triage` skill owns row creation), then stamp
  and flip.
- Flip the row → `IN PROGRESS`. Commit immediately:
  `chore(tracker): bug #{N} IN PROGRESS`.

### 3. Clean-main check + worktree

- `git status --porcelain` on main must be **empty** before spawning — a dirty
  main poisons the worktree's git context (rule 48). Dirty → stop and resolve
  (never revert unrelated changes silently).
- Slug from title: lowercase, strip non-ASCII, spaces → `-`, truncate to
  40 chars. **Fallback**: if the slug is empty (e.g. a fully-CJK title),
  use the bare form — branch `fix/issue-{N}`, no trailing hyphen.

```bash
git worktree add .claude/worktrees/issue-{N} -b fix/issue-{N}-{slug} main
```

### 4. ONE implementer dispatch (bug mode)

Dispatch `implementer` per the dispatch skill (brief template + rule-48
worktree preamble verbatim). Bug-mode inputs: issue #, worktree absolute path,
allowed-writes prefix. The implementer owns, in-worktree:

- Phase 0.5 reproduce-first + root cause; RED test proving the bug;
  GREEN → REFACTOR; rule-51 chrome check.
- `pnpm check:all` gate (≤3 attempts).
- Gate-4 Codex audit loop (`/cc-suite:audit`, max 3 rounds, fix ALL
  severities) + the committed audit log on the branch.
- Pre-FIXED verify (symptom actually gone against the working-tree build —
  bugs.md workflow is Understand → RED → GREEN → REFACTOR → **Verify** →
  Track; pure-logic bugs are covered by the RED→GREEN transition).
- Shared-doc deltas (`docs/architecture.md`, README) returned as text in the
  envelope — never edited by the implementer.

On return, run the dispatch skill's post-return checklist (main still clean;
`--name-only` diff ⊆ briefed write-set + sibling tests + audit log +
`.reports/`). Drift → re-brief once → collapse and discard.

### 5. Optional verifier slice (UI-visible fixes)

If the fix changes user-visible behavior, dispatch `verifier` for a 5a-style
slice against the branch worktree (assign port + profile per the dispatch
skill's registry if anything else holds a browser). Logic-only fixes skip
this — the RED test + pre-FIXED verify in the envelope suffice.

### 6. FIXED flip (orchestrator, on main, immediately before integration)

Only after the envelope confirms pre-FIXED verify passed: flip the
`docs/bugs.md` row → `FIXED`, commit `chore(tracker): bug #{N} FIXED`. The
merge gate checks row status at merge time; flipping right before the
integrator's slot keeps the window minimal. (The evidence hook does not gate
bug `FIXED` — see hooks table.)

### 7. Integrator dispatch (single-item list, patch level)

Dispatch `integrator` with a one-item ordered list:
`{worktree path, branch, bump: patch, PR title/body content (Refs #{N} —
never Fixes), doc-delta text from the envelope}`. In its slot it rebases,
re-runs `pnpm check:all`, applies doc deltas (rule 20, same PR), verifies
sibling tests, computes the concrete patch version, commits
`chore(release): bump version to X.Y.Z` last, opens the PR, **merges from the
worktree**, tags `vX.Y.Z` on main, removes the worktree + artifacts. A
`bounced` return → re-dispatch a fresh implementer on the same worktree,
re-queue in a later integrator call.

### 8. Shipped comment + label (orchestrator, inline)

**Do NOT auto-`gh issue close`.** Per AGENTS.md, the close gate is
**verified, not just merged** — `FIXED` ≠ closed. Right after the merge:

1. Label the GH issue:
   - **Default — `awaiting-browser-verification`**: failure can be reproduced
     in the browser. Most bugs.
   - **Exception — `verification-exception`**: failure mode physically cannot
     be browser-reproduced (race conditions, fault-injection paths, mid-stream
     abort/network failures, concurrent provider switches). Requires a
     deterministic high-fidelity integration test at real subsystem boundaries
     (not casual stubs) + evidence file in `dev-docs/verification/`.
   - **Blocked — `verification-blocked`**: neither is feasible yet. Keep open
     with a follow-up to build the harness.
2. Comment, using the integrator's returned version + SHA:

   ```
   gh issue comment {N} --body "Shipped in v{X.Y.Z} (commit {short-sha}). Awaiting {browser-verification|verification-exception evidence}."
   ```

### 9. Close-gate

**The verify cron owns the close-gate backlog by default** — the
`awaiting-browser-verification` label queues the issue for `/verify`, which
re-runs the original repro against merged main, writes the evidence file
(`dev-docs/verification/bug-{N}-{YYYYMMDD}.md` per `SCHEMA.md` frontmatter:
`kind/id/status_target/commit_sha` (40-hex)
`/app_version/date/verifier/browser/os_version/build_mode/provider/result`),
posts the closure comment (commit SHA + what was tested + what was observed),
and closes. A **same-session verifier dispatch is optional for urgency**: run
`verifier` on main at the merge SHA; on `pass`, commit the evidence file, post
the closure comment citing it, `gh issue close {N}`. If verification reveals a
regression: reopen, file a new bug, do NOT close.

---

# Question Path

1. **Research** — read code and docs to compose a thorough answer.
2. **Detect language** — reply in the **same language** the author used.
3. **Respond**: `gh issue comment {N} --body "{answer in author's language}"`
4. **STOP** — no branch, no PR, no version bump, no close gate.

---

# Multi-Issue Pipeline

For `#123 #456 #789`-style requests. Same ownership invariants; one ledger,
one integration queue, one version sequence.

### M1. Classify + overlap screen (inline)

- `gh issue view` one-liner per issue. Filter out closed (warn), questions
  (answer inline), features (redirect each to `/feature-workflow`).
- **Overlap screen**: bugs plausibly touching the same module/files serialize
  into the same slot — one implementer handles them sequentially in one
  worktree, or the second waits for the first's merge. Write-sets must be
  pairwise-disjoint across the whole active set (rule 48 hard rule 3 knows no
  feature/bug distinction — a concurrent feature WI counts too).

### M2. Stamps + flips + worktrees

- `GH: #N` stamps where missing; flip all rows → `IN PROGRESS` in **one** tiny
  main commit. Clean-main check.
- Create `issue-{N}` worktrees from clean main (slug fallback as above).

### M3. Parallel implementer dispatches

Dispatch N `implementer` (bug mode) briefs **in one message**, cap 3
concurrent. Per returned envelope: post-return checklist; drift → re-brief
once → collapse+discard. UI-visible fixes get verifier slices (distinct
ports + profiles per the dispatch skill's registry if parallel).

### M4. FIXED flips + single integrator pass

- Flip `FIXED` on main for each envelope whose pre-FIXED verify passed
  (tiny commits), immediately before integration.
- **One integrator dispatch**: ordered list in orchestrator-chosen merge
  order, all patch level. The integrator computes sequential concrete
  versions at each slot from the then-current `package.json`/tag state — never
  pre-assign X.Y.Z (a bounced branch would shift every subsequent number).
  Bounced items → fresh implementer on the same worktree, re-queue.

### M5. Per-PR comments/labels + close-gate

- Per merged row in the integrator's table: shipped comment + label, inline
  (step 8 above).
- Close-gate: defer to the verify cron (default), or dispatch verifiers —
  **serialized** (one browser) or **port-parallel** per the dispatch skill's
  resource registry. Never two browser jobs on one port/profile.

### M6. Cleanup + end-of-flow checklist

- The integrator removes each merged worktree and runs the artifact-cleanup
  pass (each worktree carries its own `node_modules` + Vite cache — rule 48).
- Sweep leftovers: `git worktree list` accounted for; stray dirs match
  `.claude/worktrees/issue-*` (keep failed worktrees for investigation, remove
  the rest with `git worktree remove` + artifact cleanup).
- Ledger closed; `pgrep -x codex` = 0; no background shells (rule 49).

### Mixed bugs + feature WIs

When bugs run alongside `/feature-workflow` WIs: one global ledger, one
integration queue, one version sequence. Disjointness is checked across the
whole active set. Bugs typically queue first (patch), then feature WIs, in one
orchestrator-chosen merge order; the single integrator instance is the only
serialization point. Codex cap and browser ports are shared across both
pipelines.

---

## NEVER inline (context hygiene — binding)

**Never enters this session:** full `git diff` output; `pnpm check:all`/test/
build logs; Codex rawOutput or audit transcripts; Playwright/dev-server
transcripts and screenshots; bug-repro transcripts; bulk source reads; full
`gh pr view` bodies; rebase/merge output (the integrator returns a table).

**You MAY read inline:** single tracker rows, agent envelopes, one-line `gh`
results, `--name-only` diff lists for the post-return checklist.

**You NEVER run:** `pnpm` anything, `codex`, Playwright, `gh pr merge`, or
`git diff` beyond `--name-only`.

**Enforcement:** every envelope is capped at 30 lines; overflow lives at
`<worktree>/.reports/` as paths. Needing detail = dispatch `auditor`/Explore,
not reading. `/clear` between unrelated batches; the ledger + tracker rows +
GH timeline are the resumable state. Re-brief once on drift, then collapse
(rule 48).

## Error Handling

| Scenario | Action |
|---|---|
| No arguments | Print usage, STOP |
| Issue not found / closed | Warn, ask user |
| Issue is a feature | Redirect to `/feature-workflow`, STOP |
| Dirty main at spawn time | Stop; resolve before creating worktrees (never revert unrelated changes) |
| No labels (ambiguous type) | Ask user to classify |
| Implementer BLOCKED `needs-design` | File the `needs-design` issue, annotate row Notes, stop that slice |
| Implementer BLOCKED (gate 3x / Codex unavailable after fallback ladder) | Report envelope facts, keep worktree, STOP that slice |
| Envelope diff exceeds briefed write-set | Re-brief once narrower → collapse and discard the worktree |
| Integrator returns `bounced` | Fresh implementer on the same worktree, re-queue in a later integrator call |
| `check_gh_issue_mirror.sh` blocks tracker edit | Add `GH: #N` to the row's Notes column, retry |
| `check_codex_audit_artifact.sh` blocks merge | Audit log missing/invalid on the branch — back to the implementer; never bypass |
| `check_terminal_status_evidence.sh` blocks tracker edit | Fires only for feature `VERIFIED` flips — write the evidence file first |
| Verification reveals a regression | Reopen the issue, file a new bug, do NOT close |
