# Manual Testing Guide

Open the comprehensive testing guide and help the user test lucid features.

## Instructions

1. Read the testing guide at `dev-docs/testing/comprehensive-testing-guide.md` (create the directory if it does not yet exist)
2. Present a summary of test categories to the user
3. If the user specifies a category, show those specific tests
4. Help track test results if requested

## Test Categories

1. **Translation Fidelity** - Accuracy of translated output across target languages
2. **Format / Markdown Preservation** - Headings, lists, code blocks, links, and whitespace survive translation and polish
3. **Polish Diff & Accept Flow** - Clarity/tone/grammar polish, diff rendering, accept/reject of individual changes
4. **Provider-Switch Flows** - Swapping Anthropic / OpenAI / Gemini / Ollama through the one provider interface; settings persistence
5. **Streaming + Abort** - Live streamed output, partial-chunk rendering, cancel mid-stream with no leaked streams
6. **API-Key & Error States** - Missing/invalid key, rate-limit, network failure, provider error surfaced clearly; keys never leaked
7. **App i18n** - UI strings localize correctly; language switch updates the whole UI
8. **CJK / RTL Handling** - Chinese/Japanese/Korean text and right-to-left scripts (Arabic/Hebrew) render and diff correctly

## Quick Start

Ask the user which category they want to test, then:
1. Show the relevant test cases from the guide
2. Help them execute tests if the app is running (`pnpm dev`, or a Playwright E2E run)
3. Record results

## Files

- Main guide: `dev-docs/testing/comprehensive-testing-guide.md`
- Provider-switch details: `dev-docs/testing/provider-switch-testing.md`
- Streaming/abort details: `dev-docs/testing/streaming-abort-testing.md`
- Polish diff details: `dev-docs/testing/polish-diff-testing.md`
