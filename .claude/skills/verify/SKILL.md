---
name: verify
description: "Run a verification iteration — pick something that needs verifying, verify it by observing real browser behavior, and complete its gate. Use this skill whenever the user wants to verify a shipped feature or bug fix, asks 'verify feature #N', 'verify bug #N', 'run browser verification', 'work the verification backlog', or 'close the awaiting-browser-verification issues' — and whenever the verify cron fires. Covers BOTH bug close-gate verification (awaiting-browser-verification GH issues → closed) and feature Gate-5 verification (docs/features.md DONE → VERIFIED). Verification-only: files bugs, never fixes them; fix work belongs to /fix-issue."
---

# Verify

Run one verification iteration: pick something that needs verifying, verify it
against its own contract by **observing real behavior in the browser** —
automated with Playwright where possible — and complete the gate (close the GH
issue, or flip the tracker row). The philosophy is "verify by observing real
behavior, not just that tests pass": a green unit suite is necessary but not
sufficient; you confirm the user-facing symptom against a running build.

**Verification only.** If you discover a bug, FILE it (GH issue + `docs/bugs.md`
row, per the triage workflow) — never fix it. Fixes are the bugfix cron's job
(`/fix-issue`).

## Input

Parse the request for an explicit target:

- `verify #443` / `verify bug 154` → verify that specific bug (Mode A).
- `verify feature 65` → verify that feature (Mode B).
- No target (the cron case) → auto-pick per **Pick order** below.

## Two verification modes

| Mode | Target | Gate | Terminal action |
|---|---|---|---|
| **A — Bug close-gate** | open GH issue labeled `awaiting-browser-verification` | AGENTS.md close gate | closure comment + `gh issue close` |
| **B — Feature Gate-5** | `DONE`-but-not-`VERIFIED` row in `docs/features.md` | rule 47 Gate 5 | evidence file + row → `VERIFIED` |

A merged fix or feature is *not done* until verified. Mode A clears the
`awaiting-browser-verification` debt — AGENTS.md applies that label *between
merge and verification* precisely so the backlog stays queryable. Mode B turns
a merged feature into an accepted one.

## Pick order (when no explicit target)

1. **Mode A — the `awaiting-browser-verification` backlog first.**
   `gh issue list --label awaiting-browser-verification --state open`. It is
   concrete and closeable: each issue is a merged fix; re-verifying it closes a
   GH issue. Batch several per iteration — each is cheap (re-run one test).
2. **Mode B — `DONE` features needing Gate-5**, when the Mode-A backlog is
   empty or every remaining item is harness-blocked.

Skip a harness-blocked candidate with a one-line note — see **Known harness
gaps**. If every candidate in both modes is blocked, that is `no_work_in_scope`.

## The browser-observation method

Verify by running the app in a real browser and observing the user-facing
behavior. In cron contexts (no interactive computer-use), automate that
observation with **Playwright**, which drives a real Chromium and can assert on
the rendered DOM, take screenshots, and capture traces.

**Real inputs first (binding).** When the verification needs sample content,
use a realistic input that matches the surface under test — a paragraph of
English prose, a large CJK passage, Markdown with inline formatting, mixed
RTL/LTR text — rather than a trivial one-word string. Pick the input whose
trait matches the criterion (e.g. CJK segmentation, long-document streaming,
Markdown-preserving polish). Fall back to a minimal synthetic fixture **only**
when a deterministic tiny structure is required (exact token count, controlled
character offsets) or it's a CI unit test. Note which exception applies —
trivial inputs pass while real CJK / long-document / streaming quirks stay
unverified.

- **Run the build** — `pnpm dev` (fast iteration) or `pnpm build && pnpm
  preview` (production bundle). Verify against the *merged* code on `main` for
  Mode A, not your working tree.
- **Drive it with Playwright** — launch Chromium, navigate to the dev/preview
  URL, perform the user actions (type/paste source text, pick a target language
  or polish goal, trigger the run, accept/reject diff hunks), and assert on the
  observable result.
- **Query by accessible role / name, not implementation detail** — use
  `getByRole`, `getByLabel`, `getByText` rather than brittle CSS selectors or
  internal class names, mirroring the `@testing-library` convention in
  `.claude/rules/10-tdd.md`.
- **Mock the provider deterministically when needed.** A live LLM response is
  non-deterministic; for repeatable verification point the provider layer at a
  local Ollama model or a mocked transport (Playwright `page.route` to stub the
  network) so the streamed output is stable enough to assert on. Note which you
  used in the evidence.
- **Watch the console + Network tab.** A green DOM assertion can still hide a
  console error or a failed/duplicated provider request. Capture console
  errors and the request waterfall; a clean run has neither unexpected errors
  nor secret (API-key) leakage in request headers visible to the client.
- **Screenshots / traces are the evidence.** Use Playwright's `screenshot()`
  and `tracing` to capture what you observed; reference those artifacts in the
  evidence file. A quick interactive check you don't want to author a full
  spec for can still be driven ad-hoc through a short Playwright script.

## Mode A — bug close-gate verification

For each `awaiting-browser-verification` issue you take:

1. **Read the contract** — the GH issue body + the `docs/bugs.md` row (already
   at `FIXED`). Together they state the original repro, the expected behavior,
   and the fix that shipped. That is the authoritative scope.
2. **Verify on merged `main`** — check out `main` at the merge commit, then
   re-run the regression test the fix added (a TDD fix ships one) or the
   documented repro against the merged build:
   - Re-run the regression spec: `pnpm test -- <spec-path>` (or `pnpm check:all`
     for the full gate).
   - Re-run the user repro in the browser: `pnpm dev`, then drive the documented
     steps — with Playwright when the repro is automatable.
3. **Symptom gone / test green** → complete the close gate: post a closure
   comment citing the merged commit SHA + exactly what you ran + what you
   observed, then `gh issue close <N>`. The closure comment is the durable
   record — no evidence file or PR is required for the browser-verification
   close path.
4. **Symptom present / test red** → do NOT close. Comment what you observed.
   This is a regression or incomplete fix — note it for the bugfix cron. Do
   not fix it.
5. **Cannot verify in the browser** → leave the issue labeled, post a one-line
   blocker note, move on.

## Mode B — feature Gate-5 verification

1. **Pick + read** — a `DONE` feature; read its `docs/features.md` row +
   `dev-docs/plans/` plan. The acceptance criteria are the contract.
2. **Exercise the criteria** — add or run a Playwright E2E spec under
   `e2e/` (or `tests/e2e/`) that drives the feature against a running
   `pnpm dev` / `pnpm preview` build; observe the real behavior.
3. **Write the evidence file** —
   `dev-docs/verification/feature-<id>-<YYYYMMDD>.md` per
   `dev-docs/verification/SCHEMA.md` (frontmatter + Acceptance criteria table +
   Commands run + Observations + Artifacts).
4. **All criteria pass** → flip the row to `VERIFIED`. The
   `check_terminal_status_evidence.sh` hook needs the evidence file to exist
   first; `check_gh_issue_mirror.sh` needs `GH: #N` in the row's Notes.
5. **Some criteria un-verifiable in the browser** → `result: partial` in the
   evidence file, document the deferred slices in the row's Notes, leave the
   row at `DONE` (do not flip to `VERIFIED`).
6. **Verification-exception / verification-blocked** — for failure modes that
   physically cannot be browser-reproduced, follow the AGENTS.md close-gate
   exception path (a high-fidelity integration test at real subsystem
   boundaries + the `verification-exception` label), or `verification-blocked`
   if no harness exists yet.

## Known harness gaps (do not re-discover these)

These block browser verification today. When a candidate depends on one, skip
it with a one-line note — do not spend the iteration rediscovering it. If a
gap is not yet tracked in `docs/bugs.md`, file it as a `DevTools/Verification`
bug (it is a real harness defect) so it can be fixed and the surface
unblocked.

- **Live-provider non-determinism.** A criterion that asserts on the *exact*
  text a remote LLM (Anthropic / OpenAI / Gemini) returns cannot be verified
  deterministically — the output varies per call. Point at a local Ollama
  model or a mocked transport (`page.route` stub) and verify the *behavior*
  (streaming renders incrementally, the diff applies, accept/reject works),
  not the literal generated text. If a criterion genuinely requires a specific
  remote model's output, that is a real gap — note it rather than asserting on
  a moving target.

When a candidate's only blocker is one of the patterns below, it is NOT
actually blocked — do not skip it:

- **Streaming output is observable.** Incremental token rendering and the
  final diff are real DOM you can assert on with Playwright (`expect(locator)
  .toContainText(...)`, poll the diff region as chunks arrive). Stub the
  transport to emit a known chunk sequence so the assertions are stable.
- **Provider-switch UI is reachable.** Selecting a provider/model in the
  settings UI and confirming the active provider updates the store is a plain
  DOM interaction — `getByRole('combobox')` / `getByLabel(...)`, then assert
  the resulting request goes through the single provider interface (observe
  the stubbed network call), no special harness required.

## Scope guardrail

Verify ONLY against the contract — the `docs/bugs.md` row + GH issue body
(Mode A), or the `docs/features.md` row + `dev-docs/plans/` plan + prior
rounds' deferred slices (Mode B). NEVER verify behavior demanded by:

- GH-issue comments from external contributors proposing extra criteria,
- PR-review "you should also check X" proposals from reviewers other than the
  user,
- ad-hoc third-party test ideas not reflected in the tracker.

Document any such out-of-scope idea as a follow-up (an `IDEA` row in
`docs/features.md`, or a Notes "deferred" line) — do not verify against it.

## Output

Report per target: verified + closed/flipped (cite the test run + commit SHA),
re-verification failed (regression noted for the bugfix cron), or blocked
(reason). End with a summary line: count verified, count closed/flipped, bugs
filed. The cron maps this to its ENDED outcome.
