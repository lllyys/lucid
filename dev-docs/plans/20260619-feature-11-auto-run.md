# Feature #11 — Auto-run translate & polish after typing (debounced)

- **Status:** PLANNED (Gate 2 re-audit on v2 optional)
- **GH:** #94 · design #108 (closed, delivered)
- **Tracker row:** `docs/features.md` #11 (Medium)
- **Design bundle:** `dev-docs/designs/lucid-auto-run/` (committed PR #122)
- **Slug:** auto-run

## Problem

Runs are manual today (Translate/Polish buttons → `usePanelRun().run`). Users want the result to refresh
automatically after they stop typing (refs #94) — **opt-in, off by default** so a hosted provider never
fires surprise paid calls per keystroke (rule 65). Implements the committed design: a header toggle, a
debounce-pending countdown, an AUTO tag, a hosted-provider cost gate, suppressed/paused states, IME safety.

## Design reference (rule 51 — committed bundle)
`dev-docs/designs/lucid-auto-run/project/Lucid Auto-run (feature 11).dc.html`: header toggle beside Run
(off→on; primary button → "Run now"); first-enable **cost gate** on hosted providers (local skips it); a
**pending chip + countdown ring** ("Auto-run in 1.5s", cancellable) — also shown **inline in the source
footer with a char count**; the auto-running result carries a quiet **AUTO** tag; **disabled toggle with a
reason** + **Auto-run paused** when the provider isn't ready; **IME-safe** (held during composition,
debounce starts only after commit). Debounce ≈ 1.5s. ⌘↵ / Ctrl↵ = Run now.

## Exact current signatures (verified by Gate-2 against the code — build against THESE)
- `usePanelRun.ts:16` — `run: (panel: PanelId, request: LLMRequest) => void`; `abort: (panel: PanelId) => void`. (`run` does the `isReady()` check at `:22` before `ops.run`.)
- `operationStore.ts:45` — `run(panel, request, provider)` (provider is the 3rd arg). `PanelOp = OperationState & {…}`; `patch()` builds the full object at the IDLE init (`:19`), `abort` (`:62`), `reset` (`:74` — bumps `runId`), `fail` (`:80`), and the run patches (`:94/:103/:108`). `isStale` is a **closure-local** fn inside `run` (`:96`) — NOT exported.
- `TranslatePanel.tsx:32-40` `onRun` (guards `!source.trim()`), `:41-45` `onSourceChange` (calls `reset('translate')` every keystroke). `PolishPanel.tsx:74-88` `onPolish` (builds the request from `draft`+`original`+`keywords`+`tgtLang`); `:42-44` a `draftTranslate` mirror **machine-writes `draft`** while translating; `:60-64` `onDraft`/`onOriginal` call `resetForInput()`.
- Textareas: `TranslatePanel.tsx:118`, `DraftCard.tsx:60`, `OriginalCard.tsx:28` — **only `onChange` today; NO composition or keydown handlers exist anywhere** (Gate-2 grep-confirmed).
- `providerPresentation.ts` — `presentationFor(vendor).isLocal` is the hosted-vs-local signal (confirmed).

## Surface area (file-by-file)

### WI-1 — `useAutoRunDebounce` hook + `isAuto` plumbing (foundational/logic; coverage-gated)
- **`isAuto` threading (C1/C2 — exact)**: extend `usePanelRun.run(panel, request, isAuto = false)` → call
  `ops.run(panel, request, provider, isAuto)` (isAuto is the **4th** arg, after provider). `operationStore`:
  add `isAuto: boolean` to `PanelOp`; **capture it once at run start and re-spread it in EVERY patch** in
  the streaming loop (`:94/:103/:108`), exactly as `runId`/`startedAt` are, so the AUTO tag can't flicker
  mid-stream; set `isAuto:false` in the IDLE init / `abort` / `reset` / `fail` constructions. **This is a
  type change → the existing `PanelOp` literals in `usePanelRun.test.tsx` (`:41`,`:107`) +
  `operationStore.test.ts` MUST be updated** (mandatory, not optional).
- **`src/hooks/useAutoRunDebounce.ts`** — `useAutoRunDebounce(panel: PanelId, opts?: { minChars?: number; debounceMs?: number }) → { isPending: boolean; isComposing: boolean; pendingKey: number; scheduleRun: (request: LLMRequest) => void; cancel: () => void; onCompositionStart: () => void; onCompositionEnd: (request: LLMRequest) => void }`.
  - `scheduleRun`: **cheap rejects at schedule** (no-op, don't arm) when composing, text empty/whitespace,
    or trimmed length < `minChars`, or `!providerStore.isReady()`. Otherwise reset the timer (default
    1500ms) + set `isPending` + bump `pendingKey` (so the CSS ring restarts — see H3 below). Captures
    `useOperationStore.getState()[panel].runId` at schedule time.
  - **On fire**: re-read the current `runId`; if it changed (a newer edit/abort/reset) → no-op (the
    closure-local `isStale` is not exported, so the hook captures + compares `runId` itself). Otherwise
    call `usePanelRun().run(panel, request, /*isAuto*/ true)`. `usePanelRun.run` already re-checks
    `isReady()` at fire, so the hook need not duplicate the not-ready check at fire — but state drift
    between schedule and fire is expected, so fire-time validation is mandatory (covered by run's guard).
  - **IME (C3)**: `onCompositionStart` sets `isComposing=true` (so `onChange`'s `scheduleRun`, which React
    fires *during* composition, is suppressed); `onCompositionEnd` clears it AND **re-arms**
    (`scheduleRun(request)` with the committed text) — the design's "timer is held, then starts from full
    duration on commit".
  - **No `remainingMs` (H3)**: the ring is pure CSS (the design's `lucid-ring` keyframe / `stroke-dashoffset`).
    The hook exposes `isPending` + `pendingKey` (a counter); the ring component is `key`ed off `pendingKey`
    so each reschedule remounts it → the CSS animation restarts. NO per-frame state / re-render storm.
  - `useEffect` cleanup clears the timer on unmount (StrictMode double-mount safe). Test seams: `debounceMs`/
    `minChars` overridable + fake timers.

### WI-2 — toggle + indicators + cost gate + IME/keyboard wiring (final WI; behavioral; **designed**)
- **`src/stores/autoRunStore.ts`** (M3/M4) — a dedicated store persisted via `createSafeJSONStorage` under
  a NEW key `lucid.autorun` (SEPARATE from the secret-bearing `lucid.provider` — rule 65 §5):
  `{ enabled: Record<PanelId, boolean>; costAck: Record<Vendor, boolean> }`. **Per-panel** toggle
  (`enabled[panel]`, off by default — the design shows a toggle in each panel header; "persists per
  workspace" = survives reload). `costAck[vendor]` records the one-time hosted-provider acknowledgment.
- **Panel header toggle** (`TranslatePanel`/`PolishPanel` headers): the switch beside Run; on → primary
  button becomes "Run now". **Disabled with a reason** ("Add a key… Open Settings") when `!isReady()`.
- **Wire the hook**: pass `onCompositionStart`/`onCompositionEnd` down as new props to the source
  textareas — **`DraftCard`/`OriginalCard` gain `onCompositionStart`/`onCompositionEnd` props** (new
  surface), and the Translate textarea wires them directly. Call `scheduleRun` from the existing source
  `onChange` when `enabled[panel]`. **Polish arming (M1)**: arm on user edits to `draft`, `original`, and
  the keyword set + target-lang change (all feed the polish request) — but **NOT** while `translating`
  (the `draftTranslate` mirror machine-writes `draft`; guard `if (translating) return`).
- **⌘↵ / Ctrl↵ (H1)**: a keydown handler on the source textareas — Cmd (mac) / Ctrl (else) + Enter →
  `cancel()` the pending timer + run immediately (manual, isAuto=false). Cross-platform.
- **Pending indicator**: the countdown-ring chip (CSS-animated, keyed off `pendingKey`), cancellable
  (`cancel`) — rendered from hook state (independent of the op being `reset` to idle each keystroke, M2);
  shown both as the standalone chip AND **inline in the source footer with the char count** (L4 — the
  design depicts the in-context placement).
- **AUTO tag**: the streaming/result chrome shows the AUTO chip when the active op's `isAuto` is true
  (manual run while auto is on → isAuto=false → no tag, M-precedence).
- **Cost gate**: enabling auto-run on a **hosted** provider (`!presentationFor(vendor).isLocal`) for the
  first time (`!costAck[vendor]`) → a confirm dialog; on accept set `costAck[vendor]=true`. Local skips it.
- **Paused state**: auto-run on + provider goes unready → the "Auto-run paused" warning (keep text +
  toggle; "Fix" → Settings).
- New i18n keys in `src/locales/en/*.json`.

### Files OUT of scope
- Result/diff engines + provider internals (auto-run only *triggers* the existing run). #10/#15.

## Prior art / precedent / rejected alternatives
- Reuses `usePanelRun`/`operationStore` (AbortController abort-on-new-input already there). Debounce mirrors
  `syncOrchestrator.ts`'s setTimeout/clearTimeout. `#14`'s `useAutoRecordTask` = the small panel-hook
  precedent. `lucid.provider` already persists non-secret config via a strict partialize allowlist — the
  new `lucid.autorun` key stays fully separate (no secret risk). Rejected: fire-per-keystroke; on-by-default;
  a new run pipeline.

## Work-item sequencing
| WI | Tier | Designed? | PR size |
|---|---|---|---|
| WI-1 useAutoRunDebounce + isAuto plumbing | foundational/logic | n/a | medium (coverage-gated; updates existing op tests) |
| WI-2 toggle + pending + AUTO + cost-gate + paused + IME + ⌘↵ (final) | behavioral | yes (bundle) | medium-large |

WI-1 is logic (100%-gated) but **touches `operationStore`'s invariant-sensitive write paths + breaks the
existing `PanelOp` test literals → those tests are updated in WI-1**. WI-2 = designed UI → minor bump +
Gate-5 browser verify.

## Test catalogue
- `useAutoRunDebounce.test.tsx`: schedule→fire (fake timers) calls `run(…, true)`; reset on re-schedule;
  abort before fire → run never called; **composing → not armed**; **compositionEnd re-arms**; provider
  not ready → not armed; empty/whitespace/< minChars → not armed; **stale-runId at fire → no-op**; unmount
  clears the timer (StrictMode); `pendingKey` increments per schedule.
- `operationStore.test.ts` / `usePanelRun.test.tsx`: **update existing `PanelOp` literals for `isAuto`** +
  assert `isAuto` threads (manual=false, auto=true) + survives every streaming-loop patch (no mid-stream
  flicker).
- `autoRunStore.test.ts`: enabled per-panel default off + persist; costAck per-vendor; safeJSONStorage key
  `lucid.autorun` (no secret).
- WI-2 (Gate-5 browser + component tests): toggle off→on; typing → pending ring (in footer + chip) →
  auto-run fires with AUTO tag; "Run now"/⌘↵ cancels pending + fires manual (no AUTO tag); hosted cost-gate
  once / local skips; provider-unready → toggle disabled / paused; **CJK/IME: a composition does NOT fire
  mid-compose, fires after commit**; huge paste → one run (existing path handles large input, L3).

## Risks + mitigations
- **API cost** → off by default + non-empty/minChars guard + hosted cost gate + debounce coalescing.
- **IME (CJK-first)** → composing flag set on compositionstart (before onChange), re-arm on compositionend;
  Gate-5 verifies no mid-compose fire. New card props carry the events up.
- **Provider not ready / cleared mid-pending** → schedule-time reject + `usePanelRun.run`'s fire-time
  `isReady()` (→ op invalidKey) + disabled/paused toggle. Tested.
- **Stale run / abort-on-reedit / TranslatePanel reset-per-keystroke (M2)** → the hook captures+compares
  `runId`; the pending chip renders from hook state (not op state). A new edit cancels the timer.
- **draftTranslate mirror spurious arm (M1)** → guard `if (translating) return` so machine-written `draft`
  never arms auto-polish.
- **Remount/StrictMode** → `useEffect` cleanup; no runtime state persisted (only the toggle/costAck prefs).
- **Concurrent panels (L1)** → Translate + Polish auto-run independently (separate op controllers) — by
  design; each opt-in separately.

## Backward compat
Additive + opt-in (off by default) → zero behavior change unless enabled. New `lucid.autorun` localStorage
key (absent → off). The additive `PanelOp.isAuto` defaults false → existing manual runs unchanged (only the
test literals are updated to include it).

## Revision history
- 2026-06-19 v1 — initial plan (Gate 1), grounded in the design + the exploration map.
- 2026-06-19 — Gate 2 round 1: **NEEDS REVISION** (3 Critical, 3 High, 4 Medium). Approach sound; the plan
  named non-existent signatures + assumed IME/⌘↵ infra. Findings → v2.
- 2026-06-19 v2 — all C/H/M addressed: **C1/C2** exact isAuto arg-threading (run 3rd / ops 4th) + capture-
  and-re-spread in every PanelOp patch + update existing op test literals; **C3** real IME (new card
  composition props, compose-suppress + compositionend re-arm); **H1** ⌘↵/Ctrl↵ scoped into WI-2; **H2**
  schedule-reject + mandatory fire-time re-validation (hook captures runId; usePanelRun.run owns the
  not-ready re-check); **H3** CSS ring via `pendingKey` (no remainingMs re-render storm); **M1** Polish
  arms on draft/original/keywords/lang + guards the draftTranslate mirror; **M2** pending from hook state;
  **M3** dedicated `lucid.autorun` store (separate from the secret store); **M4** per-panel toggle (design
  "per workspace" = persisted); **L1-L4** concurrent-independent, non-empty/minChars guard, huge-paste
  test note, in-footer pending placement. Re-audit optional — corrections are signature-exact per the
  Gate-2 citations; per-WI Gate-4 re-verifies the diff.
