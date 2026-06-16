---
branch: feat/feature-9-wi-6-queue
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 1
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-6a (pure offline push-queue)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1..5. Foundational WI. Files:
`src/lib/sync/queue.ts` + test. WI-6 sliced: this is the pure queue data structure (the
correctness-critical seq-ack core); the async drain loop, debounce, online/offline listeners,
single-in-flight enforcement, and INERT-when-disabled wiring fold into WI-7 (the sync lifecycle).

## Round 1 — verdict: CLEAN (zero findings)

> "The queue logic is sound under the documented single-in-flight drain invariant. The key race works
> correctly: `enqueue X(seq1) → snapshot(seq1) → enqueue X(seq2) during push → ack(snapshot)` keeps
> `seq2` because the `(id, seq)` pair no longer matches. A later enqueue after an ack can restart at
> `seq1` safely because single-in-flight means there is no older unacked snapshot still outstanding.
> Dedup-by-id is the right queue behavior for rapid edits and delete-then-readd … WI-7 has the needed
> primitives: `pending()` for the snapshot, `ack()` for applied subsets, and 'do nothing' for
> transient failure. No logic, purity, `any`, file-size, or vendor-leak issues found. CLEAN."

Verified against the questions posed:
- **Lost-edit safety** — under single-in-flight (only enqueues, never a concurrent ack, occur between
  snapshot and ack), a mid-flight edit bumps the seq so `ack` keeps it; nothing is dropped.
- **seq reset** — restarting at seq 1 after removal is safe because single-in-flight guarantees no
  older unacked snapshot is outstanding to collide with it.
- **Dedup-by-id** — collapsing rapid edits / delete-then-readd to the latest op is correct (the server
  only needs the latest intended state).
- **WI-7 primitives** — `pending()` (snapshot), `ack()` (applied/idempotent subset), do-nothing
  (transient failure → stays queued) are sufficient for the drain loop.

Compliance: pure + immutable, no `any`, file < ~300 lines, no vendor leak. `pnpm check:all` green —
739 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero findings. Foundational tier — pure-data-structure unit tests +
audit satisfy verification.
