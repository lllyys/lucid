---
description: "Create a GH issue for a feature row in docs/features.md and stamp `GH: #N` into its Notes column"
argument-hint: "<feature-id>"
---

# File Feature Issue

Usage: `/file-feature <feature-id>` — e.g. `/file-feature 47`.

Invoke the `file-feature` skill with `$ARGUMENTS`. The full procedure (pre-flight, `Mirror: no` / TODO checks, issue body, row stamp, failure modes) lives in `.claude/skills/file-feature/SKILL.md` — single source per `.claude/rules/20-logging-and-docs.md`.
