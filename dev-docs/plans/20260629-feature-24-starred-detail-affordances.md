# Feature #24 — Starred word-detail: Open-in-workspace + IPA play

Status: Gate 2 (v2, audited round 1) · GH #202 · deferred from #22 · design `dev-docs/designs/lucid-starred-translations/` (committed HTML depicts both: Speak `:245`, Open-in-workspace `:266`)

## Problem
The #22 committed design's starred **word detail** depicts two affordances WI-4 deferred (they need wiring): an
IPA **"Speak word"** button and an **"Open in workspace ›"** button. The core review surface shipped + VERIFIED
(v0.20.0); this completes the design-depicted detail. Both surfaces are in the committed bundle → rule 51
satisfied (the HTML depiction is the authority); this is behavior wiring.

## User decision (2026-06-29)
Build **both**. "Open in workspace" **loads the item's source into the translate editor** (then the existing
auto-run-armed behavior takes over — NO bespoke run trigger) and returns the user to the workspace. A
`StarredItem` doesn't record its origin pane → it always lands in translate (approved default).

## Surface area (file-by-file)
- **NEW `src/lib/workspace/loadSource.ts` (+ test)** — mirror `openSettings.ts` **fully**: `LOAD_SOURCE_EVENT =
  'lucid:load-source'`; `loadSourceIntoWorkspace(text: string)` (dispatch `CustomEvent(LOAD_SOURCE_EVENT,
  {detail:{text}})`); **and `onLoadSource(handler: (text: string) => void): () => void`** that encapsulates the
  `CustomEvent<{text:string}>` cast + add/removeEventListener (both consumers subscribe through it; the cast
  lives in the 100%-gated lib). (gated `src/lib/**` → 100%.)
- **`src/components/translate/TranslatePanel.tsx`** — route the load through the **existing user-edit handler**
  `onSourceChange` at ~:75-80 (Gate-2 H1: it does `setSource` + `setAcceptedText(null)` +
  `useOperationStore.getState().reset('translate')` + the auto-run re-arm — NOT a bare `setSource`, else a stale
  result pane). **Stale-closure guard (Gate-2 r2 M):** `onSourceChange` is recreated each render (it reads the
  current `auto.armed`/`debounce`), but the listener subscribes once on mount — so subscribe via a **ref holding
  the latest handler**: `const handlerRef = useRef(onSourceChange); handlerRef.current = onSourceChange;` then
  `useEffect(() => onLoadSource((text) => handlerRef.current(text)), [])`. This reads the FRESH `auto.armed`/
  `debounce` at load time, so the load re-arms auto-run exactly per the current armed state — and never fires a
  stale auto-translate (the cost edge). **Focus deferred (Gate-2 M1):** a `loadNonce` state bumped on each load;
  an effect keyed on `loadNonce` focuses `lookup.textareaRef` (the #169 source ref at :186) via
  `requestAnimationFrame` — focus runs AFTER the (phone) pane unhides + state settles, not in the synchronous
  handler. Listener cleanup on unmount (via `onLoadSource`'s returned unsubscribe).
- **`src/components/workspace/Workspace.tsx`** — a SECOND `useEffect` subscribing via `onLoadSource(() => {
  setDrawerOpen(false); setActivePane('translate') })` (Gate-2 H2). The sidebar exposes no close affordance to
  `StarredView`, and on phone both panes are mounted + toggled by `activePane` (:36,55-68) — so Workspace owns
  the chrome (close the drawer on tablet/phone, switch to the translate pane on phone) while TranslatePanel owns
  the text. Two decoupled listeners, one event (the openSettings pattern). Cleanup on unmount.
- **`src/components/sidebar/StarredView.tsx`** — add a **detail header action cluster** (the design's right
  cluster, `:245-266`) with:
  - **Speak** (word kind only; always rendered for a word per the design) — reuse `createSpeech()`
    (`src/lib/speech/speak.ts`): `speak(item.source, item.sourceLang)`; reflect speaking + `voicesReady` /
    `hasVoiceFor(item.sourceLang)` with the **#20 `novoice`/disabled** state (NOT hidden — Gate-2 L3); mirror
    `LookupCardHost`'s memo + `subscribe` tick + **cancel-on-unmount** (`return () => speech.cancel()` — Gate-2
    M2, else audio survives ‹ All starred / Unstar). (Inline acceptable for a 1-WI feature; a shared
    `useSpeak(text,lang)` hook is the cleaner option — Gate-2 L2, noted.)
  - **"Open in workspace ›"** (both word + sentence) → `loadSourceIntoWorkspace(item.source)`.
- **i18n** `starred.openInWorkspace`, `starred.speak` (aria) — `src/locales/en/translation.json`.

### Files OUT of scope
- The translate result / lookup engine, the starred list/search (WI-4), the `starredStore` — unchanged
  (consumed only). The detail-header **star toggle** the design also shows (`:246`) is pre-existing #22 drift,
  out of #24 scope (but the Speak button lands in the header cluster this WI introduces).

## Work items
- **WI-1 (behavioral · FINAL · minor) — both affordances.** `loadSource.ts` (+ `onLoadSource`) + the
  `TranslatePanel` text listener (via `onSourceChange` + deferred focus) + the `Workspace` chrome listener
  (drawer/pane) + the two `StarredView` detail buttons (+ cancel-on-unmount speech) + i18n. One PR. CDP
  slice-verify: seed a starred item → detail → Open-in-workspace loads the source into translate (result pane
  cleared) + (phone) switches to translate; Speak fires speech.

## Test catalogue
- `loadSource.test` — `loadSourceIntoWorkspace(text)` dispatches `LOAD_SOURCE_EVENT{detail:{text}}`;
  `onLoadSource(h)` receives the text + the returned unsubscribe removes the listener.
- `TranslatePanel` — dispatching `LOAD_SOURCE_EVENT` routes through `onSourceChange`: the source is set AND the
  prior `op` is `reset` + `acceptedText` cleared (Gate-2 M3 — assert the stale result is gone, not just the
  source); **after toggling auto-run AFTER mount, the load re-arms (schedules) when armed and does NOT schedule
  when disarmed** (Gate-2 r2 — proves the ref-to-latest-handler reads fresh `auto.armed`, no stale auto-translate);
  listener cleaned up on unmount.
- `Workspace` — dispatching `LOAD_SOURCE_EVENT` → `drawerOpen` false + `activePane` `'translate'` (Gate-2 H2/M3).
- `StarredView` — word detail shows Speak + Open-in-workspace; sentence detail shows Open-in-workspace only;
  Open-in-workspace calls `loadSourceIntoWorkspace(item.source)`; Speak calls `createSpeech.speak(source,lang)`
  (mock the boundary); Speak shows the `novoice`-disabled state when no voice; speech cancelled on unmount.

## Risks + mitigations
- **Stale result on load (H1)** — route through `onSourceChange` (which already `reset`s the run on every
  keystroke); "Open in workspace" mid-stream behaves identically to a user edit (reuses the existing reset path,
  not a new hazard).
- **Phone dead-end (H2)** — Workspace switches `activePane` to translate + closes the drawer.
- **Focus on a hidden pane (M1)** — deferred via `loadNonce` effect + `rAF`.
- **Speech leak (M2)** — cancel-on-unmount in the detail.
- **Event leak** — both listeners unsubscribe on unmount (via `onLoadSource`'s returned cleanup).

## Backward compat
Additive — a new event + two detail buttons + the deferred focus; no store/persistence change; existing flows
unchanged (the load reuses the user-edit reset path).

## Audit fixes applied (Gate 2, round 1 → v2)
Round 1 = NEEDS REVISION (2 High + 3 Med + 4 Low). All addressed:
- **H1** listener → `onSourceChange` (reset path), not bare `setSource`. **H2** added the `Workspace`-level
  consumer (drawer close + phone pane switch). **M1** deferred focus (nonce + rAF). **M2** speech
  cancel-on-unmount. **M3** test catalogue += Workspace test + the TranslatePanel reset-path assertion.
- **Lows:** L1 `onLoadSource` subscribe helper added to the gated lib; L2 shared `useSpeak` noted (inline OK);
  L3 Speak uses the `novoice`/disabled state (not hidden); L4 "loads the source" (no bespoke re-translate).

## Gate-2 round-2 fix (v3)
- **M (new, introduced by v2's H1 fix):** the mount-time `onLoadSource` listener captured a stale `onSourceChange`
  closure → the auto-run takeover read a stale `auto.armed`/`debounce` (could fire an unasked hosted call ~1.5s
  after a load). Fixed via a **ref-to-latest-handler** (`handlerRef.current = onSourceChange`; listener calls
  `handlerRef.current(text)`) + an auto-run-re-arm test. (The `Workspace` listener closes over only stable
  setters → no exposure.)

## Revision history
- v1 (2026-06-29) — initial draft.
- v2 (2026-06-29) — Gate-2 round-1 fixes (2 High + 3 Med + 4 Low).
- v3 (2026-06-29) — Gate-2 round-2 fix (1 Med: stale-closure → ref-to-latest-handler). **Gate-2 PASSED**
  (0 open Crit/High/Med; the round-2 Medium closed by the ref pattern + auto-run test).
