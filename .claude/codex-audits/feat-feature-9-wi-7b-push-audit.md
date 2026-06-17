---
branch: feat/feature-9-wi-7b-push
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7b-v (syncPush — the push half of a cycle)

Codex (gpt-5.5, effort high, read-only), same thread. Foundational. `syncPush(backend, entries)` pushes
the queue's pending ops and returns a per-entry outcome. Files: `src/lib/sync/push.ts` + test.

## Round 1 — verdict: NEEDS WORK (1 High + 1 Medium)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | applied results discarded the server `rev` — but that rev is the exact next `baseRev` for a future edit to the same entity; without it the next edit pushes from a stale baseRev → false conflict → under v1 server-wins, the user's later edit is dropped | **FIXED** — return the applied `rev` (per-entry), so the orchestrator records it in a persisted per-id rev map |
| 2 | Medium | conflict server entities were returned detached, inviting the orchestrator to apply them unconditionally — but if the same id was edited DURING the in-flight push (seq bumped), seq-ack keeps the newer edit and applying the stale conflict server would clobber it | **FIXED** — restructured to a per-entry shape: each result is tied to its `QueueEntry`, so the orchestrator ack-gates application (apply only if that exact (id,seq) was still queued) |

**Resolution:** `PushOutcome = { ok:true; pushed: PushedEntry[] } | { ok:false; error }` where
`PushedEntry = {entry, status:'applied', rev} | {entry, status:'conflict', conflict}`. v1 policy
confirmed correct by Codex (a real conflict for the still-current op → surface + apply server-wins).

## Round 2 — verdict: CLEAN

> "The per-entry `pushed` shape resolves both prior issues. Applied results now carry the returned
> server `rev` tied to the exact `QueueEntry` … Conflicts are also tied to the exact entry, which gives
> WI-7b-vi enough information to ack-gate application against the live queue … Deferring the actual
> ack-gating and rev-map maintenance to the orchestrator is the right layering. Your note about
> `syncPull` is also correct: pulled/resolved entity revs must feed the same persisted per-id rev map,
> otherwise future edits to pulled entities can false-conflict. CLEAN."

## Carried forward to the orchestrator (WI-7b-vi) — confirmed by the audit

1. Maintain a **persisted per-id rev map**, fed by (a) applied push revs and (b) pulled entity revs.
   It is the source of `baseRev` when enqueuing a local edit.
2. **Revise the merged `syncPull`** to also return the resolved entities' revs (it currently returns
   only the reconciled snapshot + cursor + conflicts), and feed `collectLocal` the FULL rev map (not
   just pending baseRevs) — else a future edit to a pulled entity false-conflicts.
3. **Ack-gate** application: apply an applied-rev / conflict-server only if `ack` actually removed that
   `(id, seq)` from the live queue (a mid-push same-id edit must win).

`pnpm check:all` green — 821 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium for this slice.
