---
branch: feat/feature-169-wi4-pane-wiring
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-28
---

# Gate-4 audit — feature #169 WI-4 (FINAL: pane wiring + ⌕ toggle + long-press)

Independent Claude auditor (read-only, diff-scoped, 985-line diff). **ship-as-is, 0 open Critical/High/Medium.**

## Decisive checks — PASS
- **Caret stays sacred (not regressed)** — each pane wraps `<textarea>` + `<EditableLookupOverlay>` in a
  `relative` div; the mirror root stays `pointer-events:none`; disarmed spans are plain `<span>` (no handlers,
  `aria-hidden`) so every click/touch falls through to the textarea. The merged `onChange` calls
  `lookup.onTextInput()` then the original; `value`/composition/`onKeyDown` preserved → fully editable.
  Long-press handlers live only in the `if (armed)` branch.
- **Per-pane langs / Draft inversion (M4)** — `PolishPanel` threads both: Original `lang=srcLang,
  targetLang=tgtLang` (src→tgt); Draft `lang=tgtLang, targetLang=srcLang` (inverted — the Draft word is in the
  target lang, defined back into source). translateSource = `directionLabels(detectDirection(text))`.
  `targetLang` always supplied; the DraftCard test asserts the inverted args.
- **Draft streaming gate (M3)** — `streaming: translating` → `armed=false` mid-stream; the toggle is also
  `disabled` while translating; a never-translated draft still arms.
- **Close-on-edit (M6) — no self-close** — `usePaneLookup` effect keys on `[text, owner]`, reads
  `getState()` (non-reactive), closes only when `open && owner===this owner`. A lookup opening doesn't change
  `text` → never self-closes; pane A's edit never closes pane B's lookup; mount is a no-op.
- **Design fidelity / no-regression** — `LookupToggle` per §B (off/on, disabled-when-empty §D, `aria-pressed`
  not `role=switch` to avoid the AutoRunToggle collision); long-press on armed spans + the ⌕ toggle as the
  §F touch entry is design-consistent. Auto-run, char-count/Clear, LanguagePicker, DraftCard streaming render
  all preserved. i18n `lookup.editable.*` present. No `any`; tokens not hex; files <300; no vendor import.

## Lows — accepted with rationale (none block)
1. **Latched mode doesn't auto-exit on a PLAIN edit keypress** (only Alt+key dispatches `editKey`); plain typing
   in latched stays latched + disarms via the §D 400 ms debounce. This is the **deliberate, WI-2-audited choice**
   (the WI-2 Gate-2 round-2 audit explicitly endorsed "stays latched + debounce" as the better UX, and the
   `editableLookupState` comment documents it). §B's "auto-exits on first edit keypress" is interpreted as the
   overlay disarming while typing (§D). Accepted — coherent + tested; re-toggling isn't required after each edit.
2. Latched + cleared field → toggle renders active+disabled until text returns (auto-recovers). Minor UX edge.
3. A fired long-press leaves `longPressFired=true`; a subsequent MOUSE click on the same span (no touchStart to
   reset) could be swallowed once — extremely narrow (touch-then-mouse); next touchStart resets. Accepted.
4. The translate-source ⌕ toggle sits in the source control footer (with AutoRunToggle/char-count/Clear) rather
   than a literal header — its natural home with the pane's other controls. Confirm visually in CDP.
5. 3 panes × window Alt listeners (the acknowledged WI-2 note) — correct given owner-gating. By design.

## Gate
`pnpm check:all`: lint + typecheck + **100% gated coverage** + build; **1779 tests**. FINAL behavioral WI →
full CDP acceptance over real textareas (mirror alignment + ⌥-click/toggle/long-press per pane + caret-sacred +
Draft streaming gate) is the Gate-5 acceptance pass recorded in the evidence file.

## Verdict
ship-as-is.
