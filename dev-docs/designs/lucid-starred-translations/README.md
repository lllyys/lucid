# Lucid Star & Starred Review — design bundle (feature #22)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-29 to unblock the
design-gated UI of feature #22 (GH #181) — star word/sentence translations + the review surface. Resolves
needs-design #183.

`project/...dc.html` is the committed depiction; this README distills the implementable spec. The headless
`starredStore` + the `'starred'` #9 sync entity already shipped (v0.17.2, WI-1/WI-2); this bundle covers the
two UI WIs.

## Section A — The star control (WI-3): one toggle, two scales
A **30px star icon button**. States: **not-starred** (outline star, label "Star") ⇄ **starred** (filled accent
star, label "Starred"). Clicking a starred control **unstars**. Token-driven; visible focus.

## Section B — In place (WI-3)
- **Word** — the star sits in the **#20 lookup-popover header, beside play / close** (`LookupCard` header). It
  saves the **word** (+ IPA, in-context meaning, source/target langs) → `starredStore.star({ kind:'word', … })`.
- **Sentence** — a star on the **translate result + polish result pane toolbars** saves the **whole sentence
  pair** (source → result + direction) → `starredStore.star({ kind:'sentence', source, translation, sourceLang,
  targetLang })`.
- Both land in the **same Starred list, tagged by type**.

## Section C — The "Starred" tab (WI-4): list & per-item detail
- A **"★ Starred" sidebar tab** beside **Sessions / Glossary** (mirror that surface — #3/#18), with a count
  ("7 starred").
- **List** of starred items (word + sentence), each showing its content + a type tag.
- **Search** — matches **both halves** (source + translation).
- **Per-item detail** — word: translation / IPA / meaning; sentence: "中文 → EN" source → result + direction.
  A **‹ All starred** back affordance + an **Unstar** action.

## Section D — Empty & no-results
- **Empty** (first run / nothing starred): "Nothing starred yet" ("Empty is an invitation").
- **Search no-results**: "Nothing starred matches. Try another word, or clear the search." + a **Clear search**.

## Section E/F/G — themes / responsive / bidi
- **Light + dark** — same tokens (#2/#16). **Responsive** — phone **drawer** below 600px (reuses #16's pattern).
- **RTL & CJK** — mirrored under `dir`; CJK has no word spaces (the list/search must not assume whitespace).

## Status / scope
Headless (shipped v0.17.2): `starredStore` (`star`/`unstar`/`items`/`searchStarred`, uuid id + content-scan
dedupe + hard-delete) and the `'starred'` #9 sync entity (client + server). This bundle = the **rendering layer**:
WI-3 the star indicators (popover + result toolbars), WI-4 the Starred sidebar surface.

## Token mapping
`--ink`→`--text-color`, `--surface`→`--bg-color`, `--accent`→`--accent-primary`, `--accent-soft`/`-subtle`→the
accent-bg tokens, `--accent-ink`→accent glyph, `--shadow-c*`→`--shadow-*`. Reuse the #3 sidebar tab chrome +
the #20 popover-header button styling.

Refs #181 (feature #22), #183 (this design request); builds on #20 (popover) + #3 (sidebar).
