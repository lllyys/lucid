---
branch: fix/issue-96-polish-result-prose
threadId: independent-claude-auditor
rounds: 3
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — bug #96 (polish result shows model prose; pollutes Result + Compare diff)

Independent audit by separate-context Claude `auditor` subagents (read-only). Codex/cc-suite was
quota-exhausted, so author/auditor separation (rule 48) was preserved via fresh subagent contexts.
Author = main session; auditor = independent subagent. Three adversarial rounds, each tasked with
finding an input that CORRUPTS legitimate polished content (the core risk of an output cleaner).

## Diff under audit
- `src/lib/prompts/index.ts` — `POLISH_OUTPUT_INSTRUCTION` (forbid preamble / surrounding quotes /
  changes list) appended to both plain + reference polish prompts (+ test).
- `src/lib/polish/cleanPolishOutput.ts` — conservative cleaner applied to the DONE polish result
  (+ 25-case test).
- `src/components/polish/PolishResult.tsx` — `text = isDone ? cleanPolishOutput(op.text) : op.text`
  (cleans Result display, Compare diff, copy, Accept) (+ test).

## Round 1 — found High over-strip
| severity | finding | resolution |
|---|---|---|
| **High** | `CHANGES_HEADING` matched bare `Notes:`/`Changes:`/`Edits:` → a result with a legitimate "Notes:" content section had its tail silently deleted (rule 66 §1). Corrupting input: `"…verified.\n\nNotes:\nRemember to back up…"` → returned only the first line. | **Fixed** — `CHANGES_HEADING` restricted to specific meta forms ("changes made:", "edits made:", "summary of changes:", …); bare `Notes:`/`Changes:`/`Edits:` dropped. Added a `LIST_LINE` guard: strip the trailing section only when its tail is a bulleted/numbered list. |
| Low | `PREAMBLE` stripped a genuine "Here is what you need to know about the API:" intro. | Fixed in round 2 (see below). |
| Medium | Missing preservation tests for the over-strip cases. | **Fixed** — added the "over-strip guard" it.each. |
| info | quote-unwrap, fail-safe, wiring, prompt-hardening, no-ReDoS, no-surrogate-hazard | confirmed clean (unchanged through all rounds). |

## Round 2 — found Medium-Low over-strip (regression of the Low)
| severity | finding | resolution |
|---|---|---|
| **Medium-Low** | `PREAMBLE`'s generic result-noun gate still ate "Here is the text of the agreement that both parties signed:" (any "Here is … text/result/version …:" content line). | **Fixed** — `PREAMBLE` tightened to a STRICT template: requires a POLISHING-ACT word (polished/improved/revised/…) directly modifying an optional result-noun, with NOTHING before the colon. Genuine intros lacking a polishing-act word, or with subject matter before the colon, no longer match. Added guard tests for all of the auditor's corrupting strings. |

## Round 3 — CLEAN
- Verified: round-1 + round-2 corrupting inputs all pass through UNCHANGED; the actual bug shape still
  cleans to the bare sentence; both strip/keep branches of every rule are exercised.
- One nice-to-have (Low): lock the `headingIdx > 0` guard with an index-0 changes-list test. **Fixed** —
  added `'Changes made:\n- buy milk\n- buy eggs'` → unchanged.

## Accepted residual (negligible, with rationale)
Two theoretical inputs still get cleaned, both inherent to a conservative heuristic cleaner and
vanishingly unlikely for a polish *result*:
1. A polish result whose first line is LITERALLY the strict preamble template ("Here is the improved
   version:") as content.
2. A real changelog whose body contains a standalone "Changes made:" + a genuine bulleted list.
Both require the user's own polished text to reproduce a model's meta-prose shape exactly. Accepted as
negligible; the prompt-hardening lever (the model is told not to emit these) is the primary fix and the
cleaner is the defense-in-depth fallback.

## Verdict
**CLEAN / ship-as-is.** Two real over-strip bugs found and fixed across rounds 1–2; round 3 clean. The
cleaner now strips only unambiguous model meta-prose and passes legitimate content through. `pnpm
check:all` green (lint + 100% coverage + build).
