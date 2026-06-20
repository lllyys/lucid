# Self-hosted sync server

The lucid sync server (`server/`) is a single-binary HTTP service the lucid web client
syncs its workspace against (sessions, tasks, terms, keywords). It is **single-tenant by
design**: one server holds exactly one human's data — there is no per-user partitioning,
no accounts, just one bearer token that gates the whole API. Run one box per person.

This doc covers running it (Docker), securing it (a token + TLS), and the trust boundary
its data volume implies.

## What it is

- A [Hono](https://hono.dev) app (`server/src/app.ts`) over a `node:sqlite` store
  (`server/src/db.ts`). The serve entry is `server/src/index.ts`.
- Three routes, behind a constant-time bearer-auth guard (or a pass-through guard in the
  token-free single-origin mode — see "Token-free single-origin mode"):
  - `GET /sync/changes?since=<rev>` — pull entities changed since a cursor.
  - `POST /sync/changes` — push a batch of changes (body capped, see below).
  - `DELETE /sync/data` — erase everything (the client's disconnect-and-erase).
- The client half is `src/lib/sync/backend.ts`; it talks to this server over a REST API
  (bearer header when a token is configured, none in token-free mode) and bounds every
  request with a 15 s timeout.

## 1. Generate a token

The server **refuses to start without `SYNC_TOKEN`** when it runs **API-only** (no
`STATIC_DIR`) — a tokenless API-only server is an open auth hole, so there is no default.
Generate a high-entropy token once and keep it secret:

```bash
openssl rand -base64 32
```

The client stores this token via the browser's secure mechanisms and presents it on every
request (`Authorization: Bearer <token>`). Treat it like a password: never commit it,
never bake it into the Docker image, never paste it into a bug report. The server never
logs it (the single startup line prints only the port and DB path).

### Token-free single-origin mode (#19)

When you serve the app from the server itself (`STATIC_DIR` set) you may **omit
`SYNC_TOKEN`** to run `/sync` **token-free**: the served origin plus the Tailscale ACL is
the boundary, exactly like `/config` (#15) — no token to type, no URL to configure. The four
quadrants of (`STATIC_DIR`, `SYNC_TOKEN`):

| `STATIC_DIR` | `SYNC_TOKEN` | `/sync` behavior |
|---|---|---|
| set | **empty/unset** | **token-free** — `/sync` is UNAUTHENTICATED, gated only by network reachability; any `Authorization` header is ignored |
| set | set | bearer-authed (a single-origin server that ALSO wants a token stays protected) |
| unset | empty/unset | **refuses to start** (an API-only server with no auth is a footgun) |
| unset | set | bearer-authed (API-only, the original behavior) |

> **Token-free `/sync` carries plaintext workspace data reachable by anyone who can reach
> the origin (is on the tailnet)** — strictly weaker than a typed token. It is the
> single-tenant, self-hosted-behind-Tailscale choice. The server logs a LOUD startup warning
> when it enters this mode, and **fails fast** if `STATIC_DIR` does not point at a real
> readable directory (so a typo can never silently open an unauthenticated `/sync` behind a
> broken app). The client omits the `Authorization` header entirely in this mode.

## 2. Run it (Docker)

The image is built from `server/Dockerfile` (base `node:24-slim` — `node:sqlite` is stable
and flag-free from Node 24; see "Node version" below).

```bash
docker build -t lucid-sync ./server

docker run -d --name lucid-sync \
  -e SYNC_TOKEN="$(openssl rand -base64 32)" \
  -e DB_PATH=/data/sync.db \
  -p 8787:8787 \
  -v lucid-sync-data:/data \
  lucid-sync
```

> Generate the token **once** and reuse the same value — the snippet above generates a
> fresh token on each run, which would invalidate the client's saved token. Generate it,
> save it, then pass the saved value.

### Environment

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `SYNC_TOKEN` | **yes, unless `STATIC_DIR` is set** | — | Bearer token. Non-empty. No default for an API-only server (tokenless API-only = auth hole). With `STATIC_DIR` set, omitting it runs `/sync` **token-free** (see "Token-free single-origin mode"). |
| `DB_PATH` | no | `sync.db` | SQLite file. Point it **inside the mounted volume** (e.g. `/data/sync.db`) so data survives restarts. Never `:memory:` (test-only — loses everything on restart). |
| `PORT` | no | `8787` | Listen port, must be `1..65535`. |
| `MAX_BODY_BYTES` | no | `5242880` (5 MiB) | Cap on the `POST /sync/changes` body. A normal push is a few KB; this is a resource-exhaustion guard. An over-cap body → `413`. |
| `STATIC_DIR` | no | — | Path to the **built web app** (`dist/`) to serve at the same origin (#15 cross-device config sync). Set it to serve the app + the API from one origin (no CORS, no URL to type). Unset = API-only (the pre-#15 behavior). When set with no `SYNC_TOKEN` it ALSO authorizes the token-free `/sync` mode (#19) and must `stat` to a real readable directory. |

### The data volume (trust boundary)

The mounted volume (`/data` above) holds the SQLite file, which contains the user's entire
synced workspace **in plaintext** — there is no at-rest encryption layer in the server. The
trust boundary is therefore the box and its disk:

- Anyone with read access to the volume/disk can read the workspace data.
- Anyone with the token can read and write it over the network (in token-free single-origin
  mode, anyone who can reach the origin / is on the tailnet can — there is no token).

Encrypt the underlying disk (full-disk encryption / an encrypted volume) if the host is not
already trusted, and restrict filesystem access to the volume. This matches the
single-tenant / one-human-box model — the server is not a multi-user service and makes no
attempt to isolate tenants.

## 3. Put it behind TLS

The client talks **TLS-only** and persists the token (rule 65 §5: keys are sensitive in
transit and at rest). Never expose the plain HTTP port to the internet — terminate TLS in
front of the server. Two recommended options follow. (For `/sync` this is strongly advised;
for the `/config` cross-device sync below it is a **hard requirement** — see "HTTPS is
MANDATORY for `/config`".)

### Option A — Caddy reverse proxy (automatic TLS)

[Caddy](https://caddyserver.com) provisions and renews a Let's Encrypt certificate
automatically. A minimal `Caddyfile`:

```caddyfile
sync.example.com {
    reverse_proxy localhost:8787
}
```

Point the lucid client's server URL at `https://sync.example.com`. Caddy handles the cert;
the lucid server stays on plain HTTP on `localhost`, never exposed directly.

### Option B — Tailscale (private mesh)

For a server that should never touch the public internet, put the box on a
[Tailscale](https://tailscale.com) tailnet and reach it over the mesh. Tailscale provides
encrypted transport (WireGuard) between your devices and the server without opening a public
port; `tailscale serve` / `tailscale cert` can additionally provide an HTTPS endpoint on the
tailnet. This is the most private option — the server is reachable only by your own devices.

Whichever you pick, the client URL must be `https://…` — the token must never cross the wire
unencrypted.

## Node version

`node:sqlite` (the only DB dependency) became **stable and flag-free in Node 24.0.0**; on
Node 22.x it was experimental behind `--experimental-sqlite`. The image base is therefore
`node:24-slim` and `server/package.json` pins `engines.node` to `>=24`, so the container
`CMD` runs with no `--experimental-*` flag.

## Body-size limit

`POST /sync/changes` is capped at `MAX_BODY_BYTES` (default 5 MiB). A body over the cap is
rejected with HTTP `413` before the store sees it (nothing is persisted). The client maps
`4xx` to a non-retryable `badRequest` — correct here, because a body that large is a client
bug, not a transient fault. A normal push is a few KB, so the cap never bites real use.

## Cross-device config sync (`/config`, #15)

A second, independent endpoint lets the user reach the app on any device and have their
provider config **and API key** already present — no key re-entry, no token to type. It is
**end-to-end encrypted**: the browser encrypts the config under a passphrase (PBKDF2 →
AES-256-GCM) and the server stores only **ciphertext**.

- `GET /config` → `{ blob, rev }` (or `{ blob: null, rev: 0 }` when none stored). `PUT /config`
  `{ blob, baseRev }` → `200 { status:'applied', rev }`, or `409 { status:'conflict', rev, blob }`
  when `baseRev` is stale (optimistic-concurrency, so a stale device can't clobber the only copy
  of the key). Body capped at **64 KiB** → `413`.
- **No bearer token.** Unlike `/sync` (which holds plaintext workspace data and stays token-
  protected), `/config` is reachable unauthenticated: the blob is useless without the
  passphrase, and the user explicitly wants no token to type. The Tailscale network is the
  perimeter; a malicious tailnet peer is out of scope for this single-user model.
- **Single-origin serving.** Set `STATIC_DIR` to the built web app so the server serves the app
  + `/config` + `/sync` from one origin (no CORS, no URL to type). In dev, `pnpm dev` proxies
  `/config` + `/sync` to the server (see `vite.config.ts`).

### HTTPS is MANDATORY for `/config` (not just advisory)

The browser's Web Crypto API (`crypto.subtle`) **only exists in a secure context** — it is
`undefined` on a plain-`http://` non-localhost origin. So E2E config sync **requires the app to
be served over HTTPS**; there is no plain-HTTP fallback. Use the TLS options above — the
simplest is **`tailscale serve`** (one-time, persists across reboots), which gives a cert'd
`https://<machine>.<tailnet>.ts.net` URL with no per-device token. (Plain-HTTP local use still
works for everything *except* `/config` E2E.)

### Client layering (`src/lib/config/`, `src/lib/crypto/`)

The browser side of `/config` is four headless modules, each tested in isolation:

- `configCrypto.ts` — PBKDF2 → AES-256-GCM encrypt/decrypt, the secure-context guard
  (`InsecureContextError`), byte-accurate base64. The passphrase + derived key are
  memory-only (never persisted, never logged).
- `providerConfigCodec.ts` — serialize/parse the syncable config `{vendor, models, baseUrl,
  apiKeys, customProviders, activeCustomId}` to/from versioned plaintext (envelope `v2`; the
  one place keys are serialized — both the per-vendor keys AND each custom provider's key ride
  only inside the ciphertext). A `v1` blob (no custom providers) migrates forward to an empty
  custom map on parse (backward-compat).
- `configSync.ts` (WI-5) — `loadAndDecrypt` / `encryptAndSave` over `/config`, plus the
  per-device `syncedRev` (`lucid.config-rev`). Maps failures to error kinds
  (`insecureContext` · `wrongPassphraseOrCorrupt` · `unreachable` · `requestFailed`).
- `configSyncController.ts` (WI-7) — the orchestration layer + the `useConfigSyncStore`
  state machine (`checking → insecure | noConfig | locked | unlocked | localOnly | error`)
  that the passphrase/unlock UI (WI-6) reads via selectors and drives via `init`,
  `setPassphrase`, `unlock`, `retry`, `retrySync`, `workLocalOnly`. It detects the secure
  context, probes `/config` on startup, encrypts the live `providerStore` config on first use,
  adopts a newer server config on unlock (server-`rev` authoritative; a `dirty` guard protects
  a local edit made during the load window), and debounce-saves on every config change — a
  `409` re-pulls and adopts the server copy (last-writer-wins). Only the non-secret `syncedRev`
  is persisted.
  - **Two error channels.** `status:'error'` + `error` is the BLOCKING channel (the unlock/setup
    card): set only on INIT and UNLOCK / SET-PASSPHRASE failures, and `retry()` re-runs the
    startup probe. `syncError` is the NON-BLOCKING channel (the Settings·Sync banner): set on a
    background sync-on-change SAVE failure, where the workspace stays `unlocked` and usable;
    `retrySync()` re-attempts the SAVE (re-encrypt + PUT at a fresh `baseRev`, never a re-probe)
    and a later edit also re-arms it. A successful save clears `syncError`.
  - **Serialized saves.** Saves never overlap: an edit while a save is in flight only flips
    `dirty` (the save loop picks it up next pass, re-reading `baseRev` then) rather than starting
    a concurrent save on a stale `baseRev`. `dirty` is cleared on a successful save only when no
    edit arrived during that save; a late edit keeps `dirty` true so the loop pushes it next.
