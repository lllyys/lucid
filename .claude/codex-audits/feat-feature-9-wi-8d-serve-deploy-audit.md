---
branch: feat/feature-9-wi-8d-serve-deploy
threadId: independent-claude-auditor (Codex quota-blocked until ~Jun 18 11:38)
rounds: 2
final_verdict: ship-as-is
date: 2026-06-18
---

# Gate-4 audit — feature #9 WI-8d (sync server serve entry + deploy layer)

The final WI of the self-hosted server (WI-8). Adds the serve entry + env config + a request-body cap
+ the deploy artifacts on top of the merged store (WI-8b) and HTTP layer (WI-8c). Files:
NEW `server/src/index.ts` (`createServerConfig(env)` pure parser + integration-only `main()` serving via
`@hono/node-server`), `server/src/index.test.ts` (createServerConfig suite), `server/tsconfig.build.json`,
`server/Dockerfile`, `server/.dockerignore`, `dev-docs/sync-server.md`; MODIFIED `server/src/app.ts`
(added `maxBodyBytes?` + `hono/body-limit` → 413), `server/src/app.test.ts` (4 body-limit tests),
`server/package.json` (`@hono/node-server` dep, `build`/`start` scripts, `engines.node >=24`,
`packageManager` pin), `dev-docs/README.md` (links the deploy doc), `pnpm-lock.yaml`.

## Auditor note (rule-47 fallback)

Codex quota exhausted (until ~Jun 18 11:38). Both rounds used a fresh independent read-only Claude
`auditor` subagent (separate context from the implementer — rule-48 boundary). The implementation was
drafted by a fresh-context subagent and reviewed + gate-verified + fixed by the orchestrator (rule 48).

## Round 1 — NEEDS WORK (1 High; 4 Low)

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | High | `server/Dockerfile` ran `corepack enable` + `pnpm install`, but only `server/package.json` is in the `./server` build context and it had NO `packageManager` field — so corepack could not deterministically resolve a pnpm version (errors under strict corepack / hangs on the download prompt in a non-interactive build). The image was not reproducibly buildable as written (the implementer's live build only succeeded because its local corepack auto-downloaded). | **FIXED** — `server/package.json` now pins `"packageManager": "pnpm@11.0.8"` (matches the repo-root pin); both Dockerfile stages run `corepack enable && corepack prepare pnpm@11.0.8 --activate`, which downloads + activates the exact version non-interactively (no prompt → no hang). Verified consistent across root, server manifest, and both stages. |
| L1 | Low | the `build` script emitted `index.test.js`/`app.test.js` into `dist/` (test code shipped in the release artifact). | **FIXED** — new `server/tsconfig.build.json` extends `tsconfig.json` with `noEmit:false`/`outDir:dist`/`declaration:false` + `"exclude": ["src/**/*.test.ts"]`; `build` is now `tsc -p tsconfig.build.json`. Verified `dist/` emits only `app.js`, `db.js`, `index.js`, `types.js`. `typecheck` still uses `tsconfig.json` (tests type-checked). |
| L2 | Low | the Dockerfile comment + `dev-docs/sync-server.md` said "Verified: a `require('node:sqlite')` round-trip succeeds…", implying a Phase-0 spike artifact (rule 60 §7) that isn't linked. | **FIXED** — both reworded to state node:sqlite is stable/flag-free from Node 24.0.0 (documented fact; experimental behind `--experimental-sqlite` in 22.x), dropping the unverifiable "Verified … round-trip" claim (rule 20 doc-accuracy). |
| L3 | Low | `MAX_BODY_BYTES` whitespace asymmetry — PORT/DB_PATH tested both `''` and `'   '`, MAX_BODY_BYTES tested only `''`. | **FIXED** — `index.test.ts` now also asserts `MAX_BODY_BYTES: '   '` falls back to the default (symmetric with PORT/DB_PATH). |
| L4 | Low | runtime `pnpm install --prod --no-frozen-lockfile` re-resolves deps without a lockfile (a future hono/@hono/node-server patch can silently enter the image). | **ACCEPTED with rationale** — the repo lockfile is a *workspace* lockfile (covers all packages), so `--frozen-lockfile` against the single-package `./server` build context cannot be satisfied; the clean alternative (a second, server-only lockfile) adds maintenance for a single-tenant self-hosted box. Deps remain pinned in the root lockfile for dev/CI; latest-compatible patches on a one-human box are a defensible trade-off. Round-2 auditor concurred the acceptance is sound. |

Round-1 affirmed CORRECT: `createServerConfig` (SYNC_TOKEN required + preserved verbatim, PORT 1–65535 /
MAX_BODY_BYTES strict-positive bounds with `^\d+$`-before-`Number()`, DB_PATH durable default never
`:memory:`); secret hygiene (single startup log prints only port + dbPath; no token in any log/throw/500
body); `bodyLimit` first on POST → 413 before parse/store, defaults consistent (5 MiB) across app.ts +
index.ts + doc; the `realpath` + `pathToFileURL` entry guard (runs `main()` only when executed directly,
never on test import; symlink-safe for `/tmp → /private/tmp` and the Docker `CMD`); two-stage Docker
structure; lucid compliance (no `any`, files < 300 lines, no `src/**`↔`server/**` cross-imports).

## Round 2 — verdict: CLEAN

> "The round-1 High (Dockerfile pnpm non-reproducibility) is resolved … `corepack prepare <pkg>@<version>
> --activate` downloads and activates the exact named version non-interactively … a non-interactive
> `docker build` cannot hang. … all four Lows are resolved or soundly accepted, and the fixes introduced
> no regression. There are zero open Critical/High/Medium findings. Verdict: CLEAN."

Regression sweep confirmed: no secret logged, `createServerConfig` behavior unchanged, `bodyLimit` still
first → 413, no `any`, files < 300 lines, no cross-imports, `sync-server.md` still matches the code.

`cd server && pnpm test` → 82 passed (3 files); `pnpm typecheck` → green; `pnpm build` → emits only
production files. Root `pnpm check:all` unaffected (server excluded): 68 files / 917 tests / 100%.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium; round-2 zero findings. This completes
WI-8 (the entire self-hosted server). Remaining for feature #9: WI-9 (the sync UI + wiring
`createSyncController`) + final acceptance.
