# 51 — UI/UX from a committed design bundle only

Binding rule for every agent (Claude, Codex, others). Applies to every feature, bug fix, refactor, and verification slice that introduces a new visible UI element.

## Hard rule

**Do not invent UI/UX.** If a feature, bug fix, or slice needs a UI element on a surface that is NOT depicted in a committed design bundle under `dev-docs/designs/...`, stop that slice and file a `needs-design` GitHub issue. The user manually carries it through `claude.ai/design`, re-handoffs a fresh bundle, and only then does the slice resume.

This applies to:

- New shadcn/ui overlay surfaces — `Dialog`, `AlertDialog`, `Sheet` / `Drawer`, `Popover`, `DropdownMenu`, `Tooltip`, `Toast` / Sonner.
- The translate/polish editor pane (source-text input) and the diff / result / accept-reject pane — the per-hunk accept/reject toggles are core (rule 66 §2), not decoration.
- The toolbar and any new toolbar buttons, icons, or indicators.
- The language picker (target-language chooser), polish-goal chooser, provider switcher, and provider / settings / API-key config surfaces.
- New rows, sections, settings entries, buttons, indicators, or empty states within existing screens.
- New visual states (loading, error, empty, partial-stream / incomplete, streaming / in-progress, cancelled / aborted) when not depicted in the design. The localized error surfaces from rules 65/66 (rate-limited, provider-down, invalid-key banners) are visible UI states and count here.
- "Placeholder" UI introduced with intent to re-skin later — same prohibition. A raw, unstyled shadcn default `Dialog` / `Toast` dropped in "for now" is self-designed UI.
- UI affordances introduced by a bug fix (e.g., a new confirmation dialog, a new status chip, a new partial-stream indicator, a new error banner style) — same prohibition.

## What "designed" means

A surface is **designed** when ALL of the following hold:

1. A committed design bundle exists at `dev-docs/designs/<bundle>/` (this tree does not exist yet — the first committed bundle will be its first occupant).
2. The specific surface (screen, overlay, interaction state) is depicted in that bundle's HTML/JSX/screenshots — by name and by visual content.
3. "Looks similar to existing X" does NOT count. "Inherits the same chrome" does NOT count. The actual surface must appear in the design.

If you cannot point at a file in `dev-docs/designs/` that shows the surface you are about to build, it is **not designed**.

> `dev-docs/design-system.md` (the intended cross-surface token/pattern spec, referenced by rule 30 — neither file exists yet) is NOT the authority for "is this surface designed?" — that authority is, and only is, the per-surface bundle under `dev-docs/designs/`.

## Workflow

When you reach a slice that would touch undesigned UI:

> **Filing the `needs-design` issue is a proactive, automatic workflow step — never a question.** Do NOT
> ask the user "should I file a design issue?" or wait for permission. The moment a design-gated surface is
> identified (a Gate-1 plan, a triage, or a deferred follow-up), file the `needs-design` issue, link it from
> the parent, and report that you filed it. The precedent pairs: feature #164 ↔ design #166 (the #20
> click-a-word popover); feature #169 ↔ design #173 (the editable-pane word-lookup overlay). Asking first is
> the lapse this rule corrects — rule 51 already mandates the issue, so file it as a matter of course.

1. **Stop that slice.** Do not write the component. Do not write a placeholder. Do not improvise.
2. **File a GitHub issue** — file it first, before any tracker edit, so the row stamp and the issue land together (the `check_gh_issue_mirror.sh` PreToolUse hook blocks a row change that lacks a GH ref):
   - Title: `Design needed: <surface> for feature #<N>` (or `for bug #<N>`). This is intentionally descriptive and does NOT follow lucid's `Feature #N:` / `Bug #N:` mirror-title convention — a needs-design issue is its own design request, not a mirror of a tracker row.
   - Labels: `enhancement` + `needs-design`. (`needs-design` is not yet in the repo label set — create it in the GH repo before `gh issue create`, or the label is silently dropped.)
   - Body must include:
     - The surface being requested (overlay / pane / state).
     - The parent feature or bug, linked with `Refs #<N>` (never `Fixes #<N>` — that auto-closes the parent). `Refs #<N>` is the issue-body link convention; it is distinct from the tracker-row stamp `GH: #<N>`, which the mirror hook reads — the two are not interchangeable.
     - The user-facing behavior the UI must expose.
     - Screenshots of the current chrome if any.
     - The list of states the design must cover (default, loading, error, empty, partial-stream, streaming, cancelled, etc.).
3. **Pause that slice** in the tracker — add a `BLOCKED: needs-design (#<new-issue>)` note inside the Notes cell of the `docs/features.md` WI row or the `docs/bugs.md` bug row (before the trailing pipe, one space separator). Do not invent a new tracker status; the annotation lives in Notes.
4. **Continue parallel slices** that DO have design — see `.claude/rules/48-parallel-execution.md`. A `needs-design`-blocked slice maps to rule 48's dependency-block model: it is blocked on its design issue while disjoint, non-dependent sibling slices proceed.
5. **User loop**: the user manually takes the `needs-design` issue through `claude.ai/design`, gets a handoff bundle, and commits it under `dev-docs/designs/...` in a separate PR. The slice can then resume.

## Relationship to other rules

This rule governs **whether** a surface, layout, or visual state may be created at all. Rules 30, 32–34 govern **how** an already-designed surface is styled. They do not contradict; they compose:

- **30-ui-consistency** / **32-component-patterns** / **33-focus-indicators** / **34-dark-theme** (and **31-design-tokens**, when added) — apply once a surface is designed: tokens first, shadcn primitives, visible focus, dark-theme parity. They never authorize inventing a new surface. Rule 30's "prefer incremental adjustments over redesigns unless requested" allows a sanctioned redesign, but a sanctioned request still routes through this rule's design loop before any surface is built.
- **66-translation-polish §2** and **65-llm-provider-integration §4** — the diff/result pane and every error / partial-stream / empty / streaming state are simultaneously TDD-gated behavior paths AND visible UI surfaces. These rules are not blocked by this one: their **logic** obligations (the diff/merge engine under `src/lib/polish/**`, the error mapping under `src/providers/**`) are built and TDD-tested first as headless logic, with no design dependency. This rule gates only the **rendering layer** — the visible diff pane and each visual state need a committed design bundle before that headless logic is wired to a surface. **Satisfying the TDD gate does NOT satisfy the design gate**, and the design gate does NOT excuse the 66 §2 / 65 §4 logic from being built and tested.
- **47-feature-workflow** — see the explicit hook below.

## Hook into the feature workflow (rule 47)

- **Gate 1 (Plan).** A behavioral WI that introduces UI MUST point at a designed surface — name the `dev-docs/designs/<bundle>/` artifact that depicts it. A UI surface is always a behavioral WI (it changes app behavior), never foundational, so it can never skip this.
- **Gate 3 (TDD impl).** A WI that hits undesigned UI means the Gate-1 plan misclassified it. Stop the WI, file `needs-design`, and fix the Gate-1 plan (or escalate to the user). Do not push the gap to Gate 5 verification — the block belongs before Gate 3, not deferred to it.
- **Bug workflow** (`docs/bugs.md` `## Rules`, the canonical Understand → RED → GREEN → REFACTOR → Verify → Track sequence in rule 47). The design gate sits in front of GREEN whenever the fix introduces new visible chrome.

## What is NOT covered by this rule

- **Browser / system chrome** — native (un-restyled) scrollbars, default form-control rendering (default checkbox/radio/select), the browser's own UI, the OS focus ring before override. These are not lucid's design surface. (A *restyled* scrollbar via `::-webkit-scrollbar` per rule 32 IS a designed surface governed by rule 32 — only the untouched browser default is exempt here.)
- **Pure code changes with no visible delta** — refactors, persistence-only fixes, performance fixes, type-only changes, test-only changes.
- **Existing-surface bug fixes that restore an already-designed surface to its committed spec** — fixing a typo in a label, un-hiding a button the design shows, correcting a design-token regression.
- **CSS-token-only changes that re-skin an already-designed surface to its spec** — a token swap on a surface already in a bundle is not a new surface.
- **Verification-only / dev-only artifacts** — Playwright test helpers, `dev-docs/verification/*.md` evidence files, anything never shipped to users.
- **CLI / config / hook / script files** — `.claude/hooks/**`, `scripts/**`, Vite/Vitest config — never user-facing.

## Anti-patterns

| Anti-pattern | Why it fails | Right move |
|---|---|---|
| "I'll match the existing chrome for now" | That is self-designed UI. "Inherits the same chrome" does not make a surface designed. | File `needs-design`. |
| "Just a placeholder until v2" | Placeholders are committed code that ships in releases. Fragmenting the UI for 2-3 versions is worse than pausing. | File `needs-design`. |
| "It's a small dialog, a raw shadcn default works fine" | An unstyled shadcn default looks fine in isolation but clashes with the design system over time. | File `needs-design`. |
| Inventing UI for a bug-fix toast / status chip / error banner / partial-stream indicator | Bug fixes don't escape this rule — they introduce UI debt the same way features do. | File `needs-design`. |
| Assuming the diff/accept-reject pane is "done" because its tests pass | TDD gate ≠ design gate. The visible pane and each state still need a bundle (rule 66 §2). | File `needs-design`. |
| Inventing UI in a Gate-3 implementation because the WI list said "small change" | Gate 3 must reference a designed surface; if no design exists for a WI's UI, that WI was misclassified in Gate 1. | Stop the WI, file `needs-design`, fix the Gate-1 plan. |

## Origin

2026-06-14 user directive that lucid adopt the same one-way design loop already in force on the sibling project vreader; this rule is adapted from vreader's `51-no-self-designed-ui.md` and recast from its iOS/SwiftUI surfaces to lucid's React 19 + Tailwind v4 + shadcn/ui surfaces. The loop is:

```
design tool → handoff bundle → commit → implement
```

and it explicitly rejects the round-trip:

```
agent invents UI → ships → user notices → user redesigns → re-implement
```

The cost of pausing a slice to file `needs-design` is far below the cost of producing UI debt that has to be re-skinned later. This rule encodes that trade-off.

lucid is greenfield: `dev-docs/designs/` and `dev-docs/design-system.md` do not exist yet, and no `src/components/` tree exists. The surface list above is therefore forward-looking — this rule lands before the first component PR, which is the ideal time (there is no self-designed UI to grandfather in). Seed `dev-docs/designs/` with the core surfaces (editor pane; diff/result + accept-reject; toolbar; language/goal pickers; provider/settings; and the loading/error/empty/partial-stream/streaming/cancelled states) before the first UI WI, or all UI work is immediately blocked — which is the intended behavior, not a bug.