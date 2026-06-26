# Feature #20 — Click-a-word dictionary popover

Status: Gate 2 (v2, multi-lens audited round 1) · GH #164 · design: `dev-docs/designs/lucid-word-lookup` (resolves needs-design #166) · editable-pane follow-up: #169

## Problem
A reader/learner wants to click a word in a rendered result and instantly see, for that word in its sentence
context: its **translation**, **pronunciation (IPA)**, and **in-context meaning**, with an optional **play
button** to hear it. Lucid has no dictionary/word-lookup/TTS today (provider interface is
`translate`/`polish`/`stream` only). This adds a lookup capability behind the provider interface + the designed
popover.

## Design (committed)
`dev-docs/designs/lucid-word-lookup/project/Lucid Word-lookup Popover (feature 20).dc.html`. Depicts the popover
anatomy + all 6 states (loading/loaded/playing/no-audio/error/long-multi-sense) + light/dark + phone bottom-sheet
(<600) + RTL + focus/a11y.

## Token + animation mapping (binding — Gate-2 corrected)
Map design tokens to the codebase (`--surface`→`--bg-color`, `--canvas`→`--bg-canvas`, `--ink`→`--text-color`,
`--border`→`--border-color`, `--border-strong`/`--border-dashed` verbatim, `--accent`→`--accent-primary`,
`--accent-ink`/`--accent-border` verbatim, `--accent-soft`→`--accent-subtle`, `--t1..t6`→`--text-secondary`/
`--text-tertiary`/`--text-disabled`, `--danger*`→`--error-color`/`--error-bg`/`--danger-border`, `--ok`→`--success`,
`--on-accent`/`--scrim` verbatim). Fonts: serif→`--font-serif`, mono→`--font-mono`. **Verify each resolves in
`src/index.css` before use.**
- **Shadow (Gate-2 M1):** the design composes two bare-rgba shadow COLORS (`--shadow-c1/c2/c3`) inside one
  `box-shadow`; the codebase `--shadow-*` are full shorthands and are NOT substitutable inside that expression.
  **Decision:** the popover lift uses the existing overlay shorthand **`box-shadow: var(--shadow-menu)`** (rule 32
  overlay shadow) — drop the design's per-layer `--shadow-c*` composition. Do NOT map `--shadow-c*`→`--shadow-*`.
- **Keyframes (Gate-2 H1 — name collision):** `lucid-ring` and `lucid-pulse` ALREADY EXIST in `src/index.css`
  (`lucid-ring` = feature #11's auto-run countdown ring; `lucid-caret` also exists). **Add ONLY new, uniquely-named
  keyframes: `lucid-speak-ring` (the playing expanding ring), `lucid-eq-bars` (the EQ bars), `lucid-skel` (the
  skeleton shimmer). REUSE the existing `lucid-pulse` + `lucid-caret`. Do NOT redefine `lucid-ring`/`lucid-pulse`.**
  No-regression: the feature-#11 countdown-ring keyframe must remain untouched (a test/CDP check that auto-run's
  ring still animates).

## Scope decisions (v1) — Gate-2 ratification needed before WI-6/7
- **Rendered result panes only:** word-click is hosted by `TranslateResult` (done text) and `PolishResult`
  **Result view**. **The design's board-header PROSE names four anchors** ("translate result, polish original,
  draft, or result"), but every depicted popover ARTIFACT anchors on a rendered pane; the editable
  `OriginalCard`/`DraftCard` are `<textarea>`s that can't host word-click without a text-overlay the bundle
  doesn't spec. **v1 ships 2 of the 4 named anchors; editable-pane lookup is deferred to follow-up #169.** This is
  an explicit, acknowledged scope cut (rule 51) — **surfaced to the user for accept/defer before the WI-6/7 UI
  wiring** (the headless WI-1..5 are anchor-agnostic, so the build is not blocked on the answer).
- Compare/diff-view clicking **descoped** (not depicted).
- **IPA + structured fields come from the model** (the define JSON), not a local dictionary — tests assert
  structure/fields/behavior, never exact IPA/wording (rule 66 §4; do NOT assert the design's sample `/ˈstʌtər/`).
- **Lookup target/source language (Gate-2 L1 — corrected):** NOT from `usePanelRun`/`activeTarget` (that returns
  a `ProviderConfig`, not a language). The host pane derives direction via `directionLabels(detectDirection(text))`
  (as `TranslatePanel.tsx` does); **thread `targetLang` + `sourceLang` from the host pane into the word-activate
  payload at click time** (`{word, sentence, offset, sourceLang, targetLang}`) rather than re-reading in the hook.
  (Gate-2 round-2 note: `detectDirection` is 中↔EN scope — the lookup's `targetLang` inherits the host pane's
  中↔EN direction, NOT the word's actual language; broader language coverage is a follow-up, not a v1 gap.)

## Surface area (file-by-file)
- **`src/providers/types.ts` — `DefineRequest`** (`kind:'define'`; `word`, `sentence`, `sourceLang?`,
  `targetLang`); extend the `LLMRequest` union. `LLMProvider`/`stream`/`streamOp` unchanged (accept any request).
- **`src/lib/prompts/index.ts` (Gate-2 H2 — restructure):**
  - `validateRequest`: add `'define'` to the discriminant guard, and **handle the `define` branch BEFORE the
    shared `req.text.trim()`/length checks** (a `DefineRequest` has no `text` field — accessing it throws a raw
    TypeError inside `base.ts`'s validation, defeating the normalized-error contract). Move the shared text checks
    INSIDE the translate/polish branches. The define branch validates `word` (non-empty) and `sentence`
    (≤ `MAX_INPUT_CHARS`) and rejects an **unknown `targetLang`** (must pass `resolveLanguage`).
  - `buildPrompt`: convert the binary ternary to an **exhaustive `switch (req.kind)`** with no implicit polish
    fallthrough (`define` has its own case); add `buildDefinePrompt(req)`. The prompt instructs the model to
    return ONE JSON object `{word, ipa, partOfSpeech, translations[], meaning, senses[]}`; the user-supplied
    `{word, sentence}` is injected as DATA via `JSON.stringify` in the USER slot (the polish reference-mode
    anti-injection pattern); the SYSTEM slot carries only the instruction + the curated `resolveLanguage(targetLang)`
    label (never the raw string). Bump `PROMPT_VERSION`.
- **NEW `src/lib/lookup/segment.ts` (+ test)** — `tokenize(text, locale)` (word/non-word segments + cumulative
  offsets via `Intl.Segmenter` granularity:'word') and `sentenceAt(text, offset, locale)` (granularity:'sentence').
  CJK (no spaces), RTL, emoji, mixed-script, punctuation-adjacent/hyphenated.
- **NEW `src/lib/lookup/parseDefine.ts` (+ test)** — partial-tolerant parse of the streamed define JSON: yield
  `{word, ipa}` early, fill `translations`/`meaning`/`senses` as they arrive; tolerate incomplete JSON mid-stream;
  a final-but-unparseable/empty result returns a sentinel the hook maps to error. **Keys only on the MODEL's
  emitted object** — never on the echoed input sentence (which may contain JSON metacharacters).
- **NEW `src/lib/speech/speak.ts` (+ test)** — `createSpeech({ synth? })` → `{ speak(text,lang), cancel(),
  isSpeaking(), hasVoiceFor(lang), subscribe(cb) }`. Wraps `SpeechSynthesisUtterance` (cancel-prior, BCP-47 `.lang`,
  voice pick by lang-prefix from `getVoices()`, `onstart/onend/onerror` → state). **(Gate-2 H4)** exposes a
  `subscribe`/`voiceschanged` signal so consumers re-evaluate `hasVoiceFor` when voices load async; expose a
  **`voicesReady` flag** so the popover distinguishes "voices not loaded yet" (transient) from "loaded, none match"
  (the design's no-voice state). **(Gate-2 M4)** `cancel()` no-ops safely when `typeof window.speechSynthesis ===
  'undefined'` (jsdom). Injectable `synth` for tests.
- **NEW `src/stores/lookupStore.ts` (+ test)** — Zustand (TDD-gated 100%). Holds ONE active lookup:
  `{ word, ipa, partOfSpeech, translations, meaning, senses, status:'idle'|'streaming'|'done'|'error', error?,
  runId }`. **(Gate-2 Low)** a separate store (not `operationStore`) because operationStore models per-`PanelId`
  streamed TEXT — lookup needs structured fields + a single active entry, which would corrupt the panel union.
- **NEW `src/hooks/useWordLookup.ts` (+ test)** — modeled on `usePanelRun`: build the active provider
  (`createProvider(cfg.vendor, activeTarget(cfg))` — config only), drive `provider.streamOp(defineRequest, {signal})`,
  accumulate → `parseDefine` → `lookupStore`. **(Gate-2 M2)** capture a **monotonic `runId`** per lookup; abort the
  prior `AbortController` BEFORE incrementing runId / starting the new stream; after each `await` (chunk + terminal)
  check `isStale()` (store runId !== captured) and return without writing if stale. **(Gate-2 H3)** after the
  `streamOp` generator RETURNS, branch on the terminal outcome AND a final `parseDefine`: `error`/`cancelled` → map
  per rule 65; `done` but the final parse yields no usable word/meaning (or throws) → `lookupStore.status='error'`
  (`lookup.noDefinition`/`errorBody`). Own one `AbortController`.
- **NEW `src/components/lookup/ClickableText.tsx` (+ test)** — tokenizing renderer. **(Gate-2 M3 — binding)**
  words are interactive (`<span role="button" tabIndex={0}>`, click + Enter/Space) **ONLY when the host pane's
  `op.status==='done'`**; while `'streaming'` they are plain non-interactive text (eliminates stale-offset clicks
  as the streamed text grows). `dir="auto"` + `unicode-bidi:plaintext`; on activate emits `{word, sentence, offset,
  sourceLang, targetLang}`; highlights the active word (accent-subtle chip + underline) while open.
- **NEW `src/components/lookup/WordLookupPopover.tsx` (+ test)** — the designed popover. All 6 states; shadcn
  `Popover` (desktop/tablet) and `Sheet side="bottom"` (phone, via `useViewportTier()==='phone'`); RTL (`dir`,
  logical props, Arabic serif); `role="dialog"`+`aria-label`, focus-trap, Esc → return focus to the clicked word,
  play `aria-label` Speak↔Stop, `aria-live="polite"` meaning (settled, not per-token), visible focus ring. **Play
  button (Gate-2 H4):** subscribes to `speak.subscribe` and re-derives `hasVoiceFor` on `voiceschanged`; shows a
  transient disabled state while `!voicesReady`, the permanent no-voice state only once `voicesReady && !hasVoiceFor`.
  **(Gate-2 M4)** a cleanup effect calls `speak.cancel()` on unmount AND on word change. `box-shadow: var(--shadow-menu)`.
- **`src/components/translate/TranslateResult.tsx`** — render the result text via `<ClickableText>` (keep the
  streaming caret; words clickable only at `op.status==='done'`); open the popover on activate.
- **`src/components/polish/PolishResult.tsx`** — Result view via `<ClickableText>` (Compare/diff view unchanged).
- **`src/index.css`** — add `lucid-speak-ring`/`lucid-eq-bars`/`lucid-skel` keyframes ONLY (reuse `lucid-pulse`/
  `lucid-caret`; do NOT touch `lucid-ring`).
- **`src/locales/en/translation.json`** — `lookup.*` keys (speak/stop/close/lookingUp/speaking/translation/
  inThisSentence/context/noVoice/noDefinition/errorBody/retry/providers/senses/senseInContext/sense/dialogLabel/
  tapHint/dragHandle).
- **shadcn:** `Popover` (`pnpm dlx shadcn@latest add popover` if absent); `Sheet` already present (#16).

### Files OUT of scope (v1)
- Editable `OriginalCard`/`DraftCard` word-click → **follow-up #169** (needs a text-overlay).
- Compare/diff-view clicking (not depicted). Provider TTS (browser SpeechSynthesis only; follow-up). Local/offline
  dictionary (model produces the lookup; a dictionary API is a possible follow-up).

## Work-item sequencing (7 WIs — Gate-2 split WI-6)
- **WI-1 (foundational · patch)** — `DefineRequest` + `validateRequest` restructure (define-before-text, unknown
  targetLang rejected) + `buildPrompt` exhaustive switch + `buildDefinePrompt` + `PROMPT_VERSION`.
- **WI-2 (foundational · patch)** — `segment.ts` (tokenize + sentenceAt).
- **WI-3 (foundational · patch)** — `parseDefine.ts` (partial-tolerant; keys on model output only).
- **WI-4 (foundational · patch)** — `speak.ts` (voiceschanged subscription + `voicesReady` + cancel + jsdom guard).
- **WI-5 (foundational · patch)** — `lookupStore` + `useWordLookup` (runId stale-guard + done-unparseable→error).
- **WI-6 (behavioral · patch)** — `ClickableText` + render swap into `TranslateResult` + `PolishResult` Result view
  + active-word highlight + clickable-only-at-`done`. (depends WI-2.) Slice-verify the click→activate event.
- **WI-7 (behavioral · FINAL · minor)** — `WordLookupPopover` (6 states, RTL, dark, popover↔sheet, focus/a11y,
  speak wiring incl. cancel-on-unmount + voice-race) + keyframes + i18n; opened on WI-6's activate event. (depends
  WI-3/WI-5.) Full acceptance pass.

WI-1..5 are headless → unit-tested, no browser verify. WI-6/WI-7 are the designed UI → Gate-5 CDP verify. Foundational
WIs may batch under one Gate-4 audit (rule 47 table); WI-6 and WI-7 each get their own.

## Test catalogue
- **prompts** — `buildDefinePrompt`: returns-JSON instruction present; `{word,sentence}` as DATA in the user slot,
  curated target-lang label in system; **injection** (a `sentence` with "ignore previous instructions" / JSON-breaking
  braces stays a quoted user-slot value, never in system); **validation** (empty `word` → `validation` ProviderError;
  oversized `sentence` rejected; **unknown `targetLang` rejected**; a well-formed define request does NOT throw on a
  missing `text` field); `buildPrompt` exhaustiveness (a define request never reaches `buildPolishPrompt`'s `req.goal`).
- **segment.test** — tokenize + sentenceAt across EN, CJK (no spaces), Arabic/Hebrew (RTL), emoji, mixed-script,
  punctuation-adjacent/hyphenated; clicked-offset → correct sentence.
- **parseDefine.test** — partial JSON yields word+ipa early; complete JSON fills all fields; malformed/empty final →
  error sentinel; senses array; a `sentence` containing JSON metacharacters does NOT confuse the parser. **Fixtures
  use synthetic placeholder values; assert PRESENCE/SHAPE (`expect.any(String)`, `length>0`), never an exact IPA/word.**
- **speak.test** — injected fake `synth`: speak sets `.lang` + picks a matching voice; re-speak cancels prior;
  `hasVoiceFor` true/false; **`hasVoiceFor` flips false→true after a simulated `voiceschanged`** (+ `voicesReady`);
  no-voice (empty getVoices) path; `cancel()` no-throw when `speechSynthesis` undefined (jsdom); state transitions
  (idle→speaking→idle, onerror→idle).
- **lookupStore.test** — every status transition (idle→streaming→done→error), partial-fill of translations/senses,
  error reset, runId (gated 100%).
- **useWordLookup.test** — mock the provider: streamed chunks accumulate + parse; **abort on dismiss/new word** (start
  word A, click word B mid-stream → A's controller.abort() called before B's stream begins, no A-chunk lands after B
  starts — the runId guard); **done outcome + unparseable final JSON → error state**; **done + empty string → error
  state**; error/cancelled outcome mapped per rule 65.
- **ClickableText.test** — words become `role=button` spans ONLY at `op.status==='done'` (plain text while
  `'streaming'`); click + Enter activate → emits `{word,sentence,offset,sourceLang,targetLang}`; non-word text plain;
  active-word highlight; CJK/RTL fixtures.
- **WordLookupPopover.test** — by ARIA role/name: each of the 6 states renders its distinct affordances; play calls
  `speak.speak` / Stop calls `cancel`; **play re-enables after a voices-ready event**; no-voice (voicesReady &&
  !hasVoiceFor) disables play; **unmount while speaking calls `synth.cancel()`**; switching word while speaking cancels
  prior; error shows Retry/Providers; focus-trap + Esc-returns-focus; RTL `dir`; desktop popover vs phone sheet (mock
  `useViewportTier`).
- **Integration** (`TranslateResult`/`PolishResult`) — words NOT `role=button` while `status==='streaming'`, BECOME
  `role=button` at `'done'`; clicking a word opens the popover with that word; Compare view has no clickable words.
- **No-regression** — existing TranslateResult/PolishResult tests green (text still renders; streaming caret intact);
  the feature-#11 auto-run countdown ring (`lucid-ring`) untouched.

## Risks + mitigations
- **Unparseable-but-done (Gate-2 H3)** — useWordLookup explicitly maps a `done` outcome with no usable parse → error.
- **Voice-load race (Gate-2 H4)** — speak.subscribe + `voicesReady`; popover re-derives `hasVoiceFor`; transient vs
  permanent no-voice distinguished.
- **New-word-mid-stream race (Gate-2 M2)** — monotonic runId stale-guard + abort-prior-before-increment.
- **Stale-offset clicks (Gate-2 M3)** — words clickable only at `op.status==='done'`.
- **Audio outliving the popover (Gate-2 M4)** — `speak.cancel()` cleanup on unmount/word-change (jsdom-guarded).
- **Keyframe collision (Gate-2 H1)** — unique `lucid-speak-ring`/`lucid-eq-bars`/`lucid-skel`; `lucid-ring` untouched.
- **validateRequest TypeError (Gate-2 H2)** — define branch before the shared `req.text` access; exhaustive switch.
- **Privacy** — word + sentence leave the device to the active provider (same posture as translate/polish; local/Ollama
  first-class; rule 65 §6).
- **Popover placement / phone** — Radix Popover flip/shift; phone bottom-sheet.

## Backward compat
Additive — a new request kind + new components + a render swap in two result panes (text still renders; word spans are
additive + clickable only at `done`). No change to translate/polish/sync/persistence or the feature-#11 ring. Desktop
behavior unchanged except words in the two result panes become clickable when settled.

## Audit fixes applied (Gate 2, round 1 → v2)
Independent 4-lens Workflow audit (0 Crit · 4 High · 8 Med · 9 Low). All Crit/High/Med addressed:
- **H1** keyframe `lucid-ring`/`lucid-pulse` collision → unique `lucid-speak-ring`/`lucid-eq-bars`/`lucid-skel`, reuse
  existing, don't touch `lucid-ring`. **H2** `validateRequest` would throw on define → define-before-text restructure +
  exhaustive `buildPrompt` switch. **H3** unparseable-but-done → explicit error mapping in useWordLookup. **H4** voice-load
  race → speak.subscribe + `voicesReady`, popover re-evals.
- **M1** `--shadow-c*` mapping shape-wrong → `box-shadow: var(--shadow-menu)`. **M2** mid-stream race → runId stale-guard.
  **M3** streaming clickability → pinned to `op.status==='done'` (binding). **M4** speak.cancel() on unmount/word-change
  (jsdom-guarded). **M5** WI-6 split → WI-6 (ClickableText) + WI-7 (popover, FINAL). **M6** 4-anchors-vs-2 → follow-up
  #169 filed + explicit acknowledgment + user ratification before WI-6/7.
- **Lows** target-language source corrected (direction/tgtCode threaded at click time, not activeTarget); lookupStore
  justification; exhaustive switch; injection + unknown-targetLang tests; determinism (synthetic fixtures, shape asserts);
  dropped the line-count nit.

## Revision history
- v1 (2026-06-26) — initial draft from the committed design + distilled spec.
- v2 (2026-06-26) — Gate-2 round-1 fixes (4 High + 8 Med + 9 Low) + round-2 advisories. **Gate-2 PASSED
  round 2: READY TO BUILD, 0 open Crit/High/Med.** (Process precondition: the M6 2-of-4-anchors scope must be
  user-ratified before WI-6/7; headless WI-1..5 are anchor-agnostic and unblocked.)
