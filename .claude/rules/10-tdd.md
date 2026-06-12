# 10 - TDD Workflow

Test-Driven Development is structurally enforced in lucid. Coverage thresholds in `vitest.config.ts` make `pnpm check:all` fail if coverage drops — writing code without tests breaks the gate.

## Core Discipline: RED → GREEN → REFACTOR

1. **RED** — Write a failing test that describes the expected behavior.
2. **GREEN** — Write the minimum code to make the test pass.
3. **REFACTOR** — Clean up without changing behavior. Tests must still pass.

Never skip RED. If you write code first, you don't know your test actually catches regressions.

## When Tests Are Required

| Category | Required? | Examples |
|----------|-----------|---------|
| Stores | **ALWAYS** | State transitions, selectors, persistence |
| Hooks | **ALWAYS** | Side effects, event handling, lifecycle |
| Utils / helpers | **ALWAYS** | Pure functions, parsers, formatters |
| Providers (LLM layer) | **ALWAYS** | Request mapping, streaming, error paths |
| Business logic | **ALWAYS** | Translation/polish decisions, diff/merge rules |
| Bug fixes | **ALWAYS** | Regression test proving the fix |
| Edge cases | **ALWAYS** | Empty input, null, boundary values |
| CSS-only changes | No | Visual QA with reference doc instead |
| Docs / config | No | Markdown, JSON changes |
| Type-only changes | No | Interface/type additions with no runtime effect |
| Components | Case-by-case | Test behavior (clicks, ARIA), not rendering |

## Pattern Catalog

Five patterns covering the most common test types in lucid. Use these as templates.

### 1. Store Tests — `src/stores/__tests__/sessionStore.test.ts`

```ts
import { useSessionStore } from "../sessionStore";

beforeEach(() => {
  // Reset store between tests — isolation is critical
  useSessionStore.setState({ sessions: {} });
});

it("tracks a translation session", () => {
  const { addSession } = useSessionStore.getState();
  addSession("session-1", "source text");
  const session = useSessionStore.getState().sessions["session-1"];
  expect(session).toBeDefined();
});
```

**Key patterns:**
- Use `getState()` to call actions — no React rendering needed.
- Reset state in `beforeEach` to isolate tests.
- Test state transitions, not implementation details.

### 2. Provider Tests — `src/providers/__tests__/anthropicProvider.test.ts`

```ts
import { createAnthropicProvider } from "../anthropicProvider";

it("maps a translate request and yields streamed chunks", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(streamFromChunks(["Hola", " mundo"]))
  );
  const provider = createAnthropicProvider({ fetch: fetchMock, apiKey: "test" });

  const chunks: string[] = [];
  for await (const chunk of provider.stream({ text: "Hello world", target: "es" })) {
    chunks.push(chunk);
  }

  expect(chunks.join("")).toBe("Hola mundo");
  expect(fetchMock).toHaveBeenCalledOnce();
});
```

**Key patterns:**
- Mock the network boundary (`fetch`), never the vendor SDK or your own logic.
- Assert against the shared provider interface, not vendor-specific shapes.
- Cover streaming, request mapping, and error/abort paths.

### 3. Hook Tests — `src/hooks/useStreamingResult.test.tsx`

```tsx
import { renderHook, act } from "@testing-library/react";
import { useStreamingResult } from "./useStreamingResult";

it("accumulates streamed chunks into result text", async () => {
  const { result } = renderHook(() => useStreamingResult());
  await act(async () => {
    await result.current.start(asyncChunks(["Hola", " mundo"]));
  });
  expect(result.current.text).toBe("Hola mundo");
});
```

**Key patterns:**
- Mock external dependencies (provider layer, browser APIs).
- Use `renderHook` — no need for a full component.
- Test that effects register/cleanup correctly.

### 4. Component Tests — `src/components/DiffView/DiffView.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

it("accepts a change on button click", async () => {
  const user = userEvent.setup();
  const onAccept = vi.fn();
  render(<DiffView original="cat" result="dog" onAccept={onAccept} />);
  const acceptBtn = screen.getByRole("button", { name: /accept/i });
  await user.click(acceptBtn);
  expect(onAccept).toHaveBeenCalledOnce();
});
```

**Key patterns:**
- Query by ARIA role/name — not CSS class or test-id.
- Use `userEvent` (not `fireEvent`) for realistic interaction.
- Test behavior (click → state change), not rendering details.
- Use `vi.hoisted()` when mock setup needs to run before imports.

### 5. Utils Tests — `src/lib/translation/decideTarget.test.ts`

```ts
import { decideTarget } from "./decideTarget";

describe("decideTarget", () => {
  it.each([
    { detected: "en", requested: "es", expected: "es" },
    { detected: "es", requested: "es", expected: "noop" },
    { detected: "en", requested: "auto", expected: "prompt" },
    { detected: "",   requested: "es", expected: "es" },
  ])("detected=$detected, requested=$requested → $expected", ({ detected, requested, expected }) => {
    expect(decideTarget(detected, requested)).toBe(expected);
  });
});
```

**Key patterns:**
- Table-driven tests with `it.each` — exhaustive, readable.
- Pure functions = no mocking needed.
- Cover all branches in one `describe` block.

## Anti-Patterns — What NOT to Do

| Anti-pattern | Why it's wrong | Do this instead |
|-------------|----------------|-----------------|
| Write code first, tests after | You can't verify your test catches regressions | RED first — always |
| `it("renders without crashing")` | Tests nothing meaningful | Test specific behavior or output |
| Testing implementation details | Breaks on refactor | Test observable behavior (state, output, DOM) |
| Mocking everything | Tests prove nothing | Mock boundaries (APIs, filesystem), not logic |
| Skipping edge cases | Bugs live at boundaries | Empty input, null, max values, concurrent access |
| Snapshot tests for logic | Brittle, auto-updated without review | Use explicit assertions |
| `any` in test types | Hides type errors | Use proper types even in tests |

## Coverage Check

Coverage is tracked but not enforced via hard thresholds in CI. Run manually:

**To check:** `pnpm test:coverage` — review the report for gaps.

## Test Utilities

| File | Purpose |
|------|---------|
| `src/test/setup.ts` | Global test setup (jsdom, mocks for browser/fetch APIs) |
| `src/test/providerTestUtils.ts` | Helpers for stubbing provider streams and responses |

## Running Tests

```bash
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode during development
pnpm test:coverage     # Run with coverage + threshold check
pnpm check:all         # Full gate (lint + coverage + build)
```

## File Placement

- Tests go next to the source: `foo.test.ts` beside `foo.ts`
- Larger test suites use `__tests__/` subdirectory
- Shared test helpers go in `src/test/`
