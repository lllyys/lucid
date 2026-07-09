# Feature #26 — Tighter editor resting height

**Status:** PLANNED
**GH:** #218 (feature) · #219 (design, landed) · relates #97 (#13)
**Design:** `dev-docs/designs/lucid-editor-resting-height/` (committed 2026-07-09, rule 51 satisfied)
**Size:** Small (1 WI, 1 PR)

## Problem

The three auto-expanding editors from feature #13 (translate **Source**, polish **Original**, polish
**Draft**) rest at an **88px inner minimum** (130px card for the two polish cards). A single line of text
then floats over ~33px of dead space, which the user flagged (issue #218). On phone the tall resting
minimum pushes the polish stack below the fold.

The committed design (issue #219) lowers the resting minimum to **56px inner** (one text line +
padding) while **keeping** the #13 grow-to-content model and the ~88vh cap. Empty and one-line editors
rest at the same height (no jump on first keystroke), and it grows one line at a time exactly as before.

> **Direction note.** The #26 tracker row had drifted toward a "fixed-height, no-grow" reading. The
> committed design (rule 51 authoritative) keeps grow-to-content and only tightens the resting minimum.
> Section B of the bundle is a growth ladder. This plan follows the design.

## Surface area (file-by-file)

**New — one shared source of truth (the design's explicit "one shared constant, do not fork" rule):**

- `src/lib/editor/editorSizing.ts` (NEW)
  - `export const EDITOR_FIELD_MIN_H = 'min-h-[56px]'` — textarea resting minimum (one 18px×1.7 line
    ≈31px + top/bottom padding). Empty & 1-line rest identical.
  - `export const EDITOR_CARD_MIN_H = 'min-h-[98px]'` — polish card minimum (header ≈42px + 56px field).
  - TSDoc header naming the design + that the value must not be forked per editor.
- `src/lib/editor/editorSizing.test.ts` (NEW) — locks the two constant values (design regression guard).

**Modified — wire the constants in (no other change to any of these classNames):**

- `src/components/translate/TranslatePanel.tsx:237` — source textarea: `min-h-[88px]` →
  `${EDITOR_FIELD_MIN_H}`. Everything else (`w-full`, `px-6 pb-6`, `text-[19px] leading-[1.75]`, the
  tier-scoped caps `max-[599px]:max-h-[50vh] min-[600px]:max-h-[88vh]`) unchanged. Translate Source is a
  flex `<section>` with **no** card minimum, so no card change here.
- `src/components/polish/OriginalCard.tsx:48` — card wrapper: `min-h-[130px]` → `${EDITOR_CARD_MIN_H}`.
  `:92` — textarea: `min-h-[88px]` → `${EDITOR_FIELD_MIN_H}` (keep `max-h-[88vh]`, `px-4 py-3`,
  `text-[18px] leading-[1.7]`).
- `src/components/polish/DraftCard.tsx:55` — card wrapper: `min-h-[130px]` → `${EDITOR_CARD_MIN_H}`.
  `:114` — textarea: `min-h-[88px]` → `${EDITOR_FIELD_MIN_H}`.

**Test updates:**

- `src/components/translate/TranslatePanel.test.tsx` — assert the source textarea carries `min-h-[56px]`
  and NOT `min-h-[88px]`; keep the existing tier-cap assertions.
- `src/components/polish/OriginalCard.test.tsx` — textarea `min-h-[56px]` (not `min-h-[88px]`); card
  `min-h-[98px]` (not `min-h-[130px]`).
- `src/components/polish/DraftCard.test.tsx` — same two assertions.

**Docs:**

- `docs/features.md` #26 row → `PLANNED` then `DONE`/`VERIFIED`; correct the stale "fixed-height" note.
- `dev-docs/verification/feature-26-20260709.md` — Gate-5 evidence file.

### Files OUT of scope

- Result panes (`TranslateResult`, `PolishResult`), Keywords card, any non-editor surface — the change
  is the three editable textareas only.
- The `max-h-*` caps, header, padding, typography, `field-sizing-content`, `dir`/RTL handling — all
  untouched (design non-goals).
- `src/components/ui/textarea.tsx` (the shadcn primitive, `min-h-16`) — not used by these three editors'
  sizing; not touched.
- Phone-specific minimum — the design says "same rule": one constant at all tiers, no phone fork.

## Prior art / precedent / rejected alternatives

- **Prior art:** feature #13 (`dev-docs/designs/lucid-auto-expanding-editors/`) introduced
  `field-sizing-content min-h-[88px] max-h-[88vh]`. This bundle supersedes only #13's resting-height
  values. #16/#17 added the translate tier-scoped cap (`max-[599px]:max-h-[50vh]`) — preserved verbatim.
- **Precedent:** design-gated CSS re-skin of an already-designed surface to a new committed spec (rule 51
  "existing-surface … to its committed spec"). Same shape as feature #23's token-level polish changes.
- **Rejected — hardcode `min-h-[56px]` in three classNames.** Violates the design's explicit "one shared
  constant — do not fork per editor". Chosen: one `src/lib/editor` module imported by all three.
- **Rejected — a phone-specific resting min.** The design says "same rule"; editor font is constant
  across tiers in these classNames, so 56px applies everywhere. Adding a phone fork contradicts the
  bundle.
- **Rejected — put the constant in one feature folder** (e.g. `src/components/polish/`). It's shared by
  translate + polish; a feature-local home would force a cross-feature import (AGENTS.md forbids). A
  neutral `src/lib/editor/` is the "truly shared" home.

## Work-item sequencing

Single WI (Small feature), behavioral (visible resting-height change → browser-verified):

- **WI-1** — shared sizing constants + wire into the three editors + tests. ~1 small PR.

## Test catalogue

- `src/lib/editor/editorSizing.test.ts` — `EDITOR_FIELD_MIN_H === 'min-h-[56px]'`,
  `EDITOR_CARD_MIN_H === 'min-h-[98px]'` (locks design values; an intentional design change updates the
  test deliberately).
- `TranslatePanel.test.tsx` — source textarea className contains `min-h-[56px]`, not `min-h-[88px]`.
- `OriginalCard.test.tsx` / `DraftCard.test.tsx` — textarea `min-h-[56px]` (not `88px`); card
  `min-h-[98px]` (not `130px`).
- Existing suite (1867 tests) stays green; 100% gated coverage held (the new module is a trivial constant
  export, fully covered by its test).

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Tailwind JIT doesn't emit `min-h-[56px]`/`min-h-[98px]` when the literal moves from `.tsx` into a `.ts` constant | Tailwind v4 scans `.ts` source as text; the literal lives in the constant module **and** the test files. Verify the production build (`pnpm check:all`) succeeds and grep the built CSS for the rule during Gate-5. |
| Descender clipping at the tighter 56px | 56px = ~31px line + ~25px padding; one 18/19px line fits with descenders (design: "no clipped descenders"). CDP screenshot at Gate-5 confirms. |
| Regressing the #16 tier-scoped translate cap | Only the `min-h-*` token changes; the `max-[599px]:max-h-[50vh] min-[600px]:max-h-[88vh]` fragment is preserved verbatim and re-asserted by the existing test. |

## Backward compat

Pure visual min-height reduction — no data, API, persistence, or i18n change. No migration. Existing
content simply rests tighter; grow/cap behavior is byte-for-byte the same above one line.

## Definition of Done (Gate 5)

- All three editors rest at 56px inner for empty/one-line content (was 88px); polish cards at 98px —
  assert **computed** `getComputedStyle(el).minHeight` on the three textareas + two polish wrappers, not
  only a screenshot (Gate-2 Dim-2 L2).
- Grep the **built CSS** for the emitted `min-height:56px` / `min-height:98px` rules after
  `pnpm build`/`check:all`, to prove Tailwind's content scan picked the classes up from the `.ts`
  constant (Gate-2 Dim-5 M1 / Top-Risk 1).
- Grows one line at a time and still caps at ~88vh (translate) / 50vh phone — unchanged.
- Light + dark + RTL + phone render per the bundle; no clipped descenders; no horizontal overflow.
- `pnpm check:all` green; evidence file at `dev-docs/verification/feature-26-20260709.md`.

## Gate-2 audit fixes applied

Codex (gpt-5.5, high, read-only) — **verdict READY TO BUILD**, 0 Critical/High. Resolutions:

- **M (docs drift, Top-Risk 2):** the feature #13 row in `docs/features.md` still documents the editors
  as `min-h-[88px]`. At integration, add a "resting height superseded by #26 (v…)" note to the #13 row
  so docs don't contradict the shipped state. (Integrator doc-delta.)
- **M (Gate-5 rigor):** verify computed `min-height` + grep built CSS — folded into DoD above.
- **L:** RED before GREEN (write the failing class assertions first); use a template-literal className
  (`className={`… ${EDITOR_FIELD_MIN_H} …`}`), never a dynamically-built `min-h-[${n}px]`; import via
  `@/lib/editor/editorSizing`. All folded into the WI brief.

## Revision history

- v1 (2026-07-09) — initial plan.
- Gate-2 audit (2026-07-09, Codex gpt-5.5/high, thread in `.claude` job log) — **READY TO BUILD**,
  0 Crit/High, 2 Med + 4 Low/Info all resolved above.
