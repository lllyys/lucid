# 20 - Logging and Docs (Local)

**Keep dev docs in sync with the code in the same change.** Stale docs are worse than no docs —
a contributor (human or agent) who trusts an out-of-date doc makes the wrong decision, so doc
drift is treated as a defect, not a nicety.

## When to update

Update the relevant doc in the **same** change (commit/PR) whenever the change:

- alters observable behavior, a public API, or a config/flag a doc describes;
- adds, removes, or renames a module, command, rule, or workflow a doc references;
- invalidates a stated fact (a path, a command, a decision) in an existing doc.

Pure-internal changes with no doc-visible effect (refactors, performance, test-only) need no doc
edit.

## How

- Keep a **single source of truth per topic** under `dev-docs/`, and link it from
  `dev-docs/README.md`. Don't duplicate the same fact across files — duplicates drift apart.
- When you fix code that an existing doc describes incorrectly, fix the doc in the same change.
  "I'll update the doc later" is doc debt.

## Compliance check

Before declaring a change done: re-read the docs your change touched conceptually and confirm no
stated fact is now false, and that `dev-docs/README.md` links every source-of-truth doc you
added.
