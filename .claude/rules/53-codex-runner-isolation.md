# 53 — Codex Runner Isolation (no more stdin-wedge ghosts)

## The failure

`codex exec "<prompt>"` passes the prompt as an argument but **also reads
stdin**. In a non-tty shell — every `run_in_background` Bash, every cron-driven
agent session — stdin never reaches EOF, so Codex prints

```
Reading additional input from stdin...
```

and **blocks forever at 0% CPU**. The process is a ghost: alive in `ps`, no
output, no completion, no failure. Observed 2026-06-01: one such ghost lingered
**4h20m**, and a freshly-launched audit wedged the same way the moment it ran in
a backgrounded shell.

A long-runner with no liveness signal and no timeout is the failure class. The
same shape as the `pgrep -f` waiter in **rule 49** (`49-background-shells.md`) —
a background job watching a class of work, not a specific instance — except here
the job never even produces a heartbeat to wait on.

## Aggravator (what made it invisible)

Redirecting the backgrounded Codex's stdout to a side `/tmp` file
(`codex exec … > /tmp/audit.txt`) instead of letting it flow to the task-output
file. The task-output file then looked empty/dead, so the harness's own
liveness display and completion notification had nothing to show — the wedge was
invisible until someone ran `ps`.

## The canonical isolated runner: cc-suite

lucid drives Codex through **cc-suite**, which wraps `codex exec` in a runner
(`codex-runner.mjs`) that is **bounded** (`--timeout-ms`, default 15 min),
**stdin-isolated**, **job-tracked**, and **killable**. The MCP bridge is NOT
used — it has no controllable timeout and hangs on long single responses. This
is the runner the project actually uses (e.g. for Gate-2 plan audits per
`47-feature-workflow.md`), and it is the default to reach for.

Invoke it through the `/cc-suite:*` commands rather than by hand:

| Task | Command |
|---|---|
| Plan audit (Gate 2) | `/cc-suite:review-plan` |
| Code/artifact audit (Gate 4) | `/cc-suite:audit` |
| Audit-then-fix loop | `/cc-suite:audit-fix` |
| Check job / get result / cancel | `/cc-suite:status` · `/cc-suite:result` · `/cc-suite:cancel` |

The runner prints one JSON line (`{"jobId","status","threadId","rawOutput"}`)
with `status` ∈ `completed | failed | stalled`. On `stalled` it has **already
terminated** the Codex process at the deadline, so a wedge can no longer linger.
Because every call is registered as a job, `/cc-suite:status` and
`/cc-suite:cancel` give you exact-identity control — never a `pgrep`-style
class match (the rule-49 anti-pattern).

## Hard rules

1. **Drive Codex through cc-suite, not raw `codex exec`.** The `/cc-suite:*`
   commands run `codex-runner.mjs`, which closes stdin, enforces a wall-clock
   deadline on the exact pid, tracks the call as a cancellable job, and streams
   a heartbeat. A hand-rolled `codex exec` has none of this.
2. **If you must call `codex exec` directly, close stdin: `< /dev/null`.** With
   immediate EOF, Codex runs normally — it does not need stdin when the prompt
   is an argument. This is the single load-bearing fix and the minimum bar for
   any direct invocation:

   ```bash
   codex exec "<prompt>" < /dev/null
   ```

   A direct call also gets you none of cc-suite's deadline/job-tracking, so pair
   it with rule 4 below (diagnose by process) and a manual timeout if it runs in
   a backgrounded shell.
3. **Never call raw `codex exec` inside a backgrounded Bash without `< /dev/null`.**
   The non-tty + open-stdin combination is exactly the wedge. Prefer cc-suite's
   bounded runner for anything backgrounded; if you go direct, the
   `< /dev/null` redirect is mandatory, not optional.
4. **Do not redirect a backgrounded long-runner's stdout to a side file.** Let
   it land in the task-output file so the harness's liveness + completion
   notification work and a wedge is visible.
5. **Diagnose "is it hung?" by PROCESS, not the output file.** An empty output
   file is ambiguous (could be slow, could be wedged); the process state is
   not:

   ```bash
   ps -Ao pid=,%cpu=,etime=,comm= | grep '[c]odex'
   ```

   A `codex` binary at **0% CPU with growing elapsed time and no output growth**
   is wedged. Kill it and re-run through cc-suite (or with `< /dev/null`):

   ```bash
   pkill -9 -f "openai/codex.*/codex"
   ```

6. **Before ending a turn, confirm no live Codex ghost:** `pgrep -x codex`
   (NOT `pgrep -f codex` — `-f` matches your own grep line). Zero = clean.

## Optional direct wrapper (not present in this repo)

There is **no** `scripts/` directory and no project Codex wrapper script — the
canonical runner is cc-suite's `codex-runner.mjs` (above). If cc-suite ever
becomes unavailable (outage, removed plugin) and you need a repeatable bounded
direct call, you may create a thin wrapper that (a) redirects stdin from
`/dev/null`, (b) backgrounds Codex and captures its exact pid, (c) enforces a
wall-clock watchdog keyed to that pid (cancelled if Codex finishes first, so it
never re-arms on a later run — the rule-49 identity-not-likeness principle), and
(d) prints one unambiguous result line. Until you create it, it does not exist —
do not reference a wrapper path as if it were already in the tree.

## Cron implications

lucid's cron prompts (`.claude/cron-prompts/{verify,bugfix,watchdog}.md`) fire
as fresh agent sessions. A Codex ghost from a prior session outlives that
session's logical end and still appears in the operator's UI until the OS reaps
it — exactly the cross-session leak rule 49 warns about. So in any cron
iteration that runs Codex:

- Prefer a foreground `/cc-suite:*` call (bounded by `--timeout-ms`), or a
  `--background` runner call whose completion notification a later turn picks up
  — never a `pgrep`-based polling shell.
- Before the iteration's terminal log line, run the rule-6 check
  (`pgrep -x codex` → zero) so no wedged Codex carries into the next fire.

## Relationship to other rules

- **Rule 49 (background shells):** same identity-not-likeness discipline. The
  cc-suite runner's watchdog waits on the exact pid and is cancelled when Codex
  finishes first, so it never re-arms on a future run; `/cc-suite:cancel` keys on
  an exact `jobId`, never a class predicate.
- **Rule 47 (feature workflow):** Gate 2 (plan audit) and Gate 4 (implementation
  audit) are the Codex calls this rule isolates. `/cc-suite:review-plan` is the
  Gate-2 runner; `/cc-suite:audit` / `/cc-suite:audit-fix` back Gate 4.
- **AGENTS.md (AI coding tool auth):** prefer subscription auth (Codex CLI via
  ChatGPT Plus/Pro) over API keys for these audit runs.
