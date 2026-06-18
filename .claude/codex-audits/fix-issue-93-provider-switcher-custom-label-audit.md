---
branch: fix/issue-93-provider-switcher-custom-label
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — bug #93 (provider switcher mislabels active Custom as "Anthropic")

Independent audit by a separate-context Claude `auditor` subagent (read-only, Read+Grep).
Codex/cc-suite was unavailable (quota exhausted until ~11:38 AM 2026-06-18), so the
author/auditor separation (rule 48) was preserved via a fresh subagent context rather than
Codex. Author = main session; auditor = independent subagent.

## Diff under audit
- `src/components/workspace/ProviderSwitcher.tsx` — active trigger now `presentationFor(vendor)`
  (full `BY_VENDOR` map, total over `Vendor`, includes `custom`) instead of
  `providers.find((p) => p.vendor === vendor) ?? providers[0]` (which fell back to Anthropic when
  `vendor === 'custom'`, since `implementedPresentations()` excludes custom).
- `src/components/workspace/ProviderSwitcher.test.tsx` — RED→GREEN regression test + a
  list-invariant test.

## Round 1 findings

| file:line | severity | issue | resolution |
|---|---|---|---|
| ProviderSwitcher.tsx:24 | — | Correctness: `presentationFor` is `BY_VENDOR[vendor]`; `BY_VENDOR: Record<Vendor, …>` is exhaustive over the 5-member `Vendor` union → non-undefined for every legal vendor; mislabel fully fixed. | confirmed correct |
| ProviderSwitcher.tsx:21-24 | — | Edge cases: `vendor` is typed `Vendor` and `setVendor` refuses unimplemented vendors, so no out-of-map index at runtime; removing `?? providers[0]` adds no null risk (trigger no longer reads `providers`). | confirmed sound |
| ProviderSwitcher.tsx:57 | — | The dropdown's per-row active check `p.vendor === vendor` showing no check when custom is active is acceptable (custom is intentionally not a switcher row; the trigger conveys active state). | accepted (not a defect) |
| — | — | Dead code: `providers` still consumed by the dropdown `.map` + model line; both imports used. | clean |
| — | — | Regression: named vendors render identically (same `BY_VENDOR` entries). | clean |
| — | — | lucid compliance: no `any`, no vendor SDK import, 67 lines, selectors + `getState()` per AGENTS.md, i18n via `t()`, dot via CSS var. | clean |
| ProviderSwitcher.test.tsx | Low (nice-to-have) | No test asserts the dropdown LIST still excludes custom (named-vendors-only) while custom is active — would lock in the "trigger uses presentationFor, list uses implementedPresentations" split against a future regression. | **FIXED** — added "keeps the dropdown to named vendors only — no Custom row — while Custom is active (bug #3)". |

## Verdict
**CLEAN / ship-as-is.** Fix is correct, complete, and well-tested. The single Low/nice-to-have
finding (list-invariant test) was implemented in the same branch. `pnpm check:all` green
(lint + 100% coverage + build).
