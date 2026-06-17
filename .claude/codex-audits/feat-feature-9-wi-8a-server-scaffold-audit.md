---
branch: feat/feature-9-wi-8a-server-scaffold
threadId: manual-fallback
rounds: 1
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-8a (server package scaffold + root-gate exclusion)

Foundational scaffold for WI-8 (the self-hosted sync server). Creates a separate `server/` workspace
package (Hono + node:sqlite, node-environment vitest) and EXCLUDES it from the root hermetic gate so the
browser-app `pnpm check:all` stays green without server runtime deps or server tests. **No sync logic** —
the SQLite store (8b), Hono routes + bearer auth (8c), and deploy/TLS doc (8d) are later slices.

## Auditor note (rule-47 manual fallback)

Codex's usage quota is exhausted (until ~Jun 18 11:38). This slice is **config + a placeholder + a smoke
test — zero logic** to cross-model-review; the only substantive risk is "does the gate-exclusion keep the
hermetic root gate intact?", which is verified empirically below. So this round is a manual evidence-based
audit (rule 47's allowed fallback when the Codex auditor is unavailable). The logic-bearing slices (8b/8c)
will use the independent Claude `auditor` subagent.

## Implementation note

The scaffold was produced by a fresh-context general-purpose subagent (context-hygiene; my main context
was large after WI-7b). Per rule 48 its output was advisory until reviewed — the orchestrator reviewed the
full diff, tightened the server tsconfig (`noUncheckedIndexedAccess: true`, justified below), and re-ran
both gates independently.

## Manual audit evidence

**Files reviewed (diff):**
- `pnpm-workspace.yaml` — `packages: [server]` added, `allowBuilds` preserved. ✓
- `eslint.config.js` — `'server/**'` added to the top-level `ignores` (root `eslint .` skips the server). ✓
- `vite.config.ts` — `test.include: ['src/**/*.{test,spec}.{ts,tsx}']` added (root `vitest run` discovers
  ONLY `src/` tests; coverage.* untouched, already src-scoped). ✓
- `server/package.json` — private `@lucid/server`, `type: module`, `engines.node >=22` (node:sqlite),
  `hono ^4.12.25`, dev deps match the root (vitest 4 / typescript 5.7 / @types/node 22). ✓
- `server/tsconfig.json` — standalone strict (nodenext, es2023, `types:[node]`, `strict`,
  **`noUncheckedIndexedAccess` added by the orchestrator** — a server parses untrusted request bodies +
  SQLite rows, so unchecked indexed access is a real hazard; the 8b/8c slices inherit the safer baseline). ✓
- `server/vitest.config.ts` — `environment: 'node'` (NOT jsdom). ✓
- `server/src/index.ts` / `index.test.ts` — placeholder `SERVER_NAME` + smoke test; `./index.js` import is
  the canonical nodenext form. ✓

**Dependency vetting (rule 60 §4) — Hono PASS:** `hono@4.12.25`; created 2021-12-14 (~4.5y old ≫ 30-day
slopsquat threshold); **45.6M downloads/week** (≫ 1000/week floor); official repo `github.com/honojs/hono`,
maintainer `yusukebe`. No hallucination/slopsquat risk. `node:sqlite` is a Node ≥22 built-in (no dep).

**Gates verified independently (re-run by the orchestrator, not just the subagent's report):**
- Root `pnpm check:all` → PASS; **68 test files / 917 tests** (UNCHANGED — proves the server smoke test is
  excluded from the hermetic gate, not 69/918); 100% stmts/branches/funcs/lines; build green.
- `cd server && pnpm test` → PASS (1/1, node env). `cd server && pnpm typecheck` → PASS.

**Edge cases checked:** the root gate does not run server tests (verified by the unchanged count); the root
`tsc -b` does not compile `server/` (it isn't in the root tsconfig references); eslint does not lint
`server/`; coverage stays src-scoped. **Risks accepted:** none open. **Tests:** server smoke test added;
the real store/route tests land with 8b/8c.

**Summary verdict: ship-as-is.** Config-only scaffold; both gates green; dependency vetted; zero logic.
