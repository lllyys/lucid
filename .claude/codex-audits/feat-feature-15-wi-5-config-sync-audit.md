---
branch: feat/feature-15-wi-5-config-sync
threadId: independent-claude-auditor
rounds: 1
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — feature #15 WI-5 (client configSync)

Independent separate-context Claude `auditor` (read-only, verified against the real WI-3 server + the
crypto/codec/backend modules); Codex quota-blocked (rule 48 via subagent). Security-relevant — handles
the passphrase + decrypts the API key.

## Diff: `src/lib/config/configSync.ts` (+ test) — `loadAndDecrypt` / `encryptAndSave` (409-conflict
decrypt) / `readSyncedRev` / `writeSyncedRev`, injectable fetch + storage + timeout.

## Verdict: ship-as-is — 0 Critical / 0 High / 0 Medium (5 Low, actionable ones fixed)

Auditor-verified CLEAN on the security-critical surface:
- **§5 key/passphrase hygiene**: no logging; passphrase never persisted (only passed to encrypt/decrypt);
  only the ciphertext blob on the wire (test asserts the key isn't in the PUT body); decrypted config only
  returned to the caller; `lucid.config-rev` holds only a number. No leak path.
- **Untrusted-blob cast** (`as unknown as EncryptedBlob` → `decryptConfig`): fails closed — any
  malformed/tampered blob → a mapped `wrongPassphraseOrCorrupt`/`requestFailed`, never worse.
- **load/save/409 correctness**: matches the SHIPPED server contract (GET `{blob|null, rev}`, PUT `200
  {status:applied,rev}` | `409 {status:conflict,rev,blob}`); the 409 path re-pulls + re-decrypts the
  authoritative blob (doesn't blind-trust). **Error mapping** sound + fail-closed.
- **M1 placement**: `syncedRev` fully self-contained in `lucid.config-rev` — zero providerStore reference,
  no #12 partialize ripple. No `any`, mirrors the backend's injectable-fetch/`BackendResult` pattern, no
  new deps, <300 lines.

## Low findings
| # | finding | resolution |
|---|---|---|
| 1 | No request timeout (rule 65 §4 — a hung `/config` spins forever; the sync backend bounds with AbortController). | **FIXED** — added a `send()` helper with an AbortController deadline (`timeoutMs`, default 15s) spanning fetch + body read; abort → `unreachable`; fake-timer test added. |
| 2 | `rev` validated with `typeof !== 'number'` (accepts NaN/Infinity/negative) instead of the shared `isNonNegInt`. | **FIXED** — `isNonNegInt(body.rev)` at all 3 sites (+ `readSyncedRev`). |
| 3 | Plan WI-3/WI-7 prose said PUT returns `204`; the shipped server + client use `200 {status:applied,rev}`. | **FIXED** — plan prose corrected (rule 20). |
| 4 | Untested edges: empty-but-valid config round-trip; concurrency (safe by construction — no shared mutable state). | deferred to WI-7 (informational; coverage already 100%). |
| 5 | Comment named `configUnreachable`/`configRequestFailed` while the kinds are `unreachable`/`requestFailed`; the localized `error.*` strings are a WI-6 (design-gated) obligation. | **FIXED** — comment reconciled (kinds → which `error.*` key); locale strings flagged for WI-6. |

`pnpm check:all` green (lint + typecheck + 100% gated coverage + build).
