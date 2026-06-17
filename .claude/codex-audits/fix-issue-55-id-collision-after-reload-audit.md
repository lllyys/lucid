---
branch: fix/issue-55-id-collision-after-reload
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — bug #55 (session/task/term ids collide after reload)

Codex (gpt-5.5, effort high, read-only). Files: `src/stores/sessionStore.ts` +
`src/stores/glossaryStore.ts` (+ tests), new `src/lib/uuid.ts` (+ test), `.claude/hooks/check_gh_issue_mirror.sh`
(a mirror-hook correctness fix that blocked landing the bug row), `docs/bugs.md`.

## The bug + fix

Both stores minted ids from a module counter (`let idSeq=0; genId=()=>${p}${++idSeq}`) that reset to 0
on every load, re-issuing live ids after rehydration → duplicate ids (rename/delete/addTask match by
id → corruption). Also blocked #9 sync (counter ids aren't globally unique → cross-device merge of
distinct entities). **Fix:** production mints `${prefix}_${randomUuid()}` (collision-free across
reloads AND devices); the `__reset*Ids` test seams install a deterministic counter so existing tests
keep stable ids; `__useRandom*Ids` seams drive the prod generator for the regression tests.

## Round 1 — verdict: NEEDS ATTENTION (2 Medium + 3 Low)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | sessionStore.ts (genId) | Medium | `crypto.randomUUID()` is **undefined in non-secure contexts** (`http://192.168.x.x` — a LAN self-hosted lucid) → `newSession`/`addTask` throws | **FIXED** — extracted `src/lib/uuid.ts#randomUuid`: native `crypto.randomUUID` when present, else an RFC-4122 v4 built from `crypto.getRandomValues` (available in insecure contexts). + insecure-context fallback test |
| 2 | glossaryStore.ts (genId) | Medium | same availability gap for `addTerm` | **FIXED** — same shared `randomUuid` helper |
| 3 | .claude/hooks/check_gh_issue_mirror.sh:137 | Low | even after the cells[3]/[5] fix, a literal `\|` inside a cell would mis-shift columns | **ACCEPTED w/ rationale** — pre-existing fragility (not introduced here; the old indices were simply wrong); tracker rows don't use literal pipes; a markdown-aware splitter is separate hardening. Codex (round 2): "agree … out of scope for this bug fix." |
| 4 | sessionStore.test.ts | Low | regression asserted only the `s_`/`t_` prefix, not uuid shape | **FIXED** — assert the full prefixed v4 shape |
| 5 | glossaryStore.test.ts | Low | same (`g_` prefix only) | **FIXED** — full v4 shape |

**Confirmed correct in R1:** the deterministic test seams (each `beforeEach` installs a fresh closure
counter; `__useRandom*` restores the stateless prod generator) — no cross-test leakage; mixed
old-counter + new-uuid persisted ids are fine (ids are opaque); no leftover `idSeq`, no `any`, no
file-size/security issue.

### The mirror-hook fix (rule 60 §9: fix the gate, don't bypass)

`check_gh_issue_mirror.sh#parse_rows` read `status=cells[5], notes=cells[6]` — a 6-column assumption.
Both trackers are 5-column (`| id | title | status | priority|severity | notes |`), so the real indices
are `status=cells[3], notes=cells[5]`. The old indices read the **Notes** cell as "status" (so it
silently **no-op'd features mirror enforcement** — the mis-read status never matched a MIRROR_STATUS)
and read an empty trailing cell as "notes" (so it **false-blocked the first real bug row** despite its
`GH: #55`). Fixed to cells[3]/cells[5] — a correctness fix that *strengthens* the gate (it now actually
enforces both tables), verified manually: feature #9 → `status='IN PROGRESS'` + finds `GH:#45`; a
GH-less row is correctly flagged. This is "fix the gate rather than skip it," not a bypass.

## Round 2 — verdict: CLEAN

> "`randomUuid()` closes the insecure-context `randomUUID` gap … uses native `crypto.randomUUID()` when
> present, otherwise builds a valid RFC-4122 v4 from `crypto.getRandomValues`. The version and variant
> masks are correct: byte 6 gets `0100`, byte 8 gets `10xx`. The fallback test genuinely exercises the
> fallback branch … The store tests now assert full prefixed v4 UUID shape … I agree with accepting the
> hook's literal-pipe parsing fragility as out of scope … the cells[3]/[5] correction is the right fix …
> and strengthens the gate. CLEAN."

`pnpm check:all` green — 764 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. Fixes the reported reload collision AND
the cross-device collision that would have corrupted #9 sync.
