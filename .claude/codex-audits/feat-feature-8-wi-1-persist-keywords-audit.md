---
branch: feat/feature-8-wi-1-persist-keywords
threadId: subagent-claude
rounds: 1
final_verdict: ship-as-is
date: 2026-06-15
---

# Gate-4 audit — feature #8 WI-1 (persist polish keywords)

Independent implementation audit of the WI-1 diff vs `main` (global persistence for
`polishKeywordsStore`, mirroring `glossaryStore`).

Author/auditor separation (rule 48): the implementing Claude session authored the code;
a fresh independent in-harness `claude` subagent (read-only, audit-don't-implement)
audited it. Codex was unavailable this round (earlier usage-limit wedge), so this is the
sanctioned subagent fallback — recorded as `subagent-claude`. It ran the diff, compared
against the glossary template, read the storage delegates + both callers, checked file
length / i18n key / WI linkage, and ran the test with scoped coverage.

Files in scope (`git diff main -- src/`):

- `src/stores/polishKeywordsStore.ts` (+ `.test.ts`)
- compared against `src/stores/glossaryStore.ts` (template)
- `src/lib/storage/safeJSONStorage.ts`, `src/lib/storage/quotaNotice.ts`
- callers `src/components/polish/PolishPanel.tsx`, `src/components/sidebar/GlossaryView.tsx` (unchanged)

## Round 1 — `subagent-claude` — CLEAN

**VERDICT: CLEAN** (zero Critical/High/Medium). One Low note (resolved below).

- **Correctness vs glossary template**: persist config identical in shape — `name: 'lucid.keywords'`,
  `version: 1`, `createJSONStorage(() => createSafeJSONStorage({ onWriteError: notifyStorageFull }))`,
  `migrate`, `partialize`. The `create<T>()(persist(...))` curried form is correct. `addKeyword`/
  `removeKeyword` behavior byte-for-byte preserved; `reset` changed to `set({ ...INITIAL })` —
  behaviorally identical and matches the template.
- **Edge cases**: empty/whitespace + exact-dupe de-dupe preserved and tested; `reset()` flushes the
  cleared state through persist; corrupt/oversized/quota/SSR fully delegated to `safeJSONStorage`
  (correct, identical to the glossary path).
- **Security**: no path for the API key or any secret into this store/storage — only `keywords:
  string[]` is partialized. No key logging. Header cites rule 65 §5.
- **Dead/duplicate code**: `INITIAL` used in initializer + `reset`; no unused imports; the ~6-line
  migrate/partialize duplication from glossary is acceptable copy-of-pattern (different shapes;
  lucid favors local, decoupled stores over a shared abstraction for trivial helpers).
- **Coverage honesty**: both `migrateKeywords` branches (`version===1` / `version!==1`) and
  `partializeKeywords` covered; scoped run shows 100% (6/6 branches). The "localStorage round-trip not
  unit-testable here" claim is **true** for this jsdom config (runtime warning `localStorage is not
  available because --localstorage-file was not provided` confirms it); the live round-trip is
  correctly deferred to Gate 5, matching the glossary precedent exactly.
- **Lucid compliance**: no `any` (`as never` in the partialize test, same as glossary); 51 lines;
  header comment updated — the stale "Working state — NOT persisted" line is gone (rule 22 satisfied);
  no `sessionStore`/cross-feature import; callers use selectors / `getState()`, not destructured; WI
  linkage present in the commit subject.
- **Rule 51**: no new rendered UI surface — diff is `src/stores/**` only; PolishPanel/GlossaryView
  byte-identical to main.

### Low note — resolved in this WI

| file | severity | issue | resolution |
|------|----------|-------|------------|
| `src/lib/storage/quotaNotice.ts:2` | Low | Header comment said `onWriteError` is wired "in the session + glossary stores"; this WI also wires it in the keywords store → stale (rule 22 drift the new wiring exposes). | **FIXED in this WI** — comment now reads "session, glossary + keywords stores." Rule 22 favors fixing a comment the change makes stale in the same change, so it was not deferred. |

## Resolution

Zero Critical/High/Medium. The single Low was fixed in-WI (comment-only, no test impact).
`pnpm check:all` green at 100% coverage.

## Verdict

**ship-as-is.** The change is a faithful copy of the proven glossary persistence pattern onto one more
store, fully covered, secure, rule-compliant, with no new UI. The "keywords survive reload" behavior is
verified at Gate 5 (browser), as the plan specifies.
