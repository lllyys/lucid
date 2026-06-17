# lucid self-hosted sync server (#9, WI-8d) — minimal container image.
#
# Base: node:24-slim. node:sqlite (the ONLY DB dependency, see src/db.ts) is STABLE and flag-free from
# Node 24.0.0 onward (it was experimental behind --experimental-sqlite in Node 22.x), so the base must be
# >= 24 (matches package.json engines.node ">=24") and the CMD needs no --experimental-* flag.
#
# Required runtime env (see src/index.ts → createServerConfig):
#   SYNC_TOKEN  (REQUIRED) the bearer token every client request must present. No default — a tokenless
#               server is an open auth hole, so the process REFUSES to start without it. Generate one with
#               `openssl rand -base64 32`. NEVER bake the token into the image; pass it at run time.
#   DB_PATH     (optional, default 'sync.db') the SQLite file. Point it INSIDE the mounted volume so data
#               survives container restarts, e.g. DB_PATH=/data/sync.db.
#   PORT        (optional, default 8787) the listen port (must be 1..65535).
#   MAX_BODY_BYTES (optional, default 5242880 = 5 MiB) cap on the POST /sync/changes body.
#
# Run (TLS terminated by a reverse proxy or Tailscale — see dev-docs/sync-server.md):
#   docker build -t lucid-sync ./server
#   docker run -d --name lucid-sync \
#     -e SYNC_TOKEN="$(openssl rand -base64 32)" \
#     -e DB_PATH=/data/sync.db \
#     -p 8787:8787 \
#     -v lucid-sync-data:/data \
#     lucid-sync

# --- build stage: compile TypeScript (.ts → .js) so the nodenext .js imports resolve at runtime ---
FROM node:24-slim AS build
WORKDIR /app
# Pin pnpm deterministically: only server/package.json is in the build context, so corepack must be told
# the exact version (also pinned in package.json's "packageManager") or it cannot resolve one in a
# non-interactive build. `corepack prepare … --activate` downloads it without a prompt.
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
# Install deps (incl. dev: typescript) against the lockfile-free package manifest for this single package.
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# --- runtime stage: prod deps only + the compiled output ---
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
# Prod dependencies only (hono + @hono/node-server); typescript/vitest are NOT shipped.
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile
COPY --from=build /app/dist ./dist

# The DB lives here; mount a named volume or host dir so the user's workspace data persists. The volume
# holds plaintext SQLite (no extra encryption) — see the trust-boundary note in dev-docs/sync-server.md.
VOLUME ["/data"]
EXPOSE 8787

# node:sqlite is flag-free on Node 24, so no --experimental-* flag is needed.
CMD ["node", "dist/index.js"]
