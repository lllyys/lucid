# Judgment

## Scores

| Criterion | A (throughput) | B (safety) | C (context-hygiene) |
|---|---|---|---|
| (a) Real wall-clock speedup | **9** — waves, parallel Gate 3/4/5a, partial-wave merges, 5a∥next-wave Gate 3 | **6** — serial audit queue, serial 5a default, extra hops (liaison, gate-runner confirmation, repro-scout), next wave waits for full prior merge | **8** — parallel waves cap 3, Gates 1+2 in one dispatch, interleaved integrator |
| (b) Rule 47/48/40 compliance + hooks | **7** — rule 40 preserved (bump→PR in integrator slot), merges from worktrees, tdd-guard fix named; but docs batched inline to orchestrator, minor wave-2/5a ordering inconsistency, no Skill-in-subagent fallback | **9** — hook fixes as blocking Phase 0, orchestrator merge ban, post-return write-set audit, integrator-slot tracker flips, independence rails everywhere | **7** — moves the bump AFTER PR-open, requiring edits to binding rules 40/47 (honest but heaviest deviation); plan-author Write deviation documented; hook fixes included |
| (c) Main-session context hygiene | **8** — ledger + ≤40-line returns, Gate-2 loop off-thread | **8** — digests, caps, orchestrator never runs pnpm/codex/diff | **10** — universal envelope, 30-line cap, `.reports/` overflow, NEVER-inline policy, plan never read by orchestrator |
| (d) Implementability (no invented harness features) | **7** — sound, but silently assumes subagents can invoke `/cc-suite:*` | **8** — flags the Skill-in-subagent risk with a rule-53 fallback | **8** — flags it and mandates a rule-60 §7 Phase-0 spike |
| (e) Simplicity | **9** — 6 agents, 1 new skill, aggressive deletions | **6** — 8 agents + extra pipeline hops | **7** — 8 agents incl. duplicative bug-fixer/doc-scribe |
| **Total** | **40** | **37** | **40** |

**Winner: A's skeleton** (roster consolidation, wave topology, integrator-owned bump→PR→merge tail that keeps rule 40 intact), tied on points with C but preferred as the base because the assignment's purpose is parallel throughput and A achieves it with the fewest artifacts. **Grafted from C:** the universal return envelope + `.reports/` overflow + NEVER-inline policy, plan-author-drives-its-own-Gate-2 (one dispatch, transcripts never touch main), the mandatory plan WI table, the Phase-0 spike. **Grafted from B:** hook-fixes-first as a blocking task, the orchestrator merge ban, pre-spawn/post-return checklists with the write-set diff audit, the Skill-in-subagent fallback text, sibling-test verification at integration, doc-deltas-as-text applied in the integrator's slot.

## Explicit conflict resolutions

1. **Version-bump timing (A/B vs C).** C's bump-at-merge requires rewriting rules 40 and 47. Rejected. **Adopted: implementers never bump and never open PRs. The integrator, in each branch's serial slot, rebases → re-gates → applies doc deltas → bumps (`chore(release): bump version to X.Y.Z`, last commit) → opens the PR → merges from the worktree → tags.** Rule 40's "bump is the last commit before opening the PR" is preserved verbatim; no rule file changes anywhere in this redesign. Rule 47 mandates one PR per WI and its acceptance bars, not the wall-clock moment of PR-open; Gate-4 audit logs are branch-keyed, not PR-keyed, so auditing before PR-open is valid.
2. **Concrete version numbers (A vs B).** B pre-assigns X.Y.Z in briefs — a bounced branch shifts every subsequent number. **Adopted A: the orchestrator assigns bump LEVELS (patch/minor) in merge order; the integrator computes concrete X.Y.Z sequentially at each slot from the current package.json/tag state.** Bounce-safe, still rule-40 "distinct versions in merge order".
3. **Who runs Gate 4 (A/C vs B's audit-liaison).** Codex is the independent auditor regardless of who invokes it (exactly how the current inline skill satisfies rule 48 hard rule 1). B's liaison adds a dispatch hop and a findings handoff per round. **Adopted: the implementer drives its own `/cc-suite:audit` loop in-worktree**, with B's safeguards: the committed audit log's `final_verdict` is hook-checked at merge, the integrator independently verifies sibling tests in the diff, and the orchestrator spot-dispatches the auditor agent on ~1 in 5 branches.
4. **Impact analysis (B's impact-mapper vs A/C fold-in).** **Adopted fold-in: the plan's mandatory WI table (id, tier, depends-on, write-set prefix, design-bundle) IS the impact map, and Codex Gate 2 audits it** — better verification than a same-model mapper. For bugs (no plan), the orchestrator does a cheap inline overlap screen and serializes same-module bugs. No impact agent.
5. **Gate 1+2 ownership (A/B's orchestrator loop vs C's one dispatch).** **Adopted C: planner drives Gates 1+2 in one dispatch**, with Write scoped to `dev-docs/plans/**` — a documented rule-48 deviation-with-cause (a 400-line plan returned inline defeats hygiene, and `/cc-suite:review-plan` needs the file on disk). Author/auditor separation holds: Codex audits, the planner authors.
6. **Docs sync (A's orchestrator batch vs B's deltas vs C's doc-scribe).** Rule 20 requires doc sync in the same change (PR); rule 48 requires one writer for shared docs. **Adopted B, executed by the integrator: implementers return shared-doc deltas as text; the integrator applies them in the branch's slot before the bump commit** — same-PR (rule 20) and one-writer (rule 48) simultaneously. C's doc-scribe cut (post-merge sync violates rule 20; extra agent violates criterion e).
7. **Tracker writes (B's on-branch flips vs A/C orchestrator-on-main).** **Adopted orchestrator-exclusive ownership of `docs/features.md`/`docs/bugs.md`, edited only on main, one row at a time, committed immediately as tiny `chore(tracker)` commits** (established practice — see main-history evidence commits like `1c202f4`). This kills pipe-table rebase conflicts and hook-simulation races, and keeps main clean for worktree spawning. Sequencing preserves the merge gate: IN PROGRESS at dispatch; FIXED/DONE flipped on main immediately BEFORE that branch's integration slot (the gate checks row status at merge time, not flip-commit location); VERIFIED only after the evidence file exists on disk (hook order).
8. **repro-scout (B) vs folded repro.** Folded into the implementer's bug mode (Phase 0.5 first, in-worktree). Open-ended investigation uses the built-in Explore subagent — no custom scout.
9. **bug-fixer as separate agent (C).** Rejected; one `implementer.md` with two briefing modes (WI / bug) halves maintenance.
10. **ai-coding-agents skill.** Not deleted (broader-than-gates reference); every `codex exec` example stamped with `< /dev/null` + a rule-53 banner routing gate-time Codex to `/cc-suite:*`.
11. **Gate-runner confirmation of every implementer pass (B).** Rejected as a mandatory hop; the integrator's post-rebase `check:all` re-run is the real protection. Gate-runner retained as a utility (main-health checks; orchestrator never runs pnpm inline).

---

# FINAL ARCHITECTURE SPEC

Design axiom: **the main session triages, computes the fan-out DAG, dispatches, and integrates envelopes — it never implements, tests, audits, verifies, or reads transcripts.** Six agents, two rewritten workflow skills, one new dispatch skill, four hook fixes. No `.claude/rules/*.md` file changes.

## 0. Universal return envelope (referenced by every agent file)

Every agent's final message uses exactly this shape, hard cap 30 lines / ~350 words:

```
STATUS: DONE | BLOCKED | FAILED
ARTIFACTS: <absolute paths: branch, worktree, plan file, audit log, evidence file, report/log files>
FACTS: <=10 one-line bullets (verdicts, counts, versions, SHAs, threadIds)
NEXT: <the one decision/action the orchestrator must take>
```

Anything longer (gate logs, Codex rawOutput, Playwright traces, repro transcripts) is written to `<worktree>/.reports/*.log` (gitignored) and returned as a path. BLOCKED envelopes must describe left-behind state.

## 1. Final agent roster — `.claude/agents/`

**Delete:** `spec-guardian.md`, `impact-analyst.md`, `manual-test-author.md`, `test-runner.md`, `release-steward.md`.
**Keep/rewrite or create (6 files):**

### 1.1 `planner.md` (rewrite)

```yaml
name: planner
description: Gate 1+2 owner — researches, authors a rule-47 Gate-1 plan into dev-docs/plans/, and drives its own Codex Gate-2 audit loop via cc-suite. Returns a bounded envelope with the WI table. Writes ONLY under dev-docs/plans/.
tools: Read, Grep, Glob, WebSearch, WebFetch, Write, Skill, Bash
```

> Bash is scoped in the body to Gate-2 audit machinery only (cc-suite codex runner, the rule-53 `codex exec … < /dev/null` fallback, `pgrep -x codex` hygiene) — no file writes, no git mutations. (Fix applied post-review: without Bash the fallback ladder and the rule-53 §6 check were unexecutable.)

Body must contain: (1) mission: one feature row → Gate-2-clean plan file on disk; (2) plan schema = rule 47 Gate 1's seven sections, path `dev-docs/plans/YYYYMMDD-feature-N-<slug>.md`; (3) **mandatory WI table** `| WI | tier (foundational/behavioral) | depends-on | write-set prefix(es) | design-bundle path or needs-design |` — the orchestrator computes fan-out from this table mechanically; rule-51 check per UI WI (behavioral UI WI without a committed `dev-docs/designs/` bundle → flag `needs-design`, never invent); (4) Gate-2 loop: `Skill(cc-suite:review-plan)`, rewrite between rounds, max 3; fallback ladder if the Skill tool is unavailable in subagent context: bounded direct `codex exec "<prompt>" < /dev/null` per rule 53 §2 → if codex itself is unavailable, return BLOCKED for orchestrator manual fallback; (5) documented rule-48 deviation-with-cause paragraph for its scoped Write access; (6) forbidden: any write outside `dev-docs/plans/**`, tracker edits, GH writes, git commits, implementation; (7) envelope FACTS: threadId, rounds, verdict, WI count, suggested waves; (8) stop: verdict clean | round 3 exhausted (BLOCKED + open-findings count) | needs-design blocker; (9) `pgrep -x codex` clean before return. No worktree.

### 1.2 `implementer.md` (rewrite)

```yaml
name: implementer
description: Worktree-native TDD implementer — one feature WI or one bug fix end-to-end (Gate 3 + its own Gate-4 Codex audit loop) inside its own worktree. Never touches trackers, package.json, PRs, merges, tags, or GH.
tools: Read, Write, Edit, Bash, Grep, Glob, Skill
skills: react-app-dev
```

Body must contain: (1) two briefing modes — **WI mode** (inputs: plan path + WI id + write-set) and **bug mode** (inputs: issue #; adds Phase 0.5 reproduce-first, root-cause line, RED-test-proving-the-bug, and an explicit rule-51 chrome check: new visible UI without a design bundle → STOP, return BLOCKED `needs-design`, never placeholder); (2) rule-48 cwd-discipline statics in generic form: "your brief carries `WORKTREE:`; `cd "$WORKTREE"` opens EVERY Bash call; `pwd` before first write; mismatch → STOP and report, do not guess; contamination of main has cost hotfix PRs (module-not-found on clean clones)"; (3) TDD RED→GREEN→REFACTOR; **test-commit-before-source-commit per file** on tdd-guard-scoped paths (`src/providers/**`, `src/lib/{translation,polish,providers,sync}/**`, `src/stores/**`), and the note that a tdd-guard block is the gate working, not an error; (4) `pnpm check:all` in the worktree (own `node_modules`), ≤3 attempts; (5) Gate-4 loop: `Skill(cc-suite:audit)` from inside the worktree, fix ALL severities, max 3 rounds, write+commit `.claude/codex-audits/<branch-with-/→->-audit.md` on the branch with frontmatter `branch` (exact), `threadId`, `rounds`, `final_verdict`, `date`; same fallback ladder as planner (`codex exec … < /dev/null` → BLOCKED for auditor-agent manual fallback); (6) shared-doc deltas (`docs/architecture.md`, README, testing guide) returned as text in the envelope, never edited; (7) standing forbidden list: `docs/bugs.md`, `docs/features.md`, `package.json` version, PR create/merge, tags, GH comments, writes outside briefed prefix + sibling-test paths + `.claude/codex-audits/**` + `<worktree>/.reports/**`; (8) rules 49/53 hygiene (no polling waiters, `pgrep -x codex` = 0 before return); (9) envelope FACTS: files-touched count, test counts, gate result, audit threadId/rounds/verdict, root cause (bug mode), pre-FIXED verify result (bug mode), doc-delta present y/n; (10) stop: gate green + audit log committed (`ready-for-integration`) | BLOCKED with reason + left-behind state. Always worktree.

### 1.3 `auditor.md` (rewrite)

```yaml
name: auditor
description: Independent read-only reviewer — manual Gate-2/4 fallback when Codex is genuinely unavailable, and orchestrator spot-checks. Self-serves diffs via read-only git. Never fixes, never implements. Does NOT replace /cc-suite:* gates when they are available.
tools: Read, Grep, Glob, Bash
```

Body must contain: (1) explicit statement of the rule-48 author/auditor invariant and its non-substitution for cc-suite gates; (2) input contract: a worktree/branch path; self-serves `git -C <path> diff origin/main...HEAD` (read-only Bash only — no writes, no checkouts); (3) output schema: findings `[severity, file:line, CONFIRMED|PLAUSIBLE, one-line failure scenario]` + verdict `ship-as-is | fix-first | block`; (4) fallback mode emits the full rule-47 Manual Audit Evidence section (files read, symbols verified, edge cases checked, risks accepted, tests deferred); (5) advisory-until-reviewed; (6) stop after one full pass over changed files.

### 1.4 `gate-runner.md` (new)

```yaml
name: gate-runner
description: Report-only quality-gate executor — runs pnpm check:all (or pnpm test) in a named tree and returns a bounded pass/fail report. Never edits, never commits; installs deps only inside its own named worktree.
tools: Read, Bash
```

Body must contain: (1) brief names the absolute tree path; cd-every-Bash-call discipline; (2) rule 49: run the gate foreground (or native completion channel), no waiters, no dev servers; (3) output: per-stage PASS/FAIL (lint/coverage/build), failing test names, first error block ≤15 lines, full log at `<tree>/.reports/gate-<ts>.log`; (4) forbidden: any write outside `.reports/`, any commit; (5) stop when the gate exits once.

### 1.5 `verifier.md` (rewrite)

```yaml
name: verifier
description: Browser-verification agent — Gate 5a slice checks (branch worktree) and Gate 5b / bug close-gate acceptance (main at merge SHA). Owns an assigned port+profile, writes evidence files, always kills its dev server. Never flips tracker rows.
tools: Read, Write, Bash
skills: verify
```

Body must contain: (1) **refuse to run without `PARAMS: port=<518x> profile=<dir>`** unless the brief explicitly states it is the only browser job (rule 48 browser-instance ownership); (2) rule 49: the dev server it starts is an owned long-runner — kill it and confirm before returning; (3) 5b/close-gate: write `dev-docs/verification/{feature|bug}-<id>-<YYYYMMDD>.md` **in the main checkout** with the practiced frontmatter (`kind/id/status_target/commit_sha` (40-hex) `/app_version/date/verifier/browser/os_version/build_mode/provider/result: pass|partial|fail`) + body sections per SCHEMA.md; never flip tracker rows (orchestrator does, after the file exists — hook order); (4) discovered bugs are reported in the envelope for orchestrator triage, never fixed; (5) determinism rule (mock provider transport or local Ollama; never assert exact remote-LLM text); (6) envelope: result, evidence path, ≤8 observation bullets, screenshots dir path, server-stopped + port-released confirmation; (7) stop: criteria exercised, or BLOCKED naming the specific missing tool (vague "tooling unavailable" is banned per rule 47 Gate 5).

### 1.6 `integrator.md` (new)

```yaml
name: integrator
description: The single serial merge-tail owner. Given an ordered branch list with bump levels — per branch, FROM ITS WORKTREE — rebase, re-gate, apply doc deltas, bump package.json, open the PR, merge, tag, clean up. Exactly one instance ever runs.
tools: Read, Write, Edit, Bash
```

Body must contain: (1) input contract: ordered list of `{worktree abs path, branch, bump level (patch|minor|major), PR title/body content incl. "Part of feature #N" | "Refs #N" line + Gate-5a record, doc-delta text}`; (2) per-item procedure, cwd discipline binding on every Bash call: `cd <worktree>` → fetch → rebase onto `origin/main` (mechanical conflicts only; semantic conflicts → mark `bounced`, continue to next item) → re-run `pnpm check:all` (fail → bounced) → apply doc-delta text (rule 20 same-PR) → verify every tdd-guard-scoped source file in the diff has a sibling test (missing → bounced) → **compute concrete X.Y.Z at this slot** from current package.json/latest tag + bump level → commit `chore(release): bump version to X.Y.Z` as the last commit → push → `gh pr create` (never `Fixes #N`) → **`gh pr merge --squash --delete-branch` FROM the worktree** (so `check_codex_audit_artifact.sh` binds) → from the main checkout: pull, annotated tag `v<X.Y.Z>` on the merge commit, `git push --follow-tags` → `git worktree remove` + artifact cleanup (`node_modules`/Vite cache); (3) forbidden: source edits beyond mechanical conflict resolution, reordering the list, inventing bump levels, `--no-verify`, merging while `git branch --show-current` = main, bypassing a hook block (return the block verbatim per rule 60 §9); (4) envelope: one line per item `branch | version | PR# | merge SHA | tag | ok|bounced(reason)`; (5) stop: list exhausted (bounced items enumerated, nothing skipped silently).

## 2. Skill / command deltas

### 2.1 Create `.claude/skills/dispatch/SKILL.md` (new — see §3 for content)

### 2.2 Rewrite `.claude/skills/feature-workflow/SKILL.md`

Convert from inline driver to orchestration playbook (topology in §4a). Required changes: (1) keep the entry/resume table verbatim, extend it with a "resume from GH timeline + ledger" row for mid-WI state; (2) Gate 1+2 = one planner dispatch; orchestrator commits the plan file, flips PLANNED (file-feature first), posts the Gate-2 timeline comment; (3) Gate 3+4 = wave-dispatched implementers per the plan's WI table (deps + disjoint write-sets, cap 3 concurrent; cc-suite queues audits); (4) drop the `git diff main` dump step entirely; drop the per-WI bump/PR steps (moved to integrator); (5) Gate 5a = verifier dispatches with distinct ports (pool 5180-5189), may overlap with running Gate-3 work; (6) Gate 6 = one integrator dispatch per ready set, orchestrator posts per-WI timeline comments from the returned table; (7) Gate 5b = verifier on main at final merge SHA; orchestrator commits evidence + VERIFIED flip together, posts closure comment, closes issue; (8) complete the hooks table (add tdd-guard.mjs, both Stop hooks); (9) add rule-51 design-bundle pointers to Gate-1 required content; (10) adopt rule 47's batch-Gate-4 allowance for mechanical same-surface WIs; (11) add the **NEVER-inline** section (§5) and the ledger format; (12) tracker-write policy: orchestrator-only, main-only, tiny immediate commits; (13) reference `.claude/skills/dispatch/SKILL.md` for all brief mechanics (no duplicated templates); (14) orchestrator is **forbidden from running `gh pr merge`** — merges belong to the integrator, from worktrees.

### 2.3 Rewrite `.claude/skills/fix-issue/SKILL.md`

(1) Single-issue: classify inline (`gh issue view` one-liner; questions answered inline; features redirect to /feature-workflow unchanged) → file-bug stamp + IN PROGRESS flip (orchestrator, main, committed) → clean-main check → worktree `issue-<N>` → implementer (bug mode, Phases 0.5–6a + Gate 4 + audit log) → for UI-visible fixes, a verifier 5a-style slice dispatch → FIXED flip (orchestrator, main, immediately before integration) → integrator (single-item list, patch level) → shipped comment + `awaiting-browser-verification` label (orchestrator) → close-gate via the verify cron or an explicit verifier dispatch (skill states the handoff: cron owns the backlog; same-session dispatch is optional for urgency). (2) Multi-issue M3 rewritten: inline overlap screen (same-module bugs serialize) → N parallel implementers (cap 3) → single integrator pass in orchestrator-chosen order → labels/comments inline → close-gate serialized (one browser) or port-parallel. (3) Fix the named defects: delete the unimplementable "resume each worktree-agent" step (integrator replaces it); `agent-*` cleanup glob → `issue-*` + explicit artifact-cleanup pass; add the clean-main precondition; add the rule-51 checkpoint reference (lives in implementer bug mode); merges always from worktrees; slug fallback for fully-CJK titles (`issue-<N>` when the slug is empty); tracker flips removed from agent scope entirely. (4) Reference the dispatch skill; add the NEVER-inline section.

### 2.4 Delete

- `.claude/commands/feature-workflow.md`, `.claude/commands/fix-issue.md` (stale, contradictory, name-colliding — rule 20)
- `.claude/skills/plan-audit/`, `.claude/skills/plan-verify/`, `.claude/skills/workflow-audit/`, `.claude/skills/planning/`, `.claude/skills/release-gate/` (unreferenced/legacy/independence-violating; planning schema folds into planner.md; release-gate folds into gate-runner.md)

### 2.5 Modify

- `.claude/commands/fix.md`: keep philosophy + output contract + empty-args and CSS-only rules; **add mandatory handoff**: "if the target is a GH-tracked bug → use /fix-issue (audit log, tracker, close gate are non-optional there)"; add a rule-51 line for fixes introducing chrome; remove the dead `31-design-tokens.md` pointer.
- `.claude/commands/file-bug.md`, `.claude/commands/file-feature.md`: reduce each to a ≤5-line pointer at its skill (single source per rule 20).
- `.claude/skills/ai-coding-agents/SKILL.md`: prepend a rule-53 banner ("gate-time Codex goes only through /cc-suite:*"); stamp `< /dev/null` on every `codex exec` example including the stdin-piped variant (delete that variant).
- `.claude/README.md`: update agent/skill listings to this roster.
- `.gitignore`: ensure `.claude/worktrees/` and `.reports/` are ignored.
- Hooks + SCHEMA (see task T1, §6).

## 3. Dispatch protocol — lives in `.claude/skills/dispatch/SKILL.md`

Contract encoded twice, split by volatility: **statics** (cwd discipline, forbidden lists, envelope, stop conditions, hook awareness, rule 49/53 hygiene) live in each agent's `.md`; **variables** live in the brief. Both workflow skills reference this skill and embed no templates of their own.

The skill must contain, verbatim:

**(a) The brief template** (every spawn, rule-48 six-field contract):

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

**(b) The rule-48 worktree preamble**, copied **verbatim** from `.claude/rules/48-parallel-execution.md` §"Copy-pasteable preamble template", appended to every brief that carries `WORKTREE:` — no small-task exemption. (The agent-side statics do not replace this; rule 48 mandates the preamble in the brief itself. Both exist by design.)

**(c) Pre-spawn checklist:** main tree clean (`git status --porcelain` empty); worktree created at `.claude/worktrees/<feature-<id>-wi-<n> | issue-<N>>/` via `git worktree add … -b <branch>`; absolute path in brief; GH issue + `GH: #N` stamp already on the row; dependency edges satisfied (deps MERGED, not just PR'd); write-set pairwise-disjoint against every in-flight job; concurrency ≤3 implementers; port assigned if browser.

**(d) Post-return checklist:** main checkout still clean; `git -C <worktree> diff --name-only origin/main...HEAD` ⊆ briefed write-set (+ sibling tests, audit log, `.reports/`); contamination smell → inspect main's working tree before accepting anything.

**(e) Failure policy (rule 48 verbatim):** output advisory until reviewed → re-brief ONCE narrower → collapse to main and discard; discarded worktrees removed whole (`git worktree remove --force` + artifact cleanup); main is never repaired around a drifted agent.

**(f) Resource registry:** port pool 5180–5189 + per-run Playwright profile dirs; max 3 concurrent implementers; one integrator instance ever; one browser job unless ports assigned; cc-suite queues Codex jobs (bounded by codex-runner timeout per rule 53).

**(g) The ledger format** (orchestrator's inline working state): `job | agent | branch | write-set | port | status | verdict/version`.

## 4. Parallel topologies — orchestrator playbooks (embedded in the two workflow skills)

### (a) One feature, N WIs

1. **Inline pre-flight:** read the feature row only; `git status --porcelain` clean; `/clear` if prior unrelated context.
2. **Dispatch planner** (Gates 1+2, one dispatch). On BLOCKED `needs-design`: file the needs-design issue automatically (rule 51), annotate the row Notes, stop that slice.
3. **Inline:** commit the plan file; `file-feature` if no GH ref; flip row PLANNED (tiny main commit); post Gate-2 timeline comment (plan path, threadId, rounds, verdict, WI list with tiers).
4. **Compute waves** from the WI table: strata by `depends-on`; within a stratum, only pairwise-disjoint write-sets run together; cap 3.
5. **Per wave:** create worktrees from clean main; dispatch implementers **in one message**; update ledger.
6. **Per envelope:** run the post-return checklist; drift → re-brief once → collapse+discard.
7. **Gate 5a:** dispatch verifiers for behavioral WIs with distinct ports — may run while other implementers are still in Gate 3 (rule 48 matrix: mixed Gate 5 + Gate 3 OK).
8. **Integration:** assemble the ordered ready-list (bump levels: intermediate WI = patch, final WI = minor, breaking = major); flip DONE on main only when this slot is the final WI; **dispatch the integrator once** for the ready set. Post one per-WI timeline comment per returned row (WI+tier, PR#, version, merge SHA, Gate-4 verdict, 5a result). Bounced branches → re-dispatch to a fresh implementer on the same worktree, re-queue in a later integrator call.
9. **Next wave:** dispatch after its dependencies' branches have MERGED (worktrees created from the updated main). Independent later-strata WIs may join earlier waves if write-sets stay disjoint.
10. **After the final WI merges:** flip row DONE; post "Shipped in vX.Y.Z (commit <sha>). Awaiting Gate 5" + `awaiting-browser-verification` label.
11. **Gate 5b:** dispatch verifier on main at the merge SHA. `pass` → commit evidence + VERIFIED flip together, closure comment citing the evidence file, `gh issue close`. `partial` → stays DONE + follow-up filed. `fail` → back to IN PROGRESS + rework dispatch.
12. **End-of-flow checklist:** ledger closed; no live worktrees unaccounted; `pgrep -x codex` = 0; no background shells (rule 49).

### (b) N independent bugs

1. Inline: classify each (`gh issue view` one-liners); overlap screen — bugs plausibly touching the same module serialize into the same slot.
2. `file-bug` stamps; flip all rows IN PROGRESS (one tiny main commit); clean-main check.
3. Create `issue-<N>` worktrees; dispatch implementers (bug mode) in parallel, cap 3.
4. Per envelope: post-return checklist; UI-visible fixes get a verifier slice (distinct ports if parallel).
5. Flip FIXED rows on main (pre-FIXED verify confirmed in each envelope), immediately before integration.
6. **One integrator dispatch:** ordered list, all patch level — sequential versions computed at merge time.
7. Per merged PR (inline): shipped comment + `awaiting-browser-verification` label.
8. Close-gate: defer to the verify cron (default) or dispatch verifiers serially/port-parallel.
9. Cleanup checklist as in (a)12.

### (c) Mixed feature-WIs + bugs

One global ledger, one integration queue, one version sequence. Disjointness is checked across the **whole** active set (a bug touching `src/providers/x.ts` blocks a WI touching it — rule 48 hard rule 3 knows no feature/bug distinction). Bugs typically queue first (patch), then feature WIs, in one orchestrator-chosen merge order; the single integrator instance is the only serialization point. Codex cap and browser ports are shared across both pipelines. Gate-2-of-a-plan never overlaps Gate-3-on-that-plan (rule 48 matrix); everything else overlaps freely by write-set.

## 5. Context-hygiene rules (written policy — the "NEVER inline" section of both workflow skills)

**Never enters the main session:** full `git diff` output; `pnpm check:all`/test/build logs; Codex rawOutput or audit transcripts; Playwright/dev-server transcripts and screenshots; plan bodies (the WI table arrives in the planner's envelope; the plan is referenced by path thereafter); bug-repro transcripts; bulk source reads; full `gh pr view` bodies; rebase/merge output (integrator returns a table).

**The orchestrator MAY read inline:** single tracker rows, agent envelopes, one-line `gh` results, `--name-only` diff lists for the post-return checklist.

**The orchestrator NEVER runs:** `pnpm` anything, `codex`, Playwright, `gh pr merge`, or `git diff` beyond `--name-only`.

**Enforcement mechanics:** every envelope capped at 30 lines; overflow to `<worktree>/.reports/` as paths; needing detail = dispatch auditor/Explore, not reading. Per rule 60 §8: new session per feature for 5+-WI features; `/clear` between unrelated batches; the ledger + tracker rows + GH timeline are the resumable state (survives session death). Re-brief once on drift, then collapse (rule 48).

## 6. Ordered implementation task list (disjoint file ownership — fan-out safe)

Merge order: **T1 first** (blocking — parallel Gate 3 without it removes TDD enforcement exactly where supervision is weakest), **T8 last**. T0 and T2–T7 may be implemented in parallel (this spec defines all shared vocabulary verbatim; no task reads another's output).

| # | Task | Owned files (disjoint) |
|---|---|---|
| **T0** | Phase-0 spike (rule 60 §7): confirm a subagent can invoke `Skill(cc-suite:status)` from a worktree; record PASS/FAIL — FAIL promotes the `codex exec … < /dev/null` fallback to primary in T3/T4 wording | `dev-docs/grills/agent-redesign/spike-skill-in-subagent.md` |
| **T1** | **Hook fixes + schema sync (blocking PR #1):** tdd-guard.mjs repoRoot → walk up from the edited file to nearest `.git`/`package.json` (activates enforcement inside `.claude/worktrees/**`); check_unfinished_verification.sh column bug `cells[5]/[6]` → `cells[3]/[5]`; check_terminal_status_evidence.sh — delete the phantom `verify-skip:` bypass text from the block message; check_audit_debt.sh window 5 → 25 commits; SCHEMA.md → practiced frontmatter (`kind/id/status_target/commit_sha/app_version/date/verifier/browser/os_version/build_mode/provider/result`). Manual verification steps recorded in the PR (no test harness for hooks) | `.claude/hooks/tdd-guard.mjs`, `.claude/hooks/check_unfinished_verification.sh`, `.claude/hooks/check_terminal_status_evidence.sh`, `.claude/hooks/check_audit_debt.sh`, `dev-docs/verification/SCHEMA.md` |
| **T2** | Dispatch skill (§3 content verbatim) + gitignore entries | `.claude/skills/dispatch/SKILL.md`, `.gitignore` |
| **T3** | Read-only/plan agents per §1.1, §1.3 | `.claude/agents/planner.md`, `.claude/agents/auditor.md` |
| **T4** | Writer agents per §1.2, §1.4 | `.claude/agents/implementer.md`, `.claude/agents/gate-runner.md` |
| **T5** | Tail agents per §1.5, §1.6 | `.claude/agents/verifier.md`, `.claude/agents/integrator.md` |
| **T6** | feature-workflow rewrite per §2.2 + playbook §4(a)/(c) + policy §5 | `.claude/skills/feature-workflow/SKILL.md` |
| **T7** | fix-issue rewrite per §2.3 + playbook §4(b)/(c) + policy §5 | `.claude/skills/fix-issue/SKILL.md` |
| **T8** | Deletions + pointers + stamps per §2.4/§2.5 (deletes the 5 agent files, 2 commands, 5 skill dirs; converts fix.md/file-bug.md/file-feature.md; stamps ai-coding-agents; updates `.claude/README.md`) | `.claude/agents/{spec-guardian,impact-analyst,manual-test-author,test-runner,release-steward}.md`, `.claude/commands/{feature-workflow,fix-issue,fix,file-bug,file-feature}.md`, `.claude/skills/{plan-audit,plan-verify,workflow-audit,planning,release-gate}/`, `.claude/skills/ai-coding-agents/SKILL.md`, `.claude/README.md` |

**Invariants the crew must not violate while building:** no edits to any `.claude/rules/*.md` (the design deliberately fits rules 40/47/48/49/51/53 as written); the four hook trigger conditions and path derivations stay byte-compatible (only the named defects change); the entry/resume table, max-3-round bars, append-only GH timeline, Refs-not-Fixes, and `pnpm check:all` as the single gate survive verbatim in the rewritten skills.