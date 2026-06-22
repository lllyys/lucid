# Feature #16 — Responsive / mobile layout (resolves #17 scroll model)

Status: Gate 2 (v2, multi-lens audited round 1) · GH #138 (#16) · #143 (#17) · design: `dev-docs/designs/lucid-responsive-mobile-layout`

## Problem
The workspace is desktop-first (`Workspace.tsx` = `flex h-dvh` → fixed-width `<Sidebar/>` + the two stacked
panels, zero `@media`/breakpoints). On a phone (triage: Tailscale + mobile Safari) the fixed-width sidebar +
side-by-side editor columns overflow with horizontal scroll. The committed design reflows the workspace for
narrow viewports. This feature also **resolves #17** (the scroll-model decision).

## Design (committed) — three tiers
`dev-docs/designs/lucid-responsive-mobile-layout`. Breakpoints (custom — NOT Tailwind defaults):
- **Desktop ≥ 960px** — unchanged (inline sidebar + the two stacked panels, internal two-column editors).
- **Tablet 600–959px** — sidebar → off-canvas drawer; the editor columns drop to a single stacked column.
- **Phone < 600px** — sidebar → drawer; a **single-pane Translate/Polish segmented switcher**.

## Token mapping (audit H1 — binding)
The `.dc.html` design uses its OWN token namespace; map EVERY reference to the codebase tokens in
`src/index.css` — do NOT paste design tokens. Map: `--ink`→`--text-color`, `--surface`→`--bg-color`,
`--canvas`→`--bg-canvas`, `--board`→(canvas-only, n/a), `--accent`→`--accent-primary`,
`--accent-ink`→`--accent-ink`, `--accent-soft`→`--accent-bg`, `--accent-tint`→`--accent-subtle`,
`--fill-muted`→`--bg-tertiary`, `--hover`→`--hover-bg`, `--shadow-c3`→`--shadow-toast` (exact value match;
the design's phantom `--shadow-c3` does NOT exist in the codebase), `--t1..t7/--faint`→
`--text-secondary`/`--text-tertiary`/`--text-disabled`. The scrim gets a new token (below).

## Scroll model decision (#17 — RESOLVED)
The design **keeps the app-shell + inner-scroll model** at every tier — `Workspace.tsx:29` stays
`h-dvh … overflow-hidden`; header / pane-switcher / toolbar / footer are pinned (`flex:0 0 auto`); the
**`<main>` content column is the SINGLE scroll region**. NOT `document`/page scroll (a pinned footer would
break under `body` scroll). The user's "scroll the whole interface, not inside it" is satisfied on mobile by
the **single content column scrolling as one** (not per-card), chrome pinned so Run stays thumb-reachable.

**#17 second half (audit H7 — binding):** on phone, **PolishPanel's input column MUST drop its
`overflow-auto`** (`PolishPanel.tsx:242`) and the result column MUST drop any independent scroll — otherwise
they become a NESTED scroll inside `<main>`, re-creating the exact "scroll inside it" complaint. On the phone
tier `<main>` is the only scrollbar (TranslatePanel's `:149` row has no nested scroll — already clean). Test:
on phone, neither Polish column owns a scrollbar.

**#13 reconciliation (audit L9):** `field-sizing-content` + the editor cap stay, but **tier-scope the cap to
`max-h-[50vh]` on `<600`** (the `88vh` cap on a 760px phone lets one editor swallow the column); keep
`max-h-[88vh]` on tablet/desktop. CDP-verify the phone cap rather than discover it at Gate 5.

## Surface area (file-by-file)
- **NEW `src/hooks/useViewportTier.ts` (+ `.test.ts`)** — `useViewportTier(): 'desktop'|'tablet'|'phone'`.
  Queries `(min-width:600px)` + `(min-width:960px)`. **Boundaries:** phone `<600`, tablet `600 ≤ w < 960`,
  desktop `≥960`. **Compute the initial tier SYNCHRONOUSLY during render** (`useSyncExternalStore`
  getSnapshot, or a `useState` initializer reading `matchMedia`) — no post-mount flash (audit M2).
  **Defaults to `desktop` when `matchMedia` reports no match** (the jsdom default) — load-bearing for
  no-regression (audit M5). `matchMedia` listeners with cleanup. **NOT coverage-gated / NOT tdd-hook-scoped**
  (`src/hooks/**` is in neither `vite.config.ts` coverage `include` nor `tdd-guard.mjs` SCOPED) — its tests
  are a rule-10 discipline obligation, written regardless (audit M4).
- **`src/index.css`** — add a `--scrim` token (audit L5): a FIXED dark scrim in BOTH themes
  (`--scrim: rgba(18,16,12,0.42)` light and dark — do NOT derive from `--text-color`, which inverts to a
  light scrim in dark mode).
- **`index.html`** — viewport meta → `width=device-width, initial-scale=1, viewport-fit=cover` (iOS safe-area).
- **`src/components/workspace/Workspace.tsx`** — the reflow orchestrator. Adds `drawerOpen` + `activePane`
  state. Desktop: render unchanged. Tablet/phone: `<Sidebar/>` rendered inside the drawer. **Phone:
  BOTH panels stay MOUNTED — toggle visibility with a `hidden` class driven by `activePane` (audit C1/H4 —
  conditional UNMOUNT would wipe each panel's component-local state: typed source/draft, language picks, the
  per-hunk accept/reject `rejected` set; and orphan the draftTranslate mirror + a pending auto-run). The
  design depicts a view toggle, not a discard — visibility-toggle is faithful.** Renders the `PaneSwitcher`
  above `<main>` on phone. Root stays `flex h-dvh flex-col overflow-hidden`.
- **NEW `src/components/sidebar/SidebarDrawer.tsx` (+ test)** — the off-canvas surface (DEPICTED, Section D),
  built on **shadcn `Sheet`** (audit M3/L3 — `pnpm dlx shadcn@latest add sheet` per rule 32; the Sheet owns
  focus-trap, Esc, scrim, scroll-lock, and **restore-focus-to-trigger on close**). The **hamburger is the
  Sheet trigger**; a controlled `open` state lets "open a session → close drawer" drive `onOpenChange(false)`
  (Radix restores focus to the trigger regardless of close cause). 312px panel (`var(--surface)`),
  scrim `var(--scrim)`, `box-shadow: 0 0 40px var(--shadow-toast)`. Contains: a drawer header (brand mark +
  wordmark + **× close**), the existing `<Sidebar variant="drawer"/>`, and a drawer footer (**Settings** gear
  + label). Test: open via hamburger → tab trapped, Esc closes, scrim-click closes, opening a session closes,
  **focus returns to the hamburger in every close path**.
- **`src/components/sidebar/Sidebar.tsx`** — add `variant?: 'inline'|'drawer'` (audit L4): `inline` keeps
  `w-[268px] shrink-0` (today); `drawer` drops the fixed width (`w-full`) to fill the 312px panel. Inner
  content (`SessionsView`/`GlossaryView`) unchanged.
- **NEW `src/components/workspace/PaneSwitcher.tsx` (+ test)** — phone-only segmented Translate/Polish control
  (DEPICTED, Sections A/B/C). **a11y: `role="radiogroup"` + two `role="radio"`/`aria-checked` chips** (audit
  L7 — matches the GoalChips #18 / single-active precedent), roving focus + `focus-visible` (rule 33). Full-
  width, `var(--bg-tertiary)` track, active = `var(--bg-color)` + `var(--shadow-tab)`. Visual buttons ~36px
  tall but the **hit area ≥44px** via padding. Props `{ value:'translate'|'polish'; onChange }`.
- **`src/components/workspace/WorkspaceHeader.tsx`** — `<960` reflow to a **4-element layout** (audit H5):
  **☰ hamburger (left, accent-active while `drawerOpen`)** · **centered brand+wordmark** · **compacted
  SyncStatusPill + gear icon (right)**. Hide `header.tagline` + `header.runHint` + the divider rules. Header
  `h-[50px]` (mobile) / `h-14` (desktop). New props `drawerOpen`, `onToggleDrawer`. (The pill stays per
  Section F — see SyncStatusPill.)
- **`src/components/translate/TranslatePanel.tsx`** — the two-column editor row (`:149`) stacks `flex-col`
  below 600 (Source content-sized top, 1px divider, Translation grows). **Phone editor cap `max-h-[50vh]`**
  (tier-gated; 88vh desktop/tablet). **DirectionOverride stays its OWN dropdown** (audit L2 — there is NO
  translate "language-pill menu" to fold into; the lang pill `:109` is a static `<div>`); the toolbar row
  just wraps/compacts on phone (CSS, no behavior change).
- **`src/components/polish/PolishPanel.tsx`** — input column + result column (`:241`) stack `flex-col` <600
  (`border-l`→`border-t`); **input column drops `overflow-auto` on phone** (audit H7); result reached by
  scrolling the single `<main>` column. `GoalChips` keeps its wrapping row.
- **`src/components/polish/PolishResult.tsx`** — **NEW BUILD (audit H3 — not a "verify"):** make the
  Result/Compare toggle + hunk bar a **`sticky top-0` sub-header at mobile width** and ensure **accept/reject
  is reachable from it** (Section C — "accept/reject stays one tap away while the diff scrolls"). PolishResult
  has NO `sticky` today (toggle at top, accept at bottom). **Tier-gate the sticky/relocation so desktop stays
  byte-for-byte unchanged.** Behavior test.
- **`src/components/workspace/FooterPrivacy.tsx`** — `min-w-0` + `truncate` on the privacy text + the
  **"Details" CTA** (mono `--accent-ink`, `shrink-0`, never wraps) — DEPICTED (Section E, audit L1). **Details
  opens the Settings provider dialog** (audit H6 — the real "where your text goes" surface; the footer copy is
  already provider-aware "sent to {provider}"/"stays on this device"; do NOT wire it to Settings·Sync, which
  is config-sync, not privacy). The Settings dialog (gear) already exists; Details triggers the same open.
- **`src/components/sync/SyncStatusPill.tsx`** — suppress `view.detail` (the timestamp, `:97`) at `<600px` so
  the compacted pill fits the 50px header (Section F).
- **`src/components/sync/SyncErrorBanner.tsx`** — stack the action button full-width below the text at `<600`
  (`flex-col`, ≥44px target). Rendered in `Workspace.tsx:41`.
- **`src/components/configsync/ConfigSyncBanner.tsx`** — same full-width action stacking at `<600` (audit H2 —
  this banner is owned by **`ConfigSyncGate.tsx:55`**, NOT Workspace; its responsive stacking is in scope even
  though the gate CARDS are out of scope; test it beside `ConfigSyncBanner.test.tsx` by setting
  `useConfigSyncStore.syncError`, not via the Workspace integration test).
- **`src/locales/en/translation.json`** — new keys: `workspace.paneTranslate`/`workspace.panePolish`,
  `sidebar.close`, `sidebar.settings`, `footer.details`, `header.openMenu`/`header.closeMenu`.

### ProviderSwitcher mobile placement (audit confirmed FAITHFUL, no needs-design)
On **phone (<600)** the `WorkspaceToolbar` row (its decorative "one workspace" subtitle + the
`ProviderSwitcher`) **hides**; provider selection is fully reachable via **Settings** (the gear → SettingsDialog
hosts the provider rail with "Use for this workspace" activation — confirmed by the audit). Hiding an existing
control on a tier the design omits it from is a faithful reflow, not invention. Tablet keeps the toolbar.

### Files OUT of scope (v1)
- **Footer streaming-content variant** ("Streaming · model · elapsed" replacing the privacy line) — DEPICTED
  at mobile width (Phone 2), but deferred as a **follow-up footer state-awareness slice** (audit M6 — NOT
  because it's absent; it IS in the design). File a follow-up issue; note the residual gap so Gate-5 does not
  flag the missing streaming footer as a defect. The privacy line is the load-bearing footer content.
- The unlock gate cards (Phone 7) — already full-screen-centered (`ConfigSyncGate`); verify comfortable at
  390px, no rebuild.
- Desktop layout behavior (≥960) — unchanged.
- "Details" CTA: if, at build time, opening the Settings provider dialog proves a poor fit, descope the CTA to
  a follow-up needs-design and ship only the truncate + `min-w-0` footer reflow.

## Work-item sequencing (one branch — all touch `Workspace.tsx`; one writer)
- **WI-1 (foundational · patch)** — `useViewportTier` hook (+ test) + `--scrim` token + `index.html`
  viewport-fit. No visible change.
- **WI-2 (behavioral · patch)** — the shadcn-Sheet drawer (`SidebarDrawer` + `Sidebar variant` + ☰ in header +
  Workspace `drawerOpen` wiring + Settings-in-drawer-footer). Slice-verify the drawer at <960 (CDP).
- **WI-3 (behavioral · patch)** — the pane switcher (`PaneSwitcher` + `activePane` **visibility-toggle**, both
  panels mounted) + panel editor stacking (Translate/Polish `flex-col` <600) + **PolishPanel overflow removal**
  + **PolishResult sticky sub-header** (mobile, tier-gated) + the phone editor cap. Slice-verify at <600.
- **WI-4 (behavioral · FINAL · minor)** — chrome reflow: header 4-element (☰/brand/pill+gear, drop
  tagline+hint), footer (truncate + Details→Settings + safe-area), `SyncErrorBanner`/`ConfigSyncBanner`
  stacking, sync-pill compaction, ProviderSwitcher hide-on-phone, i18n. Full acceptance pass.

(WIs share `Workspace.tsx` → sequential on one branch; one batched Gate-4 audit + one Gate-5 CDP verify across
all three tiers, per rule 47's audit-count table.)

## Test catalogue
- **`src/hooks/useViewportTier.test.ts`** — **install a per-test query-aware `matchMedia`** (matches computed
  from the queried `min-width` vs a fake width; `vi.fn()`-backed `addEventListener`/`removeEventListener`),
  saving/restoring `window.matchMedia` per test à la `src/App.test.tsx:79-92` (the global `setup.ts` stub is
  `matches:false`/no-op and CANNOT drive tier-varying or cleanup assertions — audit M1). Assert tier at
  1200/800/390, the **exact boundaries 600 and 960**, the synchronous initial value (no flash), and
  `removeEventListener` called on unmount.
- **Component behavior (RTL):** `SidebarDrawer.test.tsx` (the focus/dismiss obligations above);
  `PaneSwitcher.test.tsx` (radiogroup, two radios, `aria-checked` transitions, click→onChange, visible focus);
  `WorkspaceHeader` mobile (☰ present, tagline/runHint hidden, ☰ accent-active when open, pill+gear in the
  right slot) — **drive the tier by mocking `useViewportTier`** (audit M5), not `matchMedia`;
  `FooterPrivacy` (truncate + Details CTA fires the Settings-open handler); `ConfigSyncBanner`/`SyncErrorBanner`
  (action stacks full-width at narrow width); `PolishResult` (sticky sub-header + accept reachable at mobile,
  desktop unchanged).
- **Workspace integration (drive via mocking `useViewportTier`):** at `phone`, only the active pane is VISIBLE
  (both mounted) + the switcher shows; **switch Translate→Polish→Translate preserves the typed source and a
  partially-rejected polish diff** (the C1 regression guard); at `desktop` the sidebar is inline + no ☰ + the
  three desktop strings (tagline/runHint/subtitle) still render (no-regression).
- **No-regression:** existing Workspace/panel/sidebar/header tests stay green (desktop unchanged), relying on
  `useViewportTier` defaulting to `desktop` under the jsdom `matchMedia` stub.

## Risks + mitigations
- **State loss on pane switch (Critical)** — fixed by keeping both panels mounted (visibility toggle) +
  the round-trip integration test.
- **First-paint tier flash** — synchronous initial tier (`useSyncExternalStore`); no post-mount correction.
- **#17 nested scroll (Polish)** — drop the input-column `overflow-auto` on phone; assert single `<main>` scroll.
- **#13 `max-h-[88vh]` on phone** — pre-committed `max-h-[50vh]` phone cap; CDP-verify.
- **drawer a11y** — shadcn Sheet owns focus-trap/Esc/scrim/scroll-lock/restore-focus; hamburger = trigger.
- **iOS safe-area / 100dvh** — `h-dvh` kept; `viewport-fit=cover` + `env(safe-area-inset-bottom)` on the pinned
  footer (CDP can't fully model the notch — residual, note at Gate 5).

## Backward compat (precondition)
Desktop (≥960) is byte-for-byte unchanged — the reflow is tier-gated and `useViewportTier` **defaults to
`desktop`** when `matchMedia` reports no match (jsdom). The existing `Workspace.test` asserts the tagline,
run-hint, and "one workspace" subtitle (the three strings hidden on mobile) — these stay green via the desktop
default; new mobile/tablet tests mock `useViewportTier`, not `matchMedia`. No data/persistence/API change.

## Known limitations (accepted v1, flagged for Gate-2 round 2)
- Footer streaming-content variant deferred (follow-up; depicted at mobile width — residual fidelity gap noted).
- "Details" CTA → Settings provider dialog (the real where-text-goes surface); descope to needs-design only if
  that proves a poor fit at build time.
- ProviderSwitcher hidden on phone (reachable via Settings) — hide, not invent (audit-confirmed faithful).

## Audit fixes applied (Gate 2, round 1 → v2)
Independent multi-lens audit (4 auditors via Workflow; Codex quota-blocked, rule-48 separate contexts), round
1 = NEEDS REVISION (1 Crit · 7 High · 7 Med · 9 Low). All Crit/High/Med addressed:
- **C1/H(async)** activePane unmount → state-loss/orphaned-streams → **keep both panels mounted, visibility
  toggle** + round-trip preservation test.
- **H1** phantom `--shadow-c3` → `--shadow-toast` + a binding design→codebase token-mapping note.
- **H2** ConfigSyncBanner colocation (in ConfigSyncGate, not Workspace) corrected; SyncErrorBanner is the
  Workspace one; banner stacking in scope, tested beside its own spec.
- **H3** PolishResult sticky sub-header is BUILD work (not "verify") → allocated to WI-3, tier-gated, tested.
- **H5** sync-pill phone position resolved → 4-element header (☰/brand/pill+gear), pill timestamp suppressed.
- **H6** "Details" CTA target → the Settings provider dialog (real where-text-goes), not Settings·Sync.
- **H7** #17 second half → drop PolishPanel's input-column `overflow-auto` on phone (no nested scroll).
- **M1/M-tests** per-test query-aware `matchMedia` mock (global stub insufficient); **M2** synchronous initial
  tier + pinned boundaries (600/960) + flash risk; **M3** commit to shadcn Sheet + restore-focus; **M4**
  corrected the false coverage-gate/tdd-hook claims (src/hooks ungated, discipline); **M5** no-regression
  precondition (default-desktop + mock-the-hook); **M6** corrected the streaming-defer rationale + follow-up;
  **M7/L7** PaneSwitcher = radiogroup + 44px hit area.
- **Lows** design-section re-citation (footer=E, pill=F); no translate "language-pill menu" (DirectionOverride
  stays its own dropdown); shadcn-add-sheet noted; Sidebar `variant` width; `--scrim` fixed-dark token; phone
  88vh→50vh cap; WI-4 = behavioral.

## Revision history
- v1 (2026-06-22) — initial draft.
- v2 (2026-06-22) — Gate-2 round-1 fixes (1 Crit + 7 High + 7 Med + 9 Low). Awaiting round-2 confirm.
