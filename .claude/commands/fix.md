---
description: Fix issues properly - no patches, no shortcuts, no regressions
argument-hint: "[issue description or error message]"
---

# Fix

## Context

```text
$ARGUMENTS
```

## Fixing Philosophy

**No half measures.** Every fix must be complete and correct.

### Principles

1. **Understand before fixing** — Read the code, trace the flow, identify root cause
2. **Fix the cause, not the symptom** — No band-aids, no workarounds, no "good enough"
3. **Rewrite if necessary** — Bad code deserves replacement, not patching
4. **Test-first** — Write a failing test that captures the bug, then fix, then verify green (see `.claude/rules/10-tdd.md`)
5. **Zero regressions** — Run `pnpm check:all` before declaring done
6. **Clean as you go** — If you touch it, leave it better than you found it

### Anti-patterns to Avoid

- Adding flags to bypass broken logic
- Wrapping bad code in try-catch to silence errors
- Commenting out problematic code
- Adding TODO for "later"
- Special-casing edge cases without fixing core issue
- Copy-pasting fixes across similar code

## Process

### 1. Reproduce

- Read the relevant source files. Trace the call chain from symptom to root cause.
- If the issue involves UI behavior, reproduce it in the browser (`pnpm dev`) or capture it with a failing Vitest/Playwright test.

### 2. Diagnose

- Find the **root cause**, not just where it crashes.
- Check if similar patterns exist elsewhere — the same bug may lurk in related code.

### 3. Test First (RED)

- Write a failing test that captures the bug.
- Follow the pattern catalog in `.claude/rules/10-tdd.md`:
  - Provider-layer bug → test the provider interface against a mocked fetch/stream (no real vendor SDK)
  - Translation/polish pipeline bug → table-driven `it.each` over input → expected diff, covering the broken case
  - Zustand store bug → store test with `getState()` asserting state transitions
  - React hook bug → `renderHook` with mocked dependencies
- Exception: CSS-only or visual bugs don't need unit tests — use visual QA instead.

### 4. Fix Properly (GREEN)

- Address the root cause. Rewrite if the existing code is fundamentally flawed.
- Keep the diff minimal and focused — don't refactor unrelated code.
- Follow project conventions:
  - Use `@/` imports for cross-module, relative for same-module
  - Use design tokens, never hardcoded colors (`.claude/rules/31-design-tokens.md`)
  - No Zustand store destructuring in components
  - Keep files under ~300 lines

### 5. Refactor

- Clean up without changing behavior. Tests must still pass.
- Remove dead code. Update comments if they're now stale.

### 6. Verify

- Run `pnpm check:all` — lint, coverage thresholds, and build must all pass.
- If user-facing behavior changed, verify it in the browser (`pnpm dev`) or with a Playwright E2E test.
- If user-facing behavior changed, update docs as needed.

### When to Rewrite vs Patch

**Rewrite when:**
- The existing code is fundamentally flawed
- Patching would add complexity
- The fix requires understanding fragile logic
- Similar bugs have occurred in this code before

**Patch only when:**
- The code is sound but has a small oversight
- The fix is isolated and obvious
- Rewriting would introduce unnecessary risk
