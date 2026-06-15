---
branch: feat/feature-5-wi-6b-test-connection-ui
threadId: workflow-3lens+subagent-verify
rounds: 2
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #5 WI-6b (test-connection panel + stat tiles, #6)

Independent audit of the WI-6b diff vs `main` — the Settings test-connection card + stat tiles wiring
the WI-5 `probeProvider` via `useTestConnection`, with per-vendor `testResults` store state. Closes #6.

Author/auditor separation (rule 48): implementing Claude authored. Round 1 was an **adversarial 3-lens
workflow** (wiring/correctness · design-fidelity · security+coverage). Round 2 was an independent
verifier. Codex unavailable — sanctioned subagent fallback (`workflow-3lens+subagent-verify`).

## Round 1 — 3-lens workflow

- **Wiring/correctness — CLEAN.** All 7 points hold: pre-checks (remote no-key → `settings.testNeedKey`,
  custom no-baseUrl → `settings.testNeedUrl`, ollama none) short-circuit before building a provider;
  builds for the VIEWED/passed vendor (createProvider with apiKeys[vendor]/models[vendor]/baseUrl) +
  probeProvider; ok→{status:'ok',latencyMs}, fail/createProvider-throw→{status:'fail',msgKey:'error.<kind>'};
  getState() at call time + post-await; ConnectionPanel renders all 4 states + disables Test while
  testing; testResults per-vendor + reset clears; testing a NON-active vendor works (keys off the passed
  vendor); no stale-write hazard (write targets the captured vendor). 2 Low (pricing copy; no abort path).
- **Design fidelity — CHANGES_NEEDED.** Tokens-only (no hex), dark parity, visible focus, i18n clean.
  **1 Medium:** the stat grid was bundled INSIDE the connection card (rendered at position 2), but the
  design places it AFTER credentials (header → connection → model → credentials → stats → privacy).
  2 Low (pricing label dropped "in·out"; stat tile vertical padding 10px vs design 12px).
- **Security + coverage — CLEAN.** Key never logged/rendered (only latency + ErrorKind-derived msgKey
  surfaced); nothing persisted; store testResults 100%-covered + meaningful; hook tests cover ok/fail/
  pre-checks/ollama/createProvider-throw with mocks only at the createProvider boundary + real
  probeProvider. 1 Low (the non-ProviderException createProvider-throw arm untested).

## Round 1 → fixes

- **Medium:** split `ConnectionPanel` into the connection **card** (only) + a separate `StatTiles`
  export; moved the privacy note OUT of `CredentialFields`. SettingsDialog now renders the exact design
  order: connection card → model → credentials → stat tiles → privacy note (last).
- **Low:** `settings.statPricing` → "Pricing · $/Mtok in·out"; stat tiles `px-[13px] py-3` (13/12px);
  added a `useTestConnection` test for a bare-`Error` createProvider throw → `error.unknown`.
- **Low (accepted with rationale):** no abort path on the probe — bounded by `DEFAULT_PROBE_TIMEOUT_MS`,
  the write targets the argument-captured vendor (no stale/wrong-vendor write), and the design has no
  cancel affordance. A per-vendor AbortController is a future nicety, not a WI-6b correctness gap.

## Round 2 — independent verifier — CLEAN

Confirmed all 6 findings resolved: detail order matches the design exactly; `StatTiles` is a separate
export (not in the card); privacy note moved to last (privacyLocal/local, memoryNote/remote); pricing
label + tile padding fixed; `error.unknown` test present; no regression; tokens-only; no unused imports
(`t`/`presentationFor` still used in `CredentialFields`); `pnpm check:all` green.

## Verdict

**ship-as-is.** Test-connection UI wires the WI-5 probe correctly and securely; the design Medium
(layout order) is fixed; all Lows fixed or accepted-with-rationale. 607 tests, 100% logic coverage,
clean build. Closes #6's UI. WI-7 (switcher polish + final acceptance) remains.
