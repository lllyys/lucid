# Feature #21 — Workspace sync on by default for a single-origin self-hosted server

Status: Gate 2 (v2, audited round 1) · GH #175 · relates #9/#19 (workspace sync) · #15 (config/keys sync)

## Problem
Workspace data (Sessions & task history, Glossary terms, Polish keywords) persists to **per-origin browser
`localStorage`** by default. The #9/#19 workspace sync can push it to the server (`/sync/changes`) but is
**opt-in and off** (`config:null` → `status:'local-only'`) and is separate from the config/keys sync (#15).
Users lose sessions across origins (Tailscale URL vs `localhost`), set up keys-sync but not workspace-sync,
and expect "I have a server — my sessions should live on it." (Triage 2026-06-28; user chose **on-by-default**.)

## Scope — auto-on ONLY for token-free single-origin (binding)
Auto-connect / default-on ONLY when the deployment is **token-free single-origin**: the app is served from
the same origin as a reachable sync server running **without `SYNC_TOKEN`** (the #19 token-free model — the
Tailscale ACL is the boundary, the data goes to the **user's own box**, privacy-consistent: the #19 dialog
already says "your data stays on your own box"). Reuse `connectSingleOrigin()` (#19) + the #9 backend.

**OUT of auto-on (stays opt-in, unchanged):** tokened single-origin (server has `SYNC_TOKEN` — the probe
gets an auth error → ineligible; the user's current `:8787` keeps the manual flow, we do NOT force them to
drop the token); remote / cross-origin (third-party server — always explicit opt-in).

## Eligibility probe (Gate-2 H1 — corrected, decisive)
Do NOT key on a bare `GET /sync/changes` status: the server's handler returns **400** when `?since` is absent
(even token-free), and a generic SPA-fallback static host re-serving `dist/` would return **200 + index.html**
for any path (false positive — no real backend). **Use the existing client `backend.pull(0)`** (it sends
`?since=0` and validates the body through `isPullResult`):
- `pull(0)` → **`ok:true`** (a real `PullResult` shape from a token-free server at `?since=0`) → **eligible**.
- `pull(0)` → **`error.kind==='auth'`** (401/403 — tokened server) → **ineligible**.
- any other error (`badRequest` from an HTML/garbage body, `unreachable`, 4xx/5xx) → **ineligible**.

This kills the false-negative (token-free `?since=0` → 200 `PullResult`) AND the false-positive (a re-hosted
`dist/`'s HTML 200 fails `isPullResult` → `badRequest` → ineligible). The probe is a side-effect-free,
same-origin GET (`changesSince` is read-only; no CORS).

## Consent — no silent exfiltration (rule 65 §6)
Auto-on MUST NOT silently upload the user's existing local sessions. The first time auto-on is eligible, show
a **one-time consent**: "Lucid found your server — sync your sessions, glossary and keywords to it?
[Sync to my server] [Keep local-only]". On accept → `connectSingleOrigin()` + remember; on decline → stay
local-only + never re-prompt. **This first-run proactive prompt is a NEW load-time surface → rule-51
design-gated** (the #19 `SyncToggleCard`/`ConnectForm` are *Settings-embedded* surfaces — neither depicts a
load-time consent prompt; rule 51 forbids repurposing a settings toggle into a new at-load context). **File
`needs-design` proactively (rule 51) at this gate.** The eligibility + connect-on-consent logic is design-independent.

## Surface area (file-by-file)
- **NEW `src/lib/sync/singleOriginAuto.ts` (+ test)** — `detectAutoSyncEligibility({ pull })`: awaits
  `pull(0)` (the injected `backend.pull` bound to `window.location.origin`) and returns `eligible` iff
  `res.ok` (real `PullResult`); `'auth'` error → ineligible (tokened); any other error → ineligible. Pure
  logic over the injected `pull` (mock in tests; cover ok / auth / badRequest / unreachable / other-status).
- **`src/stores/syncStore.ts`** — add a persisted `autoSyncPrompt: 'unseen'|'accepted'|'declined'` (default
  `'unseen'`). **(Gate-2 M2)** declare it as a **sibling default in the `create()` initializer, NOT inside the
  `INITIAL` object** that `disconnect`/`reset` spread — so turning sync off does NOT reset the consent
  decision. **(Gate-2 M3)** add `autoSyncPrompt` to **both** `partializeSync`'s `Pick<…>` type AND its
  returned object (else it never persists), and carry it through `migrateSync` (future-proof; no
  `PERSIST_VERSION` bump — existing v2 blobs hydrate to `'unseen'`). Actions: `setAutoSyncPrompt(v)`. No change
  to the existing `SyncStatus` machine (`local-only`/`connecting`/`idle`/`syncing`/…).
- **`src/lib/sync/syncController.ts`** — `maybeAutoConnect()`: run `detectAutoSyncEligibility`; **(Gate-2 M4)**
  AFTER the async probe resolves, **re-check `store.config===null && store.autoSyncPrompt==='unseen'`** (a
  manual connect during the in-flight probe must not be clobbered, and an already-decided/connected session is
  a no-op). If still eligible+unseen → surface the consent (set a transient `showAutoPrompt` flag; do NOT
  connect yet). `acceptAutoSync()` → `connectSingleOrigin()` + `setAutoSyncPrompt('accepted')`.
  `declineAutoSync()` → `setAutoSyncPrompt('declined')`, no connect.
- **NEW consent surface (design-gated → `needs-design`)** — the first-run prompt; reuses the workspace palette
  + the sync scope copy (Sessions/Glossary/Keywords). Built only after a committed bundle lands.
- **i18n** — `sync.autoPrompt.*` (title/body/scope/accept/decline) — added with the consent surface WI.

### Files OUT of scope
- The existing manual connect (#19 toggle + Advanced token form) — unchanged.
- The config/keys sync (#15) — unchanged (workspace-data only; unifying the two syncs is a separate declined option).
- Tokened/remote auto-connect — excluded (privacy + the auth-error probe → ineligible).

## Work items
- **WI-1 (foundational · patch)** — `singleOriginAuto.ts` eligibility via `backend.pull(0)` + the
  shape/auth/error branch tests.
- **WI-2 (foundational · patch)** — `autoSyncPrompt` persisted state (sibling default + `partializeSync` +
  `migrateSync`) in `syncStore` + `maybeAutoConnect`/`acceptAutoSync`/`declineAutoSync` in the controller
  (probe → post-await re-check → surface consent flag / accept→`connectSingleOrigin` / decline→persist) +
  tests. **Purely headless — NOT wired into the app load path here**, so app behavior is unchanged (the
  method is unit-tested directly; the Workspace call site + the rendered prompt land in WI-3, so there is no
  load-time probe and no silent connect until the design-gated UI ships).
- **WI-3 (behavioral · FINAL · design-gated) — the first-run consent prompt UI + wiring.** BLOCKED on the
  `needs-design` bundle. Renders the consent, wires `maybeAutoConnect()` into the `Workspace` load effect
  (beside `resume()`), and accept/decline to WI-2. Auto-on becomes user-visible only here.

WI-1/WI-2 are headless → unit-tested, shippable now (no app-behavior change). WI-3 is the design-gated UI that
turns the feature on.

## Test catalogue
- `singleOriginAuto.test` — `pull(0)` ok → eligible; `'auth'` error → ineligible (tokened); `badRequest`
  (HTML/garbage body) → ineligible; `unreachable` → ineligible; a non-auth 4xx/5xx → ineligible.
- `syncStore` — `autoSyncPrompt` default `'unseen'`; `setAutoSyncPrompt` transitions; **persists via
  `partializeSync`**; **`disconnect`/`reset` PRESERVE `autoSyncPrompt`** (the M2 guard); migrate carries it
  (gated 100%).
- `syncController` — `maybeAutoConnect`: eligible+unseen → sets `showAutoPrompt`, does NOT connect; a manual
  `connect` during the in-flight probe → post-await re-check sees `config!==null` → no prompt; `acceptAutoSync`
  → `connectSingleOrigin` called + `'accepted'`; `declineAutoSync` → `'declined'`, no connect; ineligible → no-op.
- No-regression: existing sync tests green; WI-1/WI-2 add no app-load behavior (no probe fires until WI-3).

## Risks + mitigations
- **Silent exfiltration (rule 65 §6)** — gated behind one-time consent; nothing uploads before accept; WI-2
  isn't even wired into load until WI-3.
- **Probe correctness (Gate-2 H1)** — `backend.pull(0)` + `isPullResult` shape check kills the 400 false-neg
  and the SPA-fallback 200 false-pos.
- **Consent decision durability (Gate-2 M2)** — `autoSyncPrompt` lives outside the `INITIAL` spread, so
  disconnect/reset preserve it; declined users aren't re-asked.
- **Probe/connect race (Gate-2 M4)** — re-check `config===null && unseen` after the async probe.
- **Token wrinkle** — tokened server → auth-error probe → ineligible → existing opt-in (no forced token drop).
- **Privacy posture** — auto-on scoped to the user's own token-free single-origin box; remote never auto-connects.

## Backward compat
Additive — existing `local-only` users see (after WI-3) at most a one-time consent; tokened/remote setups
unchanged; reversible via the existing disconnect/turn-off. No data migration; no `PERSIST_VERSION` bump
(existing v2 blobs hydrate `autoSyncPrompt='unseen'`).

## Audit fixes applied (Gate 2, round 1 → v2)
Independent auditor, round 1 = NEEDS REVISION (1 High + 3 Med + 2 Low). All addressed:
- **H1** probe spec → `backend.pull(0)` + `isPullResult` (kills the 400 false-negative + the SPA-fallback 200
  false-positive). **M2** `autoSyncPrompt` as a sibling default (not in `INITIAL`) so disconnect/reset preserve
  it + test. **M3** name `partializeSync` (Pick + return) + `migrateSync` carry. **M4** post-await re-check in
  `maybeAutoConnect` + non-200/non-401 branch tests. **Lows:** state machine reworded to the real `SyncStatus`
  union (no literal `synced` — it's `idle`); WI-2 is purely headless (the Workspace probe wiring moved to WI-3,
  so "behavior unchanged" is accurate).

## Gate-2 round-2 Lows (fold into WI-2 at build)
- **L1** declare the transient **`showAutoPrompt: boolean`** in `syncStore` IN `INITIAL` (so disconnect/reset
  clear it) + excluded from `partializeSync` (not persisted) + a setter — the controller's `maybeAutoConnect`
  sets it; WI-3's prompt reads it.
- **L2** `migrateSync` validates the carried `autoSyncPrompt` is one of the three literals (mirror the existing
  `configOk` guard) before carrying — defensive against a corrupt blob on a future bump.
- **L3** `maybeAutoConnect` builds the probe backend via the controller's injectable
  `createBackend({ serverUrl: window.location.origin, token: '' })` to obtain `pull` (the established
  injection pattern — keeps the probe mockable in tests).

## Revision history
- v1 (2026-06-28) — initial draft.
- v2 (2026-06-28) — Gate-2 round-1 fixes (1 High + 3 Med + 2 Low). **Gate-2 PASSED round 2: READY TO BUILD,
  0 open Crit/High/Med** (3 round-2 Lows folded above).
