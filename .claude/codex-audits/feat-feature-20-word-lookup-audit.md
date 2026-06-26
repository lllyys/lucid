---
branch: feat/feature-20-word-lookup
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-26
---

# Gate-4 audit — feature #20 (click-a-word dictionary popover, 7 WIs)

Independent Claude auditor (read-only, diff-scoped — the 3034-line diff vs main). Against the Gate-2-PASSED
plan v2. **ship-as-is, 0 open Critical/High/Medium.**

## Verified (every Gate-2 decision built correctly + tested)
- **H2 validateRequest** — `'define'` in the discriminant guard; the define branch runs BEFORE any `req.text`
  access; shared text checks inside translate/polish; `buildPrompt` is an exhaustive `switch` (no polish
  fallthrough). A valid `DefineRequest` returns undefined; empty word / oversized sentence / unknown
  target/source lang → `validation`. Tested incl. the no-`text`-field case.
- **H3 unparseable-but-done** — `lookupStore`, after the `done` outcome, re-parses `outcome.text` and maps
  `!usable` → `status:'error'` (`refusal`). Tests: done+unparseable, done+empty.
- **H5/runId (M2)** — `dropController()` aborts prior BEFORE `runId++`; `isStale()` after each `await` + before
  the terminal write. Word-A→word-B + terminal-stale + abort-signal tests pass meaningfully.
- **H10 injection/determinism** — `buildDefinePrompt` puts `{word,sentence}` as `JSON.stringify` DATA in the
  user slot; system = instruction + curated `resolveLanguage(targetLang)` (safe fallback). `parseDefine` keys
  only on the model's object. Tests assert SHAPE/PRESENCE (synthetic fixtures), never exact IPA; hostile
  sentence stays a quoted user value.
- **H1 keyframes** — only `lucid-speak-ring`/`lucid-eq-bars`/`lucid-skel` added; `lucid-ring` (feature #11)/
  `lucid-pulse`/`lucid-caret` untouched + reused.
- **H4 voice-race** — popover subscribes to `speech.subscribe`, re-derives `hasVoice`/`voicesReady`; `loading`
  while `!voicesReady`, `novoice` only once `voicesReady && !hasVoice`. Re-enable test passes.
- **M3 clickability** — `ClickableText` `role=button` only when `interactive` (host `op.status==='done'`); tested both panes.
- **M4 speak.cancel** — cleanup cancels on unmount + word-change; no-op when synth undefined (jsdom). Tested.
- **M1 shadow** — `[box-shadow:var(--shadow-menu)]`; no `--shadow-c*`. **Target lang** — threaded from
  `directionLabels(detectDirection(text))` at click time. **Scope** — wired into TranslateResult + PolishResult
  Result view ONLY; Compare view asserted to have no word buttons; editable textareas untouched.
- **useAutoRunDebounce guard** — `if (request.kind === 'define') return` is a correct union-narrowing guard
  before `request.text` (auto-run never schedules define).
- **a11y/lucid/no-regression** — dialog role+aria-label, focus-trap, aria-live meaning, Speak↔Stop, ClickableText
  role=button+Enter/Space+aria-current, visible focus; no `any`/hex; files <300 (popover ~195, LookupCard ~280);
  panel tests updated for tokenized words without weakening (bug-#96 still meaningful); streaming caret intact.
- **Coverage** — gated dirs (`src/lib/lookup`, `src/lib/speech`, `src/stores/lookupStore`, `src/providers`,
  `src/lib/prompts`) at 100% (1607 tests).

## Findings (all Low)
- **FIXED in this commit:** the error-state **"Providers…"** button was `onProviders={close}` (dismiss only) —
  the design's error-recovery affordance promised navigation it didn't perform. Wired to `openSettings()` (the
  existing window-event bridge #16's footer Details uses) → close + open Settings; added a test (clicking
  Providers fires `lucid:open-settings` + dismisses).
- **Accepted (Low):** the `PlayButton` `hidden` kind is unreachable (error state returns early) — harmless
  defensive dead code. The hand-rolled `parseDefine` `repair()` is the riskiest surface but is well-tested
  (behavioral assertions). The multi-sense `aria-live` could announce mid-stream — minor; single-meaning path
  fine. None blocking; tracked as nice-to-have.

## Gate
`pnpm check:all`: lint + typecheck + 100% gated coverage + build green. Gate-5: CDP acceptance — see
`dev-docs/verification/feature-20-20260626.md`.

## Verdict
ship-as-is.
