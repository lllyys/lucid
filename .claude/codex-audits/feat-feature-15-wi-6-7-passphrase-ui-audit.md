---
branch: feat/feature-15-wi-6-7-passphrase-ui
threadId: independent-claude-auditor
rounds: 4
final_verdict: ship-as-is
date: 2026-06-20
---

# Gate-4 audit — feature #15 WI-6 + WI-7 (E2E-encrypted config sync: passphrase/unlock UI + controller)

Independent separate-context Claude auditors (Codex quota-blocked; rule 48). The #15-completing batch built on
one branch (design bundle + WI-7 controller + the codec extension + WI-6 UI) and merges coherently. WI-1–5
(crypto/codec/server/configSync) shipped earlier; this batch is the controller orchestration + the rendering.

## Batch
- `c9aefd2` design bundle imported (`dev-docs/designs/lucid-passphrase-unlock/`) — the rule-51 unblock for #120.
- `74bd586` WI-7 headless config-sync controller (state machine + serialized sync over configSync).
- `73f42e5` codec extension — `SyncableConfig` now carries `customProviders` (incl. keys) + `activeCustomId`
  (v1→v2 migration), so the user's **custom DeepSeek key** actually syncs encrypted (the original gap — the
  pre-#10 codec only carried built-in `apiKeys`).
- `e28d9da` WI-7 Gate-4 fixes (save-path races).
- `f4913b1` WI-6 designed UI; `42c5e1c` WI-6 Gate-4 fixes (design fidelity).

## WI-7 controller + codec — security/crypto lens: PASS (0 Crit/High/Med)
Auditor traced every secret (built-in `apiKeys` + `customProviders[].key` + the passphrase + derived key):
**no secret reaches disk, a log, or the wire as anything but AES-GCM ciphertext.** `partializeProvider` strips
keys from localStorage; the controller persists only the non-secret `syncedRev`; no `console.*` of secrets;
every PUT routes through `encryptAndSave` (ciphertext only). Crypto correct: fresh salt+IV per encrypt, full-
header AAD binding, validate-before-use decrypt (wrong passphrase → mapped error, store untouched), secure-
context guard with no plaintext fallback. Untrusted-decrypted-blob defenses (prototype-pollution, ≤50 cap,
type-confusion) present + tested. No key escrow / no recovery (rule 65 §6). 3 Lows (cosmetic) noted/accepted.

## WI-7 controller — correctness/merge lens: 2 High + 1 Medium → FIXED → round-2 CLEAN
- **H1** concurrent debounced saves on a stale `baseRev` → **fixed**: a serialized save loop (`saveInFlight`);
  re-reads `baseRev` only after the prior save settles; terminates on success/409/failure.
- **H2** a successful save cleared `dirty` unconditionally, masking an edit made during the await → **fixed**:
  an `editSeq` counter; `dirty` cleared only if no edit arrived since the snapshot; the loop re-saves otherwise.
- **M3** save-time errors flipped to the blocking `error` with no resume → **fixed**: a NEW non-blocking
  `syncError` channel (save failures keep `status:'unlocked'`, drive the Section-E banner); blocking `error`
  reserved for init/unlock; new `retrySync()` re-attempts the save (not a re-probe); a `saveFailed` latch +
  fresh-edit/`retrySync` recovery. Round-2 re-audit confirmed all three correct, no new race, security intact.
  (Accepted Low: the controller is 466 lines — cohesive security/serialization unit, much of it load-bearing
  doc comments; splitting just-cleared concurrency code risks regression. Follow-up candidate.)

## WI-6 UI — design + integration lens: 1 Medium + 3 Low → FIXED
Controller integration correct (one controller via useMemo, init/dispose lifecycle, status routing, the
`error` [blocking card] vs `syncError` [non-blocking banner] channels NOT swapped, selectors not destructured,
key hygiene PASS — passphrase only in local React state, never logged/persisted by the UI). Rule-51: sections
A–E match the bundle; emoji glyphs (vs CSS-shape lock) accepted (existing-component consistency); the Section-E
banner mounted inline-above-workspace is the correct rule-51 call (no built "Settings·Sync" surface to host it).
**Fixed:** M1 the `wrongPassphraseOrCorrupt` banner now uses the design's "Re-enter" label (the dead
`wrongPassphraseAction` key is wired) + a test pins the per-state labels; L2 added the "Open the HTTPS URL"
button the design depicts; L3 rendered the "no /config blob on server" footnote (was a dead key). L4
(leaf-card-via-gate testing) accepted.

## Verdict: ship-as-is — all Critical/High/Medium resolved across all lenses
`pnpm check:all` green at every step; final: lint + typecheck + 100% gated coverage (src/lib + src/stores) +
build; 1402 tests. Gate-5: real-server browser E2E (set→encrypt→PUT→reload→unlock) — see
`dev-docs/verification/feature-15-20260620.md`. The server stores only ciphertext (verified live).
