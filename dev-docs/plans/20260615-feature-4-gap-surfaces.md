# Feature #4 — Lucid Workspace: designed gap surfaces

> Status: **DRAFT** (Gate 1; Gate-2 round 1 = MAJOR GAPS, v2 addresses it) · Tracker: `docs/features.md` #4
> Design: `dev-docs/designs/lucid-workspace/project/Lucid Workspace.dc.html` (revised; chat2 resolved
> needs-design #13–#18). Depends on #2 (VERIFIED). Branch `feat/feature-4-gap-surfaces` (stacked on the
> triage branch; main is protected).

## Revision history

| Rev | Date | Change |
|-----|------|--------|
| v1 | 2026-06-15 | Initial Gate-1 plan (5 WIs). |
| v2 | 2026-06-15 | Gate-2 round 1 (Codex `019ec907`, MAJOR GAPS). **Credential model:** Settings lists **implemented providers only** (like the switcher) → the existing single `apiKey` suffices; vendor-keyed credentials deferred until a 2nd provider ships (no new credential WI). **Dark (#16):** use the already-installed **next-themes** (`attribute="class"`, `defaultTheme="system"`) — OS `prefers-color-scheme`, no invented toggle (a manual toggle is undesigned → future needs-design); add **role tokens** (accent-ink/fill, success-text/solid, on-accent, danger-border) since components reuse `--accent-primary`/`--success` for two roles; theme pref persists via next-themes (a preference, not a secret). **Direction (#17):** a NEW `bidi.ts` (`resolveBidiDirection(text, override)` → `ltr|rtl`) **separate from** `detectDirection` (translation route `zh-en|en-zh`); forced direction is **visual-only, never the request language**; bidi is **per-surface, content-detected**, with a Translate override; `unicode-bidi: plaintext` + logical alignment + isolated controls. **Per-hunk (#15):** a NEW tested `groupHunks(segments)` that pairs adjacent del/add into atomic hunks (raw segment IDs alone give incoherent `oldnew`); `acceptedIds` reset by `runId`+diff identity. **Error (#14):** render every error via `error.messageKey`; **Retry only when `isRetryableError`**; cancelled → "Stopped"; corrected the architecture note (mapping is in `streamOp`, the store preserves the normalized outcome). **Key handling:** never called "secure storage" — explicit session-memory exception (rule 65 §5), test no persistence API is used, aborts in-flight panels on key change; provider-specific masking/validation. Added prior-art, backward-compat, PR sizes; re-split to **7 WIs**. Token table = design artifact (no product surface) — excluded. |

## Gate-2 round-2 resolutions (v3)

Round 2 (Codex `019ec907`) = NEEDS REVISION — 11 resolved, the 6 remaining addressed here (authoritative
over the prose below where they differ):

1. **Retry vs rule 65 §4 no-replay (High).** The banner's **Retry shows only when
   `isRetryableError(op.error) && op.text === ''`** (a zero-byte transient failure). When partial text
   was streamed, NO Retry is offered — the user uses **Regenerate** (a fresh request that *replaces*
   the result, never appends). Tested: retryable+empty ⇒ Retry; retryable+partial ⇒ no Retry;
   non-retryable ⇒ no Retry. (WI-5)
2. **Abort-on-key-change coordinator (Medium).** The Settings save path computes
   `changed = newKey !== currentKey`; only if `changed` does it **abort the panels whose `status ===
   'streaming'`** (translate / polish / draftTranslate) and then call `setApiKey`; `clearKey` behaves
   the same. **Idle/done panels are never touched** (no spurious `cancelled`). Tests: a streaming panel
   → cancelled; idle/done panels unchanged; a same-value save aborts nothing. (WI-1)
3. **Bidi = Unicode first-strong (Medium).** `resolveBidiDirection(text, override)`: `override !== 'auto'`
   ⇒ forced; else scan for the FIRST **strong** directional codepoint — first char in an RTL script
   (`\p{Script=Arabic}|Hebrew|Syriac|Thaana`) ⇒ `rtl`; first strong-LTR `\p{Letter}` (non-RTL script)
   ⇒ `ltr`; no strong char (neutrals/digits/empty) ⇒ `ltr` (default). Deterministic first-strong, not
   "majority". Fixtures: first-strong-RTL, first-strong-LTR, leading-neutral-then-RTL, digits-only,
   neutral-only, mixed-order. (WI-3)
4. **Runtime-invalid credential (Medium).** Settings derives a **rejected** state from the panel ops: if
   any panel op is `{status:'error', error.kind:'invalidKey'}` for the active provider, the saved key is
   shown **invalid** (distinct from shape-invalid); entering a new key clears it. Tested: a
   correctly-shaped key + an `invalidKey` panel outcome ⇒ Settings shows invalid; replacing the key
   clears it. (WI-1)
5. **Role-token map (Medium, WI-2).** New role tokens (exact light/dark hexes transcribed from the
   design's committed token table in WI-2; legacy names keep their current value + add the dark value):

   | token | role | legacy alias (current consumer) | value source |
   |---|---|---|---|
   | `--accent-primary` | accent **fill** (buttons, dots) | (existing) | design table |
   | `--accent-ink` | accent **as text** (links, diff-add fg) | was `--accent-primary` in `--diff-add-fg`, `--accent-foreground` | design table |
   | `--success` | success **text/icon** | (existing) | design table |
   | `--success-solid` | success **button fill** (Accept) | was `--success` in `TranslateResult`/`PolishResult` Accept bg | design table |
   | `--on-accent` | text **on** accent/success fills | was hardcoded `white` | design table |
   | `--danger-border` | error banner border | (new) | design table |

   Consumer inventory to update for the split: `TranslateResult`/`PolishResult` Accept buttons
   (`--success` → `--success-solid` bg, `white` → `--on-accent` fg), `--diff-add-fg`/`--accent-foreground`
   (→ `--accent-ink`), the new `ResultBanner`. shadcn `@theme inline` bridge + Tailwind exports updated
   for the new names. All other tokens keep their names; dark values added under `.dark` from the table.
6. **Banner title + body (Medium).** The design's banner has a localized **title + body**. Add
   `banner.<kind>.title` keys (Rate limited / Provider unavailable / Invalid key / Timed out / Request
   failed / Stopped) for the title; `t(error.messageKey)` is the body. `ResultBanner` renders both and
   **never** renders `error.detail`. Tested: title+body per kind; detail never shown. (WI-5)

## Problem

Feature #2 shipped the workspace but deferred six surfaces as `needs-design`. The loop completed
(chat2) with committed designs. This feature implements the five that extend the **workspace** (#13–#17);
the **sidebar** (#18) is feature #3. Highest value: **#13 (API-key entry)** — without it the app is
mock-only and cannot make a real request.

## Scope

**In scope** (each resolves a closed needs-design issue; existing logic is reused, not rebuilt):

- **#13 — Provider Settings / API-key entry.** A shadcn `Dialog` from the header Settings button:
  key entry for **implemented providers only** (Anthropic today — `implementedPresentations()`), with
  empty / saved-masked (`sk-…last4`) / invalid states, a reveal toggle, and a note that the key is held
  **in memory for this session only — not persisted, never logged** (rule 65 §5; NOT called "secure
  storage"). Wires to `providerStore.setApiKey`/`clearKey`. **Changing/clearing the key aborts any
  in-flight panel run** so no stream uses a stale credential.
- **#16 — Dark theme.** Wrap the app in **next-themes** `ThemeProvider` (`attribute="class"`,
  `defaultTheme="system"`, `enableSystem`) — dark follows the OS, no invented toggle. Replace the
  `.dark` light-mirror with the design's real warm-charcoal palette, adding **role-specific tokens**
  (accent fill vs ink, success text vs solid, on-accent, danger border) and updating the few feature-#2
  consumers that conflated them; AA-checked.
- **#17 — RTL + direction override.** A new `src/lib/translation/bidi.ts` —
  `resolveBidiDirection(text, override: 'auto'|'ltr'|'rtl'): 'ltr'|'rtl'` — **content-detected** (strong
  RTL scripts ⇒ rtl), **independent of** the translation route. A Translate direction-override control;
  `dir` + `unicode-bidi: plaintext` + logical alignment on the source/result and Polish
  editors/result/diff; forced direction changes **layout only**, never the request's `sourceLang`.
- **#14 — Error / cancelled banner.** `ResultBanner` consumes the panel op's **already-normalized**
  `ProviderError` (mapping lives in `streamOp`; the store preserves it) and renders
  `t(error.messageKey)`; **Retry only when `isRetryableError(error)`**. Cancelled → a neutral "Stopped".
  Partial streamed text always stays (rule 65 §3). The success toast is never reused for errors.
- **#15 — Diff Reject + per-hunk accept.** A new tested `groupHunks(segments)` (pairs adjacent del/add
  into atomic hunks). In Polish Compare: per-hunk keep/reject toggles, explicit **Reject** (discard
  polish, keep draft), Keep-all / Reject-all, an "N of M kept" summary, honest footer copy
  ("Review the diff before accepting"). Accept commits `applyDiff(segs, acceptedIds)` for the chosen
  hunks; `acceptedIds` resets on each new result (keyed by `runId`).

**Out of scope:** the sidebar (#18 → feature #3); the prototype **"Design review" dock** and its
Light/Dark toggle + the **token table** (design artifacts, not product surfaces); a **manual theme
toggle** (undesigned — future needs-design; OS preference ships now); **vendor-keyed credentials**
(deferred until a 2nd provider is implemented); persistent secret storage (rule 65 §5).

### Files OUT of scope (consumed, not behavior-changed)

- `src/lib/prompts/**`, `src/providers/{base,stream,errors,anthropicProvider,index}.ts` — VERIFIED;
  `streamOp` already normalizes errors, `validateRequest` is wired. No provider-layer change.
- **Bounded touches:** `providerStore.ts` gains an additive `clearKey()` (type-safe, in-memory) for
  #13; `index.css` gets the dark values + role tokens (#16).

## Prior art / precedent / rejected alternatives

- **next-themes for #16** — already a dependency (pulled in by `sonner`). *Chosen* over a hand-rolled
  `themeStore`: it manages the `.dark` class, `system` (OS) preference, and preference persistence
  correctly. *Rejected: a custom themeStore* (re-implements what next-themes does; the audit flagged a
  hand-rolled store as unnecessary). No manual toggle ships (undesigned); `defaultTheme="system"`.
- **bidi separate from route** — `detectDirection` returns the translation route (`zh-en|en-zh`); visual
  bidi (`ltr|rtl`) is a *different* concept. *Chosen: a separate `bidi.ts`.* *Rejected: overloading
  `detectDirection`* (would break its type + callers; conflates language routing with layout — audit H).
- **Hunk grouping for #15** — `applyDiff` toggles raw segment IDs; accepting only an `add` yields
  `oldnew`. *Chosen: `groupHunks` pairs the del+add of a change into one atomic hunk.* *Rejected:
  exposing raw segment toggles* (incoherent partial accepts — audit H).
- **Settings = implemented providers only** — mirrors the switcher (`implementedPresentations()`);
  the single `apiKey` suffices for one implemented vendor. *Rejected: a 4-provider dialog with
  unavailable rows* (undesigned no-op rows — rule 51; audit H). Vendor-keyed creds arrive with the 2nd
  provider.
- **Retry gating** — reuse `isRetryableError` (the provider layer's own predicate) rather than a new
  per-kind table.
- **Reuse precedent** — error normalization (`streamOp`), `applyDiff`, `detectDirection`,
  `providerStore`, `operationStore`, `providerPresentation`, the token layer — all from feature #2.

## Work-item sequencing

| WI | Title | Tier | Resolves | PR |
|----|-------|------|----------|----|
| WI-1 | Settings dialog + API-key entry (implemented providers; `clearKey`; abort-on-change; masked/invalid; session-memory note) | behavioral | #13 | M |
| WI-2 | Dark theme — next-themes provider (system) + role tokens + real dark values | behavioral (+css) | #16 | M |
| WI-3 | `bidi.ts` — `resolveBidiDirection(text, override)` (content-detected, route-independent) | foundational (lib, 100%) | #17a | S |
| WI-4 | RTL wiring — `dir`+`unicode-bidi`+logical CSS on editors/result/diff; Translate override control | behavioral | #17b | M |
| WI-5 | `ResultBanner` — normalized error → `messageKey`; Retry iff `isRetryableError`; cancelled "Stopped"; partial kept; per-panel `lastRequest` for Retry | behavioral | #14 | M |
| WI-6 | `groupHunks(segments)` — atomic del/add hunks | foundational (lib, 100%) | #15a | S |
| WI-7 | Per-hunk UI + Reject — toggles, Keep/Reject-all, N-of-M, honest footer; `acceptedIds` reset by `runId`; Accept commits the subset | behavioral | #15b | L |

Order = value: **#13 first** (unblocks real requests + real verification), then dark, bidi+RTL, error
banner, hunk model + UI. Logic WIs (WI-3, WI-6) are TDD at 100%; UI WIs are behavioral (ARIA tests);
`pnpm check:all` green per WI; own commit each.

## Test catalogue

- `src/lib/translation/bidi.test.ts` — `resolveBidiDirection`: LTR text ⇒ ltr; Arabic/Hebrew/strong-RTL
  ⇒ rtl; mixed (RTL majority) ⇒ rtl; empty ⇒ ltr; override `'ltr'`/`'rtl'` force; CJK/Latin ⇒ ltr.
- `src/lib/polish/groupHunks.test.ts` — adjacent del+add ⇒ one hunk (both ids); standalone add/del ⇒ its
  own hunk; `same` never in a hunk; hunk ids map back to `DiffSegment` ids; accepting a hunk via
  `applyDiff` yields the result for that change, rejecting yields the original — for every hunk shape.
- `src/stores/providerStore.test.ts` (extend) — `clearKey()` empties the key + `isReady()` false.
- `SettingsDialog.test.tsx` — opens from the Settings button; only implemented providers shown; enter a
  key → `setApiKey` + masked `sk-…last4`; reveal toggles; invalid (shape) shows the hint; saving a new
  key while a panel streams aborts that panel.
- `ResultBanner.test.tsx` — retryable kind ⇒ message + Retry; non-retryable (invalidKey/validation/
  refusal) ⇒ message, NO Retry; cancelled ⇒ "Stopped", no Retry; partial text remains.
- `TranslatePanel`/`PolishPanel` (extend) — override switches `dir`; error banner appears on a mocked
  error and Retry re-runs `lastRequest`; per-hunk Reject changes the accepted text; explicit Reject keeps
  the draft; Accept commits the chosen subset.
- `themeStore`? none — next-themes is vendored; assert the `ThemeProvider` mounts + `.dark` class
  reacts to a mocked `matchMedia` in a small behavioral test.

Logic globs stay 100%; components behavioral (outside globs). Mocked provider only (rule 65 §8).

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Single global `apiKey` can't back a multi-provider dialog (audit H) | Settings shows IMPLEMENTED providers only (Anthropic) → one key is correct; vendor-keyed creds deferred to the 2nd provider. |
| Production theme toggle undesigned (audit H) | Ship OS-preference dark via next-themes `system`; a manual toggle is future needs-design. |
| Dark roles (accent fill/ink, success text/solid) collide on shared tokens (audit H) | Add role tokens; update only the few feature-#2 consumers that conflated them; AA contrast pass. |
| Route vs bidi conflation (audit H) | Separate `bidi.ts`; forced direction is visual-only, never `sourceLang`. |
| Raw segment toggles give incoherent accepts (audit H) | `groupHunks` pairs del/add atomically; tested per shape. |
| Over-broad Retry (audit H, rule 65) | Retry gated on `isRetryableError`; every error via `messageKey`. |
| Key change mid-stream uses stale credential (audit H) | `setApiKey`/`clearKey` abort the affected panels (operationStore.abort) before the change settles; concurrency test. |
| `acceptedIds` stale across results (audit M) | Reset keyed by `runId` (+ diff identity); tested across regenerate/edit/Reject/consecutive runs. |
| Mixed-bidi diff/controls (audit M) | `unicode-bidi: plaintext`, logical alignment, isolated caret/buttons; fixtures with RTL + URLs/code/numbers/emoji. |
| "secure storage" overclaim (audit M, rule 65 §5) | Session-memory only; never called secure; test no persistence API is used; document the future proxy boundary. |

## Backward compatibility

- `providerStore` gains `clearKey()` (additive); `apiKey` stays in-memory (no persistence). Existing
  feature-#2 tests unaffected.
- `index.css`: dark values + role tokens are additive; light values unchanged; feature-#2 components keep
  reading the same names (only role-conflated spots updated, no rename).
- next-themes `ThemeProvider` wraps `App`; no API/route change. `.dark` class strategy (rule 34) preserved.
- No persisted data; theme preference (non-secret) persists via next-themes localStorage — opt-out-able.

## Definition of Done

- WI-1..WI-7 done; logic TDD at 100%; behavioral ARIA tests; `pnpm check:all` green; per-WI commits.
- **The app makes a real request**: enter a key in Settings → translate/polish stream for real (mock-only
  lifted). Dark follows the OS with a real palette; content bidi + override work (visual-only); errors
  show a banner with Retry only when retryable, keeping partial text; per-hunk Reject + explicit Reject
  work and Accept commits the chosen subset.
- No prototype dock / token-table / manual toggle / sidebar (feature #3); key never persisted/logged.
- Final WI: acceptance in `dev-docs/verification/feature-4-<YYYYMMDD>.md`; row → DONE → VERIFIED.
