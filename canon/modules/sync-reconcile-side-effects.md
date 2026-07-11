---
title: Sync reconcile side-effects
updated: 2026-07-06
status: verified
---

# Sync reconcile side-effects

The sync reconcile (`src/lib/sync/reconcile.ts`) re-applies merged entities — sessions, terms, and keywords —
back into their local stores on **every** cycle, producing a **new array reference with identical content**.
Any consumer that compares such a store array by reference (rather than by value) will falsely detect a change
each cycle. Effects keyed on a synced store MUST compare content, not reference. This is the root cause behind
[[Polish keyword invalidation]].

**Verified.** `src/lib/sync/reconcile.ts` applies keywords (`entityToKeyword`, "pass 1 applies sessions/terms/keywords")
on 2026-07-06.

**Sources.** [[session b7bfaa95-1d39-4240-bd4a-2e9eb028a55a · 2026-07-06]]
