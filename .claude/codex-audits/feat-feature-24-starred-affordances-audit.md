---
branch: feat/feature-24-starred-affordances
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-29
---

# Gate-4 audit — feature #24 WI-1 (FINAL: starred-detail Open-in-workspace + IPA play)

Independent Claude auditor (read-only, diff-scoped, 561-line diff). **ship-as-is, 0 open Critical/High/Medium.**

## Verified (all Gate-2-closed decisions built correctly)
- **Reset path (H1) + ref-to-latest (r2 M)** — `handlerRef.current = onSourceChange` each render; the mount-time
  `onLoadSource((text) => handlerRef.current(text))` reads the LATEST handler → the load goes through
  `onSourceChange` (`setSource` + `setAcceptedText(null)` + `reset('translate')` + fresh `auto.armed` re-arm), so
  a stale `done` result is cleared and no stale auto-translate fires. Proven by the armed-after-mount→schedules /
  disarmed→does-not tests + the removeEventListener-on-unmount test.
- **Deferred focus (M1)** — `loadNonce` bump + `[loadNonce, sourceRef]` effect (guards nonce===0) → `rAF(() =>
  sourceRef.current?.focus())` (no null-deref), cleanup cancels the rAF. `sourceRef = lookup.textareaRef` (stable).
  Focus runs after the phone pane unhides.
- **Workspace chrome (H2)** — a SECOND `onLoadSource` listener: `setDrawerOpen(false)` + `setActivePane('translate')`
  (stable setters, no stale closure), cleanup on unmount. Decoupled from the text listener; React batches both →
  `activePane` unhides before the deferred-focus rAF. No ordering hazard.
- **Speak (StarredView)** — word-only; reuses `createSpeech()` (memo + subscribe tick + `speak(source,sourceLang)`);
  #20 play/stop/disabled mapping (a `done` item has no streaming/error); always-rendered-but-disabled for novoice
  (not hidden); **`return () => speech.cancel()` on unmount** covers both ‹ All starred + Unstar. Open-in-workspace
  (both kinds) → `loadSourceIntoWorkspace(item.source)`.
- **`loadSource.ts`** — mirrors `openSettings.ts` (event + dispatch + `onLoadSource` subscribe-with-cleanup); the
  `CustomEvent<{text}>` cast in the gated lib; 100% covered (dispatch/receive/unsubscribe/empty-string). No `any`.
- **No-regression / lucid** — additive listeners; existing TranslatePanel/Workspace/StarredView behavior intact
  (no button-count assertions broken); i18n `starred.speak`/`openInWorkspace` present; tokens not hex; <300 lines;
  no vendor import. Rule 51 satisfied (the bundle depicts both affordances).

## Nice-to-haves (accepted)
1. `SpeakButton` re-inlines the `createSpeech` lifecycle that also lives in `LookupCardHost` — the Gate-2 L2
   noted this + accepted inline for a 1-WI feature; a shared `useSpeak(text,lang)` hook could dedupe later.
2. A load mid-stream `reset`s but doesn't `abort` the in-flight request — identical to the pre-existing
   user-edit path (`onSourceChange` never aborts on keystroke); in-scope-by-design, not introduced by #24.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1823 tests**. FINAL behavioral WI →
CDP slice-verify (seed a starred item → Open-in-workspace loads the source into translate + clears the result +
[phone] switches pane; Speak fires) is the Gate-5 acceptance recorded in the evidence file.

## Verdict
ship-as-is.
