---
description: Open lucid's manual testing guide and walk the user through its test categories (translation fidelity, format preservation, polish diff, provider switching, streaming/abort, error states, app i18n, CJK/RTL), helping run cases and track results. Use when manually verifying a feature or before a release.
argument-hint: "[category]"
---

# Manual Testing Guide

Open the comprehensive testing guide and help the user test lucid's features, optionally scoped
to a single category named in `$ARGUMENTS`.

## Instructions

1. Read the testing guide at `dev-docs/testing/comprehensive-testing-guide.md`. **If it does not
   exist yet**, create the `dev-docs/testing/` directory and scaffold the guide from the Test
   Categories below, then tell the user it was created.
2. If `$ARGUMENTS` names a category, jump straight to that category's cases; otherwise present the
   category list and ask which to test.
3. For the chosen category, show its test cases with expected results.
4. Help the user run the cases (`pnpm dev`, or a Playwright E2E run) and record pass/fail.

## Test Categories

1. **Translation Fidelity** — Accuracy of translated output across target languages
2. **Format / Markdown Preservation** — Headings, lists, code blocks, links, and whitespace survive translation and polish
3. **Polish Diff & Accept Flow** — Clarity/tone/grammar polish, diff rendering, accept/reject of individual changes
4. **Provider-Switch Flows** — Swapping Anthropic / OpenAI / Gemini / Ollama through the one provider interface; settings persistence
5. **Streaming + Abort** — Live streamed output, partial-chunk rendering, cancel mid-stream with no leaked streams
6. **API-Key & Error States** — Missing/invalid key, rate-limit, network failure, provider error surfaced clearly; keys never leaked
7. **App i18n** — UI strings localize correctly; language switch updates the whole UI
8. **CJK / RTL Handling** — Chinese/Japanese/Korean text and right-to-left scripts (Arabic/Hebrew) render and diff correctly

## Output

Produce, in the chat:

- The selected category (or the full category list, if none was given) with each test case and
  its expected result.
- A running **results table** (`Category | Case | Result | Notes`), updated as the user reports
  outcomes.
- A closing summary: counts of pass / fail / blocked, plus any case that needs a follow-up bug
  (suggest `/file-bug`).

This command only reads the guide, drives manual testing, and records results — it does not edit
application code.

## Files

- Main guide: `dev-docs/testing/comprehensive-testing-guide.md`
- Provider-switch details: `dev-docs/testing/provider-switch-testing.md`
- Streaming/abort details: `dev-docs/testing/streaming-abort-testing.md`
- Polish diff details: `dev-docs/testing/polish-diff-testing.md`
