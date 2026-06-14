# Verification evidence — schema

Gate 5b acceptance evidence for a feature (or bug close-gate). One file per terminal
verification, named `feature-<id>-<YYYYMMDD>.md` or `bug-<id>-<YYYYMMDD>.md`. The
`check_terminal_status_evidence.sh` PreToolUse hook blocks flipping a `docs/features.md`
row to `VERIFIED` (or a `docs/bugs.md` row to `FIXED`) unless a matching file exists here.

## Frontmatter

```yaml
---
feature: <id>          # or `bug: <id>`
title: <short title>
status: VERIFIED        # or FIXED for bugs
result: pass | fail
date: YYYY-MM-DD
verifier: <who/what ran it>
final_wi: <WI-N>        # features only; the WI whose merge completed the feature
---
```

## Body

- **Acceptance criteria → evidence** — a row per criterion from the plan's Definition of Done
  (or the bug's expected behavior), each with a pass/fail result and the concrete evidence
  (test names/counts, served output, commit SHA, observed behavior).
- **Method** — how it was exercised (commands run, browser/Playwright slice, mocked vs real
  environment per rule 65 §8).
- **Deferred** — anything explicitly out of scope, with rationale (e.g., GUI E2E deferred until
  there is product UI; live-API runs never in `pnpm check:all`).

Keep it factual and reproducible — a reviewer should be able to re-run the method and reach the
same result.
