---
branch: feat/feature-19-wi3-settings-sync-ui
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-22
---

# Gate-4 audit — feature #19 WI-3 (simplified Settings·Sync UI)

Independent Claude auditor (read-only, diff-scoped — read the 902-line diff vs main). Against the design
`dev-docs/designs/lucid-settings-sync-simplified` + the WI-3 plan section. Round 1 = follow-up-recommended
(0 Crit/High · 1 Med · 1 Low); both fixed in this commit → **ship-as-is, 0 open Crit/High/Med**.

## Verified (the backward-compat-critical + design-fidelity checks — all PASS)
- **Backward compat (CRITICAL) — PASS.** `isSingleOrigin = config.token === ''`. Single-origin (`token===''`)
  → read-only "⌂ Syncing to" origin row + "same origin" pill, NO Edit. Remote (non-empty token) → the
  existing "Connected to" server row + `token …last4` + **Edit** (intact). Existing remote-sync users keep
  see/edit. Guarded by the remote-Edit test.
- **Design fidelity — PASS.** OFF/local-only → new `SyncToggleCard` (on/off `role="switch"`), NOT the
  URL+token form; switch-on → `connectSingleOrigin()` (no args). Advanced disclosure (`aria-expanded`/
  `aria-controls`) reveals the existing `ConnectForm` → `connect(config)` (remote path). Token-aware
  connected state + "Turn off" zone (keep vs erase → `DisconnectDialog` radio).
- **No invented UI (rule 51) — PASS.** `error.syncSession`/"Sign in" banner correctly DEFERRED (no distinct
  store state; #16 owns banners) — no dead key, no invented auth route.
- **Tokens — PASS (after fix).** No phantom design token (`--ink`/`--surface`/`--canvas`/`--accent-soft`/
  `--accent-tint`/`--ok`/`--shadow-c*`); no raw hex.
- **a11y — PASS.** switch `role=switch`+`aria-checked`; disclosure `aria-expanded`+`aria-controls`(useId);
  turn-off reuses `role=radio`; visible focus.
- **i18n — PASS.** All new keys present, flat camelCase, em-dash spacing; no orphans.
- **lucid — PASS.** No `any`; no vendor import; files <300 (SyncToggleCard 144 / ConnectedPanel ~125 /
  SyncSettingsPanel ~130); NO gated dir touched (`src/stores`/`src/lib`/`src/providers` untouched →
  100% coverage held).
- **Tests — PASS.** Behavior-asserting (toggle→connectSingleOrigin & not connect; advanced→connect & not
  connectSingleOrigin; single-origin no-Edit vs remote-Edit [the backward-compat guard]; turn-off opens
  dialog; empty card). Not wiring-only.

## Findings
- **Medium (FIXED):** `SyncToggleCard.tsx` OFF switch track used `bg-[var(--fill-muted)]` — `--fill-muted`
  is UNDEFINED in `src/index.css` → the track rendered with no fill (bare bordered pill). Fixed → defined
  `--bg-tertiary` (#f0ede7 light / #2a2720 dark — a muted neutral fill). `pnpm check:all` re-run green.
- **Low (FIXED):** `ConnectedPanel.tsx` empty-state (`status==='idle' && lastSyncedAt===null`) wasn't gated
  on connection type — a remote reconnect with no sync yet would wrongly show the "just turned on" card.
  Fixed → gated on `isSingleOrigin` (the "just turned on" framing is the token-free flow, design Section D).

## Gate
`pnpm check:all`: lint + typecheck + 100% gated coverage + build green; 1483 tests. NO gated dir touched.
Gate-5: CDP verification of the toggle/advanced/connected/turn-off states — see
`dev-docs/verification/feature-19-<date>.md`.

## Verdict
ship-as-is.
