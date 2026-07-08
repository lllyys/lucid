# Verification evidence — schema

Gate 5b acceptance evidence for a feature (or bug close-gate). One file per terminal
verification, named `feature-<id>-<YYYYMMDD>.md` or `bug-<id>-<YYYYMMDD>.md`. The
`check_terminal_status_evidence.sh` PreToolUse hook blocks flipping a `docs/features.md`
row to `VERIFIED` unless a matching file exists here (existence check only). Bug `FIXED`
row flips are NOT hook-enforced — bug close-gate evidence is required at GH-issue-close
time, not at the row flip.

## Frontmatter

```yaml
---
kind: feature | bug
id: <id>                       # the tracker row id
status_target: VERIFIED        # or FIXED for bugs
commit_sha: <40-hex SHA>       # the merge commit the verification ran against
app_version: <X.Y.Z>           # package.json version at that commit
date: YYYY-MM-DD
verifier: <who/what ran it>
browser: <browser + how it was driven, or "n/a — <why>">
os_version: <e.g. macOS 26.3.1>
build_mode: <e.g. production (vite build) | dev (pnpm dev) | test (vitest)>
provider: <active provider + mocked/real, per rule 65 §8>
result: pass | partial | fail
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
