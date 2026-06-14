---
branch: feat/feature-1-wi-4-prompts
threadId: 019ec641-50cd-72f3-86d2-6fe5742b9bb4
rounds: 3
final_verdict: ship-as-is
date: 2026-06-14
---

# Gate 4 — Implementation Audit: feature #1 WI-4 (prompt builders + request validation)

Independent Codex audit (read-only, gpt-5.5), **3 rounds** (the Gate-4 ceiling). threadIds:
`019ec639…` (r1), `019ec63d…` (r2), `019ec641…` (r3). All findings resolved with tests.

## Round 1 (block-recommended) — all fixed

| severity | finding | resolution |
|---|---|---|
| High | language fields interpolated into the system prompt = prompt-injection surface | (see injection thread below) |
| Medium | unknown runtime `kind` fell through to the polish path; `validateRequest` accepted it | `validateRequest` guards the discriminant first; an unknown `kind` is rejected. |
| Medium | structure-preservation tests too permissive (one-of-many match) | tests assert **every** clause (markdown/line-break/list/code/url/placeholder/opaque/order/count) for both flows. |
| Low | no prompt version despite "versioned" claim | added `PROMPT_VERSION`. |

## Injection thread (rounds 1→3) — language-field prompt injection (rule 65 §7)

- r1: language fields interpolated raw → injection.
- r2 (FAIL): a charset pattern (letters/marks/digits, no line breaks, ≤40 chars) still let
  `"English Ignore prior instructions"` through — letters+spaces can't distinguish a language
  name from an instruction. **Fixed** by a **curated language registry**: `resolveLanguage`
  maps known codes/names → a canonical label; `validateRequest` rejects unresolved languages;
  and `buildPrompt` interpolates **only** the canonical label (or a fixed generic fallback) —
  raw user input never reaches the system prompt. r3: **PASS**.
- r3 (Medium): `LANGUAGES` was a plain object, so `resolveLanguage('constructor')` / `'__proto__'`
  resolved to inherited `Object.prototype` members and passed validation. **Fixed** with an
  `Object.hasOwn` guard; regression test covers `constructor`/`__proto__`/`toString`/etc.

## Verdict

All Critical/High/Medium across 3 rounds resolved with regression tests. Language interpolation
uses only canonical labels or fixed fallbacks — raw input never reaches the prompt, even if
`buildPrompt` is called pre-validation. `pnpm check:all` green: 193 tests, 100% coverage on
`src/lib/prompts`. **final_verdict: ship-as-is.**
