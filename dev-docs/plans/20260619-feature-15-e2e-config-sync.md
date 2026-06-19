# Feature #15 — Cross-device E2E-encrypted provider config + API key via the self-hosted server

- **Status:** PLANNED (Gate 2 re-audit pending on v2)
- **GH:** #111
- **Tracker row:** `docs/features.md` #15 (High)
- **Slug:** e2e-config-sync

## Problem

Open the app on any of the user's devices (reached over Tailscale) and work **without re-entering the
API key** and **without typing a sync URL/token** per device (2026-06-19). `localStorage` is per-device
(feature #12 persists the non-secret config there, never keys); the sync token is per-device. The only
architecture satisfying all three: config + key live on the **single self-hosted server** the user
reaches, **served at the same origin as the app**. To keep the key out of the server (and off any tailnet
peer), it is **end-to-end encrypted client-side** — the server stores only **ciphertext**; a device
decrypts with a **passphrase**. Product owner confirmed E2E + the HTTPS precondition below (2026-06-19).

## Secure-context requirement — HTTPS is MANDATORY (Gate-2 C1)

The Web Crypto API (`crypto.subtle`) **only exists in a secure context** (HTTPS or `localhost`); on a
plain-`http://` non-localhost origin (e.g. `http://100.127.102.42:5173`) it is `undefined`. The repo
already documents this for `crypto.randomUUID` (`src/lib/uuid.ts`). Therefore **E2E sync requires the app
to be served over HTTPS** — there is no dependency-free non-secure-context path.

- **Deploy:** the self-hosted server is exposed over HTTPS via **`tailscale serve`** (one-time,
  persists across reboots) or `tailscale cert` / a reverse proxy. The user opens
  `https://<machine>.<tailnet>.ts.net`.
- **Runtime guard (WI-1):** all crypto entry points first check `globalThis.crypto?.subtle` — its
  PRESENCE is the secure-context signal for Web Crypto (`crypto.subtle` is `undefined` on a plain-http
  non-localhost origin), which is the operational check `uuid.ts` already uses for `randomUUID`, and the
  sounder of the two (`isSecureContext` is unreliable across the Node/jsdom test runner and would
  spuriously trip there). If `subtle` is absent the entry points throw a typed `InsecureContextError`
  that the UI maps to a localized `error.insecureContext` (rule 65 §4) — never an uncaught `TypeError`.
- **Tests must prove the guard** (Node always exposes `crypto.subtle`, which would otherwise mask the
  production failure): a test stubs `crypto` without `subtle` and asserts the graceful localized failure.
- **Doc-sync (L4):** `dev-docs/sync-server.md` updated — HTTPS is mandatory for #15 (not advisory); add a
  source-of-truth doc for the config-sync + crypto, linked from `dev-docs/README.md`.

## Crypto design (Gate-2-confirmed sound core; C2/H1/H4 fixes applied — all native WebCrypto, NO deps)

- **KDF:** PBKDF2-HMAC-SHA256, **600,000 iterations** (OWASP 2026 / Bitwarden default). Argon2id needs a
  WASM dep → not used (rule 60); the `v` field versions the format so an Argon2id migration stays open.
- **Salt:** 16 random bytes (`crypto.getRandomValues`), stored with the blob (not secret).
- **Cipher:** AES-256-GCM, **fresh random 12-byte IV per encryption** (never reuse (IV,key)), 128-bit tag.
- **AAD (C2):** the GCM `additionalData` is the **canonical deterministic serialization of the ENTIRE
  header** — `v`, `kdf`, `iterations`, `salt`, `iv` — fixed field order + fixed encoding (a single
  defined byte string built the same way on encrypt and decrypt). Binding `v`+`kdf` (not just
  iterations/salt) closes the version/algorithm-downgrade vector. The implementation MUST build the AAD
  bytes deterministically (no JS-object key-order reliance).
- **Blob (versioned, base64):** `{ v:1, kdf:"PBKDF2-SHA256", iterations:600000, salt, iv, ciphertext }`.
- **Derived key `extractable:false`** — memory-only for the session; never stored.
- **Wrong-passphrase = the real-payload GCM decrypt throws** (tag mismatch) — the single source of truth.
  **No canary (H1):** a wrong passphrase and a corrupt blob are cryptographically indistinguishable, so a
  canary cannot separate them and adds a known-plaintext target — dropped. The decrypt-throw maps to
  `error.wrongPassphraseOrCorrupt` (M4).
- **Base64 (H4):** byte-accurate helpers — encode a `Uint8Array` byte-by-byte, decode to a `Uint8Array`
  (NOT UTF-8-aware). Tested over the full 0–255 byte range + a non-ASCII ciphertext fixture (a UTF-8
  round-trip silently corrupts ciphertext → looks like wrong-passphrase).
- **Never stored:** passphrase, derived key, PBKDF2 material (rule 65 §5).

## Surface area (file-by-file, by WI)

### WI-1 — `src/lib/crypto/configCrypto.ts` (new; foundational; coverage-gated)
`InsecureContextError`/`WrongPassphraseError`; secure-context guard; `deriveKey(passphrase, salt,
iterations)` (PBKDF2→AES-GCM, non-extractable); `encryptConfig(passphrase, plaintext) → EncryptedBlob`
(fresh salt+iv, AAD = canonical header); `decryptConfig(passphrase, blob) → string` (rebuilds the AAD,
throws `WrongPassphraseError` on tag failure, version-branches on `v`); byte-accurate base64. Native
`crypto.subtle` only. (Node 26's global `crypto.subtle` runs the tests.)

### WI-2 — `src/lib/config/providerConfigCodec.ts` (new; foundational; coverage-gated)
Pure serialize/parse between the syncable config `{vendor, models, baseUrl, apiKeys}` and a versioned
plaintext JSON (the WI-1 encrypts). Validates/sanitizes on parse (skip-bad-fields). **The one place keys
are intentionally serialized** — they ride inside the E2E ciphertext, never plaintext-on-disk/server.
**No client timestamps in the config** — conflict ordering is the server's `rev` ALONE (see WI-7 / M1),
which is server-assigned, monotonic, and clock-skew-immune. The config shape is unchanged from
`providerStore`'s `{vendor, models, baseUrl, apiKeys}` → **no new `providerStore` field, so
`partializeProvider` and its "persists ONLY vendor/models/baseUrl" test are untouched (no #12 ripple).**

### WI-3 — `@lucid/server` `/config` endpoint (server; behavioral) + **optimistic concurrency (H2)** + cap (M3)
`GET /config` → `{ blob: EncryptedBlob | null, rev: number }`; `PUT /config` body `{ blob, baseRev }` →
`204` if `baseRev === currentRev` (then `rev++`), else **`409 Conflict`** (stale — client re-pulls,
re-merges, retries). This reuses the `/sync` store's `baseRev` optimistic-concurrency so a stale second
device can't silently clobber the only copy of the key. **Body cap: 64 KB.** Server treats the blob as
**opaque bytes** — never parses/inspects/logs the ciphertext. **Auth/trust model:** no token (E2E → the
blob is useless without the passphrase; Tailscale is the transport perimeter; the tailnet = the user's
own devices). A malicious tailnet peer is out of scope (consistent with the single-user model); the
optimistic-concurrency guards the realistic risk (an accidental stale-device overwrite). Documented.

### WI-4 — `@lucid/server` serves the app bundle (server; behavioral) — **mount order + root + SPA (H3)**
Serve the built `dist/` via `@hono/node-server/serve-static`, mounted **LAST** (after `/config` + `/sync`
API routes) so it can't shadow the JSON APIs; `root` pinned to the server's cwd (the serve entry +
Dockerfile `WORKDIR` align so assets resolve). lucid is a **single-screen app with no client-side
router**, so `/` serves `index.html` and no HTML5-history SPA fallback is needed (documented; unknown
non-API GETs → 404 or index, stated). Dev: Vite serves the app + proxies `/config`+`/sync` to the server.
Doc-sync `dev-docs/sync-server.md` (single-origin serving).

### WI-5 — `src/lib/config/configSync.ts` (new; behavioral; coverage-gated logic)
Headless: `loadAndDecrypt(passphrase) → {config, rev} | null` (GET `/config` → `decryptConfig` →
`codec.parse`); `encryptAndSave(passphrase, config, baseRev) → newRev` (codec.serialize → `encryptConfig`
→ PUT `{blob, baseRev}`; on `409` → return a `Conflict` signal so the caller (WI-7) re-pulls + adopts).
Owns the per-device **`syncedRev`** — the last `rev` this device has incorporated — in a dedicated
`lucid.config-rev` localStorage record via `createSafeJSONStorage` (a separate key, **NOT a
`providerStore` field** → no #12/partialize change). Injectable `fetch` (test seam). Maps failures to
localized keys (M4): `error.insecureContext`, `error.configUnreachable`, `error.configRequestFailed`,
`error.wrongPassphraseOrCorrupt`.

### WI-6 — passphrase / unlock UI (behavioral; **rule-51 DESIGN-GATED → needs-design**)
A new surface covering ALL these states (L2): set-passphrase (first use) + unlock prompt; the
**insecure-context / "HTTPS required"** banner (C1); **wrong-passphrase-or-corrupt** error;
**unreachable/request-failed** error; **no-blob-yet / first-run**; a privacy note (the passphrase is the
one secret; a lost passphrase = unrecoverable config — rule 65 §6). Not in any committed
`dev-docs/designs` bundle → file `needs-design` before this WI. WI-1..WI-5 proceed; WI-7 waits.

### WI-7 — startup wiring + sync-on-change (final WI; behavioral) — **rev-authoritative merge + save-path safety (M1/M2)**
**Conflict model (M1 — single authority, no client clock):** the server's `rev` is the SOLE conflict
authority (server-assigned, monotonic, clock-skew-immune). There is NO `updatedAt`/timestamp merge — the
round-1 "rev vs client-clock" double-mechanism is eliminated.
- **On load:** localStorage hydrates `providerStore` instantly (#12, non-secret). After passphrase+decrypt,
  pull `{blob, rev}`; **adopt the server config IFF `rev > syncedRev` AND the user has not edited config
  since load** (a `dirty` flag). The `dirty` guard prevents the async blob from clobbering a local edit
  made during the load window (test). Set `syncedRev = rev` on adopt.
- **On config change:** set `dirty`; debounced `encryptAndSave(baseRev = syncedRev)` → `204` sets
  `syncedRev = newRev` + clears `dirty`; **`409`** (another device advanced `rev`) → re-pull + adopt the
  server config (last-successful-write-wins) and reset `syncedRev`. The retry terminates: each PUT carries
  the freshly re-pulled `baseRev`.
- **Concurrent two-device edits (documented, accepted):** last device to successfully PUT wins; the other
  gets a `409`, re-pulls, and adopts the server config — its in-flight local edit is dropped. Acceptable
  for single-user config (a tiny field set, rarely edited on two devices at once); WI-6 may surface a
  "config updated on another device" notice. No silent data corruption, just last-writer-wins.
- **Save path (M2):** reads `useProviderStore.getState()` directly and PUTs ONLY the ciphertext — never
  writes keys to localStorage (only the non-secret `syncedRev` record), never logs the plaintext/blob
  (asserted + tested).

### Files OUT of scope
- The existing `/sync` (workspace data) path — unchanged; this adds a separate `/config` blob.
- Multi-user / accounts; Argon2id / any new dependency.

## Prior art / precedent / rejected alternatives
- Research (2026-06-19): OWASP (PBKDF2-600k), MDN Web Crypto `deriveKey`, Neil Madden/NIST SP 800-38D
  (12-byte random IV, never reuse), Bitwarden (600k PBKDF2, client-only keys), Standard Notes 004
  (versioned protocol, AES-256-GCM, validate-before-decrypt). `src/lib/uuid.ts` (secure-context
  precedent). `server/src/app.ts` (`/sync` bearer + `baseRev` optimistic-concurrency — reused for H2).
- Rejected: plaintext key on server (peer/compromise reads it); localStorage-only (per-device); a typed
  token (user won't); Argon2id (dep); a canary (H1 — can't distinguish wrong-passphrase from corruption).

## Work-item sequencing
| WI | Tier | Design-gated? | Notes |
|---|---|---|---|
| WI-1 configCrypto (+secure-context guard, AAD, base64) | foundational | no | coverage-gated |
| WI-2 providerConfigCodec (+`updatedAt`) | foundational | no | coverage-gated |
| WI-3 server `/config` (+optimistic-concurrency, cap) | behavioral | no | reuse `/sync` baseRev |
| WI-4 server serves app (mount-order/root/SPA) | behavioral | no | + doc-sync |
| WI-5 configSync service | behavioral | no | coverage-gated logic |
| WI-6 passphrase/unlock UI (+all error/HTTPS states) | behavioral | **YES → needs-design** | |
| WI-7 startup wiring + LWW + save-path (final) | behavioral | depends on WI-6 | + doc-sync |

WI-1..WI-5 buildable now (rule 51 logic-first). WI-6 files `needs-design` + blocks; WI-7 (user-visible
completion → minor/major bump) waits on WI-6. Feature reaches `DONE` only when WI-7 lands.

## Test catalogue
- `configCrypto.test.ts`: round-trip; **wrong passphrase → throws**; fresh salt+iv per call; `v`-branch;
  **AAD tamper on `v` AND `kdf` (and iterations/salt) → throws**; base64 over **all 0–255 bytes** +
  non-ASCII ciphertext; **insecure-context (stub `crypto` without `subtle`) → `InsecureContextError`/
  localized, no uncaught TypeError**; empty/large plaintext.
- `providerConfigCodec.test.ts`: serialize→parse incl. apiKeys + `updatedAt`; skip-bad-fields; emits only
  the defined fields.
- `configSync.test.ts`: load (GET→decrypt→parse, mocked fetch); save (serialize→encrypt→PUT with
  baseRev); **409 → re-pull path**; 404/empty → null; unreachable/4xx → mapped localized errors;
  wrong-passphrase surfaced.
- `server/`: PUT then GET round-trips the opaque blob; **stale baseRev → 409**; size cap (>64 KB → 4xx);
  server never inspects/logs ciphertext; `GET /` serves the bundle, `GET /config` still hits the API,
  static mount doesn't shadow APIs (WI-4).
- WI-7 (when unblocked): blob+passphrase → providerStore hydrated incl. apiKeys **only if `rev >
  syncedRev`**; **edit-during-async-load (`dirty`) → local edit preserved, server NOT adopted**; **`409`
  on save → re-pull + adopt server**; **save path writes NO localStorage (except the `syncedRev` record)
  + logs no plaintext/blob**; **`providerStore.test.ts` "persists ONLY vendor/models/baseUrl" UNCHANGED**
  (no #12 ripple); config change → debounced PUT. (Real-component, mocked transport — rule 65 §8.)

## Risks + mitigations
- **HTTPS precondition (C1)** → runtime secure-context guard + localized error + doc; tested with a stubbed
  insecure context so the failure is handled, not hidden.
- **Algorithm/version downgrade (C2)** → full-header canonical AAD; tamper-tested on `v`/`kdf`.
- **Lost update / clobbered key (H2)** → `/config` optimistic-concurrency (`baseRev`/409).
- **Binary corruption via base64 (H4)** → byte-accurate helpers; all-256-byte test.
- **IV reuse (GCM-fatal)** → fresh random 12-byte IV per encrypt; well under 2^32 for a config blob.
- **#12↔#15 startup race + conflict (M1)** → server `rev` is the SOLE authority (no client clock → no
  skew, no competing double-mechanism); a per-device `syncedRev` lives in a SEPARATE `lucid.config-rev`
  localStorage record (NOT a `providerStore` field → `partializeProvider` + its test are untouched, no
  #12 ripple); a `dirty` flag prevents the async blob from clobbering a local edit made during the load
  window; concurrent two-device edits = last-successful-PUT-wins (documented, single-user-acceptable, no
  corruption). Keys still never reach localStorage (M2; partializeProvider unchanged).
- **Save-path key leak (M2)** → save reads `getState()`, PUTs ciphertext only, no localStorage/log; tested.
- **Weak passphrase = whole attack surface** → min length/entropy check (dep-free) + "lost passphrase =
  unrecoverable" warning (WI-6, §6).
- **Static route shadowing / wrong root (H3)** → APIs first, static last, root pinned; tested.
- **Design gate (WI-6)** → headless WIs proceed; WI-6 files needs-design (covering passphrase + all
  error/HTTPS UI states); no UI invented.

## Backward compat
Additive: a new `/config` endpoint + client crypto/sync layer; existing localStorage (#12) and `/sync`
(workspace data) untouched. No `/config` blob / no passphrase set → behaves exactly as today (config from
localStorage, key entered manually); E2E is opt-in by setting a passphrase. Older builds ignore `/config`.
Crypto `v` field allows format migration. HTTPS is required ONLY to use the E2E feature (plain-HTTP local
use still works without it, minus E2E).

## Revision history
- 2026-06-19 v1 — initial plan (Gate 1), crypto grounded in research.
- 2026-06-19 — Gate 2 round 1: NEEDS REVISION (2C/4H/4M; crypto core confirmed sound). Findings summarized
  below v2.
- 2026-06-19 v2 — all Gate-2 findings addressed: **C1** HTTPS mandatory + secure-context guard/test/doc;
  **C2** full-header canonical AAD; **H1** canary dropped; **H2** `/config` optimistic-concurrency;
  **H3** static mount-order/root/SPA; **H4** byte-accurate base64 + all-256 test; **M1** LWW-by-`updatedAt`
  + edit-during-load; **M2** save-path no-localStorage/no-log + test; **M3** 64 KB cap; **M4** localized
  error keys (ride into WI-6 design); **L4** doc-sync sync-server.md + dev-docs/README.md. Product owner
  accepted the HTTPS precondition (`tailscale serve`, one-time).
- 2026-06-19 — Gate 2 round 2: **0 Critical, 0 High** (all crypto/security fixes C1/C2/H1/H2/H3/H4/M2/M3/M4
  verified to HOLD across both rounds) — **3 Medium, all the M1/LWW cluster**: `updatedAt` ownership +
  #12 `partializeProvider` test ripple; server-`rev` vs client-clock double-mechanism; cross-device clock
  skew.
- 2026-06-19 v3 — **M1 resolved by ELIMINATION**, not patching: dropped the `updatedAt`/client-clock LWW
  entirely. The server's `rev` is now the SOLE conflict authority (monotonic, server-assigned,
  skew-immune); a per-device `syncedRev` lives in a separate `lucid.config-rev` record (no `providerStore`
  field → **no #12/partialize ripple, no test change**); a `dirty` flag guards the load window;
  concurrent edits = last-successful-PUT-wins (documented). This removes all three round-2 Mediums at the
  source (no client timestamp → no skew; one mechanism → no precedence ambiguity; no store field → no
  ripple). **WI-1/3/4/5 were ruled READY across both rounds; the M1 fix lands only in WI-2/WI-5/WI-7 and
  is re-verified by their per-WI Gate-4 audits.** Zero open Critical/High/Medium → Gate 2 clean.