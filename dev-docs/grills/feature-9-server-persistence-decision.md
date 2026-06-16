# Feature #9 — Server-side persistence: architecture decision brief (for cross-model review)

> Pre-plan decision brief. lucid GH #45. This is NOT yet a Gate-1 plan — it frames the
> architecture choices so an independent reviewer (Codex) can weigh in BEFORE we commit to a
> backend. Please critique the options, recommend an approach, and flag risks/blind spots.

## What lucid is today (constraints)

- **Browser-only app.** React 19 + TypeScript + Vite v7 + Zustand v5 + Tailwind/shadcn. `AGENTS.md`
  states explicitly: "Web app — no Rust/Tauri/native layer. Runs in the browser" and "No backend dev
  server to babysit." **There is no backend, no server code, no `server/` or `api/` dir.**
- **All persistence is client-side `localStorage`** via a crash-proof `safeJSONStorage` (zustand
  `persist`): sessions + task history + glossary (#3: `lucid.sessions`, `lucid.glossary`) and polish
  keywords (#8: `lucid.keywords`). Per-device, lost on cache-clear, **no cross-device sync**.
- **Provider API keys are in-memory ONLY** (rule 65 §5) — never persisted, never logged. A "thin
  server/proxy for production key handling" is named in `AGENTS.md` / rule 65 §5 as a **future** path
  (not built). Rule 65 §6: user text leaving the device must be explicit; local/Ollama is the
  privacy-preserving path.
- **LLM access goes through ONE `LLMProvider` interface** (rule 65 §1). Multi-provider
  (Anthropic/OpenAI/Gemini/Ollama/custom) just shipped (v0.6.0).
- **Rules that bind #9:** rule 51 (UI only from a committed `claude.ai/design` bundle — so any
  account/settings UI is design-gated), rule 47 Gate 2 (independent plan audit; cross-model review
  MANDATORY for plans introducing a new external dependency), rule 60 §4 (new-dependency hallucination
  check) + §7 (Phase-0 spike before committing on a high-risk external tech).

## What #9 asks for

Make the workspace data (sessions, task history, glossary, keywords) **durable on a server and synced
across devices** — survive a cleared cache, follow the user between machines.

## The decision (three sub-questions)

### A. Backend approach
1. **Managed BaaS (Supabase)** — hosted Postgres + auth + row-level security; `@supabase/supabase-js`
   in the client; least backend code; a third-party data processor; a project to provision.
2. **Serverless functions + serverless DB** — e.g. Cloudflare Workers + D1/KV, or Vercel functions +
   Turso/Neon. No always-on server; more code (endpoints, schema, sync); still a hosting account.
3. **Thin self-hosted server** — small Node/Hono + a DB the user hosts. Full control; could ALSO be the
   rule 65 §5 key-proxy; most infra/ops burden.
4. **Defer** — keep localStorage; revisit later. The rest of the backlog is already done.

### B. Identity / auth
1. **Real accounts** (email magic-link / OAuth) — proper cross-device identity; more UI (design-gated).
2. **Anonymous device-linking** (a generated sync code/passphrase, no email) — lower friction, more
   private; recovery == the code.
3. Decide alongside the backend.

### C. Provider API keys vs the backend
1. **Keys stay client-side** (in-memory, as today) — backend syncs DATA only; smaller trust boundary.
2. **Backend also proxies provider keys** (realizes the rule 65 §5 future proxy) — keys move
   server-side; the provider layer changes to route through the proxy; bigger backend + bigger blast
   radius if breached.

## Cross-cutting design/risk concerns to weigh

- **Migration**: existing `localStorage` data must seed the server on first sync without loss.
- **Conflict resolution**: localStorage copy vs server copy; last-write-wins vs merge vs
  server-authoritative; offline edits.
- **Privacy (rule 65 §6)**: user text + domain terms leaving the device must be explicit; this is a
  real posture change for a tool that today can run fully local (Ollama).
- **Security**: if keys move server-side (option C2), a breach is far worse than today's in-memory model.
- **Scope/cost**: hosting cost, ops, and the fact that this is the FIRST backend — it changes the
  project's architecture and `AGENTS.md`'s stated boundary.
- **Testability**: `pnpm check:all` must stay hermetic (no live backend in CI) — the sync layer needs a
  mockable boundary like the provider layer's injectable `fetch`.

## Author's tentative lean (please challenge)

For a greenfield browser app where the dominant need is cross-device sync of small JSON documents:
**A1 (Supabase)** for speed + built-in auth, **B2 (anonymous device-linking)** to minimize the
privacy/UI surface and keep recovery simple, and **C1 (keys stay client-side)** to avoid enlarging the
key trust boundary. A Phase-0 spike (rule 60 §7) would validate the sync + conflict shape before any
feature WI. Open question: whether deferring (#A4) is wiser given this is the first backend and the
other 8 features are already shipped.

**Asks for the reviewer:** Is the lean sound? Which approach best fits lucid's constraints
(browser-only, privacy-first, hermetic tests, rule-51 design gate)? What are the biggest risks /
blind spots? Is "defer + spike" the more responsible first move, or is a managed BaaS low-risk enough
to proceed? Any conflict-resolution / migration pitfall we're underweighting?
