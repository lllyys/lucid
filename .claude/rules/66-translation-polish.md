# 66 - Translation & Polish Domain

The domain rules for lucid's two core flows: **translation** (text → target
language) and **writing polish** (clarity/tone/grammar). These are enforceable
MUST/NEVER constraints, not guidance. The provider layer that backs both flows —
and how it is mocked in tests — lives in `65-llm-provider-integration.md`; this rule
governs the behavior layered on top of it.

## 1. Structure preservation

Translating or polishing transforms the *words*, never the *shape* of the text.

- Source formatting MUST survive a round-trip: Markdown syntax, line breaks,
  ordered/unordered lists, code blocks (fenced and indented), inline code, URLs,
  and placeholders (e.g. `{name}`, `%s`, `{{count}}`) come out structurally
  intact.
- Code blocks and inline code MUST be treated as opaque — their contents are
  never translated, polished, or reflowed. The same applies to URLs and
  placeholder tokens.
- A transform MUST NOT silently drop, merge, or reorder paragraphs, list items,
  or headings. Count and order are preserved unless the user explicitly asked
  for a restructuring goal.
- Every structure-preservation guarantee above MUST have a test in
  `src/lib/translation/**` or `src/lib/polish/**` that asserts the structural
  invariant on a representative fixture (Markdown doc with lists, code, links,
  and placeholders). Add a regression test before fixing any structure-loss bug.

## 2. Diff and accept/reject

The diff view is the product, not a presentational nicety.

- Polish results MUST be presented as a diff against the original, with explicit
  per-change (or whole-result) **accept** and **reject** controls. A polish flow
  that only shows the rewritten text is incomplete.
- Accept MUST commit only the accepted changes to the working text; reject MUST
  leave the original untouched. Partial accept (accept some changes, reject
  others) is the expected behavior, not a stretch goal.
- The diff/merge logic lives under `src/lib/polish/**` and MUST be unit-tested as
  business logic: given original + result, assert the computed diff and the
  post-accept / post-reject text. This is tested independently of any rendering.
- NEVER treat the diff view as optional chrome that can be stubbed out to "ship
  faster" — it is a TDD-gated path (see `10-tdd.md`).

## 3. Language handling

lucid is multilingual by definition; the easy-path (Latin, LTR, space-delimited)
is never the only path.

- Source-language **auto-detection** MUST be supported, and the detection result
  MUST be surfaced to the user and overridable. A wrong silent guess is a bug.
- **CJK** text (Chinese, Japanese, Korean) MUST be handled without assuming
  inter-word spaces — word/segment logic, length checks, and truncation MUST NOT
  rely on whitespace as a word boundary.
- **RTL** scripts (Arabic, Hebrew) MUST be correct in *both* logic and layout:
  set `dir="rtl"` / logical CSS properties on the relevant surfaces, and never
  hardcode left/right assumptions in diff rendering or caret handling.
- **Mixed-script** text (e.g. English embedded in Arabic, code inside CJK prose)
  MUST render and diff correctly without corrupting bidi ordering or splitting
  grapheme clusters.
- Each of the above MUST have at least one fixture-backed test (CJK sample, RTL
  sample, mixed-script sample) under the translation/polish libs.

## 4. Determinism in tests

Tests assert on *behavior*, never on what a model happened to say.

- Unit and integration tests MUST mock the provider layer per `65-llm-provider-integration.md`;
  `pnpm check:all` NEVER hits a live LLM API.
- Assertions MUST target observable behavior — structure preserved, abort
  honored, error mapped to a localized message, diff computed, accept/reject
  applied — and NEVER the exact wording of model output.
- NEVER write a snapshot test over model-generated prose; it is non-deterministic
  and will be rubber-stamped on update. Assert the invariant instead.

## 5. App internationalization

lucid is a translation tool, so its own UI MUST be localizable — dogfood the
product.

- All user-facing UI strings MUST go through `t()`. NEVER hardcode a display
  string in a component.
- Keys are **flat, dot-separated camelCase** (e.g. `toolbar.translate`,
  `error.rateLimited`). NEVER use nested objects or kebab/snake keys.
- New strings MUST be added to `src/locales/en/*.json` in the same change that
  introduces them; a string referenced by `t()` with no key is a defect.
- Error and status text shown to the user is localized too — raw provider errors
  or stack traces are NEVER surfaced (see `65-llm-provider-integration.md` for error
  mapping).

## 6. Em-dash spacing

- English UI copy and docs MUST put a space on each side of an em-dash:
  `word — word`, never `word—word`. Apply this in `src/locales/en/*.json` copy
  and in Markdown docs.
