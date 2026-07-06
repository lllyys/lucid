---
branch: fix/issue-228-unreachable-diagnosis
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-07-06
---

# Gate-4 audit — bug #10 (custom endpoint works via curl but fails in-app; misleading "provider unavailable")

Independent Claude auditor (read-only, diff-scoped, 154 lines). **ship-as-is, 0 open Critical/High/Medium.**

## Verified
- **Root cause** — `toProviderError`'s `err instanceof TypeError` branch now → `makeProviderError('unreachable',
  {detail})` (was `providerDown`). A browser fetch blocked by CORS / mixed-content / offline throws a TypeError;
  it's now distinct from a server 5xx. **5xx unchanged** — `classifyStatus`/`errorFromStatus` untouched
  (500/503/529 → providerDown, 504 → timeout); abort/timeout/ProviderException/generic/string/null branches
  untouched. `unreachable` in `MESSAGE_KEY` (→`error.unreachable`) + `RETRYABLE`.
- **Exhaustiveness** — every `Record<ErrorKind,…>`/kind-list got the entry: `MESSAGE_KEY`, `TITLE_KEY`
  (ResultBanner), `ALL_KINDS` (ResultBanner.test), `ALL_ERROR_KINDS` (App.test). Any missed exhaustive Record is
  a compile error (tsc gate) → structurally guarded. `configSyncController`'s switch is a SEPARATE
  `ConfigSyncErrorKind` (name collision only); `anthropicProvider.streamErrorKind` has a `default: providerDown`
  (not an exhaustive Record) — both correctly unaffected.
- **Copy** — `error.unreachable` ("Couldn't reach the provider — check your connection. A custom or local
  endpoint may need CORS enabled, or an HTTPS page can't reach an http:// endpoint.") + `banner.unreachable.title`
  ("Can't reach the provider"). Em-dash space-padded; honest (hedged, no false CORS assertion); no secret/detail
  leaked; flat dot-camelCase.
- **Retryable** — `unreachable` retryable (parity with old providerDown; Retry button preserved). Bounded by
  `withRetry` maxAttempts + `text===''` guard — no new loop hazard. Asserted by the retryable it.each blocks.
- **Tests / coverage** — `TypeError → unreachable` asserts kind + messageKey + retryable + detail; 5xx→providerDown
  retained; the exhaustive banner/App kind-lists exercise the new title + message key. 100% gated coverage held
  (`src/providers/**`). No `any`.
- **Scope** — diagnosis-only (no proxy); real-outage (5xx) UX unchanged.

## Low (accepted, non-blocking)
- Rule 51: `unreachable` renders through the **already-designed** `ResultBanner` error state (same layout/icon/
  Retry) with only the title/body copy swapped via the existing Record lookup — a copy correction on a shipped
  surface, not a new undesigned surface. Not a violation.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build. The mapping is verified at the
`toProviderError` boundary + the banner render at the ResultBanner/App boundary (deterministic); Gate-5 confirms
the real fetch-failure → new banner in the browser.

## Verdict
ship-as-is.
