---
branch: fix/issue-162-config-sync-key-restore
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-22
---

# Gate-4 audit — bug #8 / GH #162 (config-sync unlock doesn't restore keys when rev == syncedRev)

Independent Claude auditor (read-only, diff-scoped). Round 1 = **ship-as-is, 0 Critical/High/Medium**.

## Fix
`src/lib/config/configSyncController.ts` `unlock()`: replaced the cold-start adopt gate
`res.value.rev > sync.readSyncedRev() && !dirty` with `res.value !== null && !dirty` — adopt the server's
authoritative blob on a returning device regardless of rev equality (the reload already wiped the in-memory
keys while the persisted `syncedRev` survived, so `syncedRev` is stale metadata, not a watermark of what's in
memory; the only authoritative source at unlock is the server blob). `!dirty` still preserves invariant 5;
the mid-session save / 409-conflict adopt path (rev-aware via `baseRev = readSyncedRev()`) is untouched.

## Auditor findings (all resolved)
- **#1 correctness — PASS.** Restores on equal-rev; still skips on `null` blob and on a local edit during the
  pull window (`dirty`). Dropping the rev compare is sound for cold-start specifically.
- **#2 no save loop — PASS.** `adopt()` sets `dirty:false` under `applying` (suppresses `watchEdits`), so the
  unlock tail `if (store().dirty) requestSave()` does not fire after an adopt; no redundant PUT.
- **#3 rev < syncedRev — PASS.** Adopting the older server blob + recording its rev is correct recovery (re-aligns
  the watermark so the next save's `baseRev` matches the server, avoiding phantom 409s). Was the same bug's 2nd
  variant under the old gate. **Added an explicit regression test for this case** (server rev 5 < syncedRev 8 →
  adopts + `writeSyncedRev(5)`).
- **#4 scope — PASS.** One production line in `unlock()`; the 409-conflict adopt path unchanged.
- **#5 test quality — PASS.** The flipped regression test (rev 5 == syncedRev 5 → asserts `apply(CONFIG_B)`) is a
  genuine RED→GREEN (failed on old code, `apply` called 0×); the `null`-blob + dirty-guard tests still assert
  correctly under the new predicate. The full restore chain is also covered: the real `defaultProviderConfigAdapter`
  test asserts `apply()` writes keys into the real `useProviderStore` (`apiKeys.openai === 'sk-ok'`).
- **#6 lucid — PASS.** No `any`; no secret logged (comment cites rule 65 §5); `src/lib/config` 100% coverage held.

## Low (addressed)
The auditor's lone Low (no dedicated `rev < syncedRev` test) — **added** in this commit.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build green. The fix is in `src/lib/config` (gated).

## Verdict
ship-as-is.
