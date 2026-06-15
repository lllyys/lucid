---
branch: feat/feature-5-wi-6a-settings-credentials
threadId: workflow-4lens+subagent-verify
rounds: 2
final_verdict: ship-as-is
date: 2026-06-16
---

# Gate-4 audit — feature #5 WI-6a (Settings rebuild: credentials + selection)

Independent audit of the WI-6a diff vs `main` — the redesigned 880px Settings provider surface
(`SettingsDialog` + `settings/ModelControl` + `settings/CredentialFields`), the per-vendor store
setters' optional-vendor param, the keyless-OPTIONAL custom decision (isReady + factory), the
`configurablePresentations`/`keyPrefixHint` helpers, new i18n keys, and the `usePanelRun` run-path fix.
Closes #7-WI-4 (custom base-URL field) and fixes the Ollama no-key UX.

Author/auditor separation (rule 48): implementing Claude authored. Round 1 was an **adversarial 4-lens
workflow** (behavior/state · design-fidelity+rules · security · coverage/a11y). Round 2 was an
independent verifier. Codex unavailable — sanctioned subagent fallback (`workflow-4lens+subagent-verify`).

## User decision recorded (#5/#7/#29)

The committed #29 design showed custom with a base-URL field but NO key field. The user chose **"add an
optional API-key field"** so keyed proxies (OpenRouter) AND keyless self-hosted both work. Hence
`isReady(custom)` = baseUrl + model (key optional); the factory exempts custom from the key throw;
custom's credential UI = base-URL + optional key. This is a sanctioned extension of the committed design.

## Round 1 — 4-lens workflow

- **Behavior/state — CHANGES_NEEDED.** Core logic correct (view-vs-active separation, per-vendor
  isolation, onSaveKey active→applyKeyChange / non-active→setApiKey routing, mirror sync, runtime-invalid
  hint, keyed/keyless custom). **1 High:** `usePanelRun` never passed `baseUrl` → an active custom
  provider (now activatable via the rail + "Use for this workspace") would throw "requires a base URL"
  at run time. **1 Medium:** scope drift — the plan assigned the custom surface to WI-6b. **2 Low:** empty
  `Bearer ` header for keyless custom; dead `settings.statusOnDevice` key.
- **Design fidelity — CHANGES_NEEDED (Low only).** Tokens-only (no hex), focus indicators present,
  shadcn primitives, rule 51 (only the sanctioned custom optional-key beyond the design). Lows: dialog
  860→880px / rail 244→252px; flat rail status color (design colors per state); missing model
  context-window label; selected-row used `--accent-bg` not `--accent-subtle`+border.
- **Security — CLEAN.** Keys in-memory only, never logged, masked, only `kind` surfaced; keyless custom
  no-leak. 2 Low (base-URL userinfo could be shown verbatim — accepted v1; usePanelRun baseUrl re-flag).
- **Coverage/a11y — CHANGES_NEEDED (Low only).** Strong ARIA-query behavior tests + 100% logic coverage,
  but: rejected-hint false-side untested; non-active clear branch untested; custom free-text model
  untested; lists-providers presence-only assertion was weak; dead i18n key.

## Round 1 → fixes

- **High:** `usePanelRun` now passes `baseUrl: cfg.baseUrl` (ignored by named vendors, required by
  custom) + a test asserting createProvider gets the custom baseUrl → custom is runnable.
- **Medium:** plan v3 records the WI-6a scope move (custom surface + run-path wiring into WI-6a) + the
  keyless-optional decision (rule 20 doc-sync).
- **Low:** `openaiCompatibleProvider` omits Authorization when the key is empty (+ test); removed dead
  `settings.statusOnDevice`; dialog dims 880/252; rail status colored per state (local=success, else
  tertiary); selected row → `--accent-subtle` + 1px `--accent-border` inset; ModelControl shows a
  context-window label ONLY where `capabilityOf` has real data (anthropic — no fabrication for
  allowAnyModel); +5 strengthened tests (rejected false-side, non-active clear, custom model input,
  keyless-header, rail membership).

## Round 2 — independent verifier

Confirmed findings 1, 2, 4, 5, 6 genuinely resolved + gate-green, with ONE residual: the rebuild renamed
`settings.providerHeading` → `settings.providersHeading` and left the old key orphaned (a new WI-6a
orphan). **Fixed:** removed `settings.providerHeading`. (The 3 `keyRequired`/`keyBadPrefix`/`keyTooShort`
keys flagged by a literal-grep are NOT orphans — consumed dynamically via `t(validateKeyShape().messageKey)`.)

## Verdict

**ship-as-is.** All Critical/High/Medium resolved; every Low fixed (none accepted-with-rationale beyond
the v1 base-URL-userinfo display note). `pnpm check:all` green — 595 tests, 100% logic coverage, clean
build. WI-6b (test-connection panel + stat tiles) is the remaining UI slice.
