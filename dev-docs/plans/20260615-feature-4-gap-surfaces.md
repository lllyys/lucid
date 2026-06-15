# Feature #4 — Lucid Workspace: designed gap surfaces

> Status: **DRAFT** (Gate 1) · Tracker: `docs/features.md` #4
> Design: `dev-docs/designs/lucid-workspace/project/Lucid Workspace.dc.html` (revised — chat2 resolved
> needs-design #13–#18). Pre-issues backup kept alongside.
> Depends on: #2 (VERIFIED — the workspace this extends). Builds on branch
> `feat/feature-4-gap-surfaces` (stacked on the triage branch; main is protected).

## Problem

Feature #2 shipped the workspace but deferred six surfaces as `needs-design`. The design loop
completed (chat2), committing designs for all of them. This feature implements the five that extend
the **workspace itself** (#13–#17); the **sidebar** (#18) is feature #3. The single highest-value
slice is **#13 (API-key entry)** — without it the app cannot make a real request (it is mock-only).

## Scope

**In scope** (each maps to a closed needs-design issue; logic that already exists is reused):

- **#13 — Provider Settings / API-key entry.** A shadcn `Dialog` opened by the header Settings button:
  per-provider key entry with empty / saved-masked (`sk-…last4`) / invalid states, a reveal toggle, an
  on-device note for Ollama (no key), and a "stored in memory for this session, never persisted in
  plaintext, never logged" note (rule 65 §5). Wires to `providerStore.setApiKey`. **Keys stay
  in-memory** (no localStorage — a persistent secure store needs the future server/proxy boundary).
- **#16 — Dark theme.** Replace the `.dark` light-mirror with the design's real warm-charcoal palette
  (mapped onto the existing lucid token names — NO mass rename), add a theme toggle (`.dark` class on
  `<html>`, rule 34) + a small `themeStore` (in-memory; persist deferred with feature #3's `persist`).
- **#17 — RTL + direction override.** A direction-override control (Auto-detect / Force LTR / Force RTL)
  on the Translate panel; `dir` applied to source/result and the Polish editors/result/diff; bidi-safe.
  `detectDirection` already exists; add an override state + a `dirOf(text, override)` helper.
- **#14 — Error / cancelled banner.** A result-pane banner for the mapped error kinds (rate-limited /
  provider-down / invalid-key / timeout / request-failed) with **Retry**, and a neutral "Stopped"
  state for cancelled — partial streamed text stays visible (rule 65 §3). The success toast is NOT
  reused for errors. The error MAPPING already lives in `operationStore` (reads `streamOp`'s outcome).
- **#15 — Diff Reject + per-hunk accept.** In the Polish Compare view: per-change keep/reject toggles,
  explicit **Reject** (discard polish, keep draft) alongside Accept, Keep-all / Reject-all, an
  "N of M kept" summary, and honest footer copy ("Review the diff before accepting" — replaces the
  removed "✓ meaning preserved"). `applyDiff(segments, acceptedIds)` already supports arbitrary subsets.

**Out of scope:**

- **Sidebar (#18)** — feature #3 (sessions/glossary data + the Full/Shell/Hidden layout).
- **The "Design review" dock** — a prototype-only state-toggler in the bundle; NOT a product surface.
- **Persistent key storage / theme persistence** — in-memory only now (rule 65 §5); persistence lands
  with feature #3's `persist` middleware (and a server/proxy boundary for keys, when one exists).

### Files OUT of scope

- `src/providers/**`, `src/lib/prompts/**` — VERIFIED; consumed, not modified (the error mapping,
  `streamOp`, `validateRequest` are already in place). No provider-layer change is needed for #4.

## Surface area (by WI)

- **WI-1 — Settings / key-entry (#13).** `src/components/workspace/SettingsDialog.tsx` (shadcn `Dialog`,
  added via CLI), opened from `WorkspaceHeader`'s Settings button (currently a stub). Per-provider rows
  from `PROVIDER_PRESENTATION`; key `<input type=password>` + reveal; reads/writes
  `useProviderStore` (`apiKey`, `setApiKey`, `vendor`, `setVendor`); masked display `sk-…last4`; an
  invalid hint when a non-empty key fails a shape check (`sk-` prefix, length). i18n `settings.*`.
  **Highest value — unblocks real requests.** Behavioral.
- **WI-2 — Dark theme (#16).** `src/index.css` `.dark` real values (from the design token table; mapped
  to lucid names). `src/stores/themeStore.ts` (`theme: 'light'|'dark'`, `toggle()`, applies the `dark`
  class to `document.documentElement`) — TDD-gated (store). A theme toggle in the header/toolbar.
- **WI-3 — RTL + direction override (#17).** `src/lib/translation/detectDirection.ts` gains a
  `resolveDirection(text, override)` + an override type (`auto|ltr|rtl`) — TDD-gated. A direction-override
  dropdown in `TranslatePanel`; `dir` on the Translate source/result and Polish editors/result/diff.
- **WI-4 — Error / cancelled banner (#14).** `src/components/workspace/ResultBanner.tsx` (maps an
  `OperationState` error/cancelled → a localized banner + optional Retry). Used by `TranslateResult` +
  `PolishResult`. Retry re-runs the panel's last request (via a panel-held `lastRequest`). i18n
  `error.*` (exist) + `banner.*`. Behavioral.
- **WI-5 — Diff Reject + per-hunk (#15).** `PolishResult` Compare gains per-hunk toggles (local
  `acceptedIds` set, seeded to all-accepted), Reject/Keep-all/Reject-all, the "N of M" summary, and the
  honest footer; Accept commits `applyDiff(segs, acceptedIds)` (the chosen subset). Reuses the WI-5
  diff logic. Behavioral.

## Work-item sequencing

| WI | Title | Tier | Resolves |
|----|-------|------|----------|
| WI-1 | Settings dialog + API-key entry | behavioral | #13 |
| WI-2 | Dark theme palette + toggle (`themeStore`) | foundational (store) + C (css) | #16 |
| WI-3 | RTL + direction override (`resolveDirection`) | foundational (lib) + behavioral (UI) | #17 |
| WI-4 | Error / cancelled result banner | behavioral | #14 |
| WI-5 | Diff Reject + per-hunk accept | behavioral | #15 |

Order = value: **#13 first** (unblocks real usage + real verification), then dark (#16, low-risk CSS),
then RTL (#17), error banner (#14), reject/per-hunk (#15). Each WI: TDD where logic is involved
(themeStore, resolveDirection — 100% coverage), behavioral ARIA tests for UI, `pnpm check:all` green,
own commit.

## Test catalogue

- `src/stores/themeStore.test.ts` — toggle light↔dark; applies/removes the `dark` class; default light.
- `src/lib/translation/detectDirection.test.ts` (extend) — `resolveDirection(text,'auto')` = detect;
  `'ltr'`/`'rtl'` force; the RTL fixtures (Arabic/Hebrew/mixed) map to `rtl`.
- `SettingsDialog.test.tsx` — open from Settings button; enter a key → `setApiKey` + masked display;
  reveal toggles; invalid key shows the hint; Ollama shows no-key/on-device.
- `ResultBanner.test.tsx` — each error kind → its localized message + Retry; cancelled → "Stopped", no
  Retry; partial text stays.
- `TranslatePanel.test.tsx` / `PolishPanel.test.tsx` (extend) — direction override switches `dir`; error
  banner appears on a mocked error; per-hunk reject changes the accepted text; Reject keeps the draft.
- `PolishResult` per-hunk: Accept commits the chosen subset (`applyDiff`), Keep-all = result, Reject-all
  = original.

Logic under the coverage globs stays at 100%; components are behavioral (outside the globs).

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Dark token NAME mismatch (design `--canvas/--ink/--t1..` vs lucid `--bg-canvas/--text-color/..`) | Map the design's dark VALUES onto the existing lucid token names — no rename, no churn to feature #2 components. |
| API key persistence vs rule 65 §5 | In-memory only (Zustand, not persisted); document that a persistent secure store needs the future server/proxy boundary. Never log/redact in any diagnostic. |
| shadcn `Dialog` not yet added | Add via the CLI in WI-1 (non-interactive, stdin-closed — rule 53); style in a wrapper (rule 32). |
| Retry needs the last request | Each panel holds its `lastRequest`; Retry re-invokes `usePanelRun.run(panel, lastRequest)`. |
| RTL on the diff/result must not corrupt bidi | `dir` on a container + logical CSS; the diff logic is already grapheme/bidi-safe (WI-5 fixtures). |

## Definition of Done

- WI-1..WI-5 implemented; logic TDD at 100%; behavioral ARIA tests; `pnpm check:all` green; per-WI commits.
- **The app can make a real request**: enter a key in Settings → translate/polish stream for real (the
  mock-only limitation from feature #2 is lifted). Dark theme toggles with a real palette; direction
  override + RTL work; error/cancelled show a banner (not the success toast) keeping partial text;
  per-hunk reject + explicit Reject work and Accept commits the chosen subset.
- No prototype "Design review" dock; sidebar untouched (feature #3).
- Final WI: acceptance recorded in `dev-docs/verification/feature-4-<YYYYMMDD>.md`; row → DONE → VERIFIED.
