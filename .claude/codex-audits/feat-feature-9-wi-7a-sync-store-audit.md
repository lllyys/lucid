---
branch: feat/feature-9-wi-7a-sync-store
threadId: 019ecfac-f84d-7fb3-88ea-a5c274f604ff
rounds: 2
final_verdict: ship-as-is
date: 2026-06-17
---

# Gate-4 audit — feature #9 WI-7a (sync config/state store)

Codex (gpt-5.5, effort high, read-only), same thread as WI-1..6. Files: `src/stores/syncStore.ts` +
test. The first WI-7 slice: the Zustand store that the orchestrator (WI-7b) drives and the WI-9 UI
reads — config, the 8-state status machine (matches `dev-docs/designs/lucid-sync`), cursor, seeded
flag, counts, queuedCount, surfaced conflict. The async orchestrator (pull/merge/push, seed loop,
drain, listeners, cursors) is WI-7b.

## Round 1 — verdict: NEEDS ATTENTION (1 Medium + 1 Low)

| # | file:line | sev | finding | disposition |
|---|---|---|---|---|
| 1 | syncStore.ts `migrateSync` | Medium | accepted any current-version object wholesale → tampered persisted state (`cursor:'x'`, `config.token:null`, stray transient keys) could hydrate; safeJSONStorage validates JSON not shape | **FIXED** — sanitize + return ONLY validated durable fields: `config === null` or `{serverUrl:string, token:string}`, `cursor` non-negative safe integer, `seeded` boolean; else undefined → defaults |
| 2 | syncStore.ts `setCursor` | Low | accepts any number (a caller bug could store NaN/negative) | **ACCEPTED w/ rationale** — store setters trust internal callers (consistent with `setStatus`/`setCounts`, none validate); the orchestrator feeds `setCursor` a guarded `maxRev` (validated by `isPullResult`'s non-neg-safe-int check); the tampering boundary is `migrateSync` (now sanitized). Codex (round 2): "reasonable … guarding only `setCursor` while leaving the other internal setters trusting would be inconsistent without much practical gain." |

**Security (token persistence) — confirmed correct both rounds:** the access token is persisted (in
`config`) as a deliberate, documented exception to the in-memory-only rule for provider keys (rule 65
§5) — the committed design + plan require reload-surviving background sync to the user's own
single-tenant server over TLS. Codex: "clearly documented as an explicit design exception … no
logging/diagnostic leak … localStorage via safeJSONStorage is a defensible choice; no JS-readable
browser storage is meaningfully safer against XSS." Only `{config, cursor, seeded}` persist — never the
transient status/counts/conflict.

## Round 2 — verdict: CLEAN

> "The migration sanitization is correct … accepts valid `{config, cursor, seeded}`, rejects malformed
> config/cursor/seeded values, and returns only the durable top-level fields so transient persisted keys
> cannot hydrate into live state. The `setCursor` disposition is reasonable … Token persistence remains
> clearly documented as an explicit design exception, and I still see no logging/diagnostic leak. CLEAN."

Compliance: no `any`, file < ~300 lines, no vendor leak, token never logged. `pnpm check:all` green —
756 tests, 100% stmts/branches/funcs/lines.

**Summary verdict: ship-as-is.** Zero open Critical/High/Medium. The persisted-token exception is the
documented trust-boundary landing point (rule 65 §5); the server-side boundary is documented further
with WI-8.
