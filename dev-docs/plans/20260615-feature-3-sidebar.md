# Feature #3 — Sessions & Glossary sidebar (data + persistence)

> Status: **DRAFT** (Gate 1) · Tracker: `docs/features.md` #3 · GH: #19
> Design: `dev-docs/designs/lucid-workspace/project/Lucid Workspace.dc.html` (sidebar = the `<aside>`
> at the SIDEBAR/#18 block: Sessions + Glossary tabs, full/shell/hidden variants). Depends on #2
> (VERIFIED) + #4 (VERIFIED). Branch `feat/feature-3-sidebar` (main is protected).

## Problem

Feature #2 shipped the workspace but split the **sidebar and its data** out to this feature: there
is no history of past translate/polish work and no reusable domain glossary, so every session
starts blank and keywords must be re-typed each time. The committed design (#18) depicts a
left sidebar with a **Sessions** tab (a searchable list of sessions, each holding its tasks; a
detail view with rename) and a **Glossary** tab (saved domain terms you can reuse). This feature
builds that data layer (persisted across browser sessions) and wires the designed sidebar to it.

## Scope

**In scope:**

- **Session store** — sessions (`id`, `name`, `createdAt`, `tasks[]`), an `activeSessionId`, and
  CRUD: `newSession`, `renameSession`, `deleteSession`, `selectSession`, plus an `addTask` that
  records a completed translate/polish run (`kind`, `title`, `meta`, `createdAt`) into the active
  session. A search **selector** filters by name/task text. Persisted (see Persistence).
- **Glossary store** — domain terms (`id`, `label`), CRUD (`addTerm`, `removeTerm`), de-duped
  case-insensitively. Persisted. A `useTerm` path that adds a term to the **current Polish
  keywords** (integrates with the existing Polish keyword input — feature #2), and a heuristic
  **extract-from-text** helper that proposes candidate terms from the active editor text.
- **Persistence layer** — zustand `persist` middleware over `localStorage`, with a **versioned**
  schema, a `migrate` hook, and **corruption-safe rehydration** (a malformed/oversized blob is
  discarded, not thrown — the app still boots). API keys are NEVER persisted (rule 65 §5); session
  text is the user's own, stored locally only (documented; never sent anywhere — rule 65 §6).
- **Sidebar UI** (designed #18) — the `<aside>` with **Sessions / Glossary** tabs; Sessions list
  (new, search, select, empty state) + session detail (rename, task list, back); Glossary list
  (add via Enter, remove, "use" → keywords, suggested/extract). Empty states per the design.
  Wired into `Workspace.tsx` (currently full-width).

**Out of scope / Files OUT of scope:**

- The provider/translation/polish **logic** (`src/providers/**`, `src/lib/{translation,polish,
  prompts}/**`) — consumed, not changed. The Polish keyword input (feature #2 `KeywordsCard`) is
  the integration point for `useTerm`; its component is lightly extended, not rebuilt.
- The prototype **"Design review" dock** and the **shell/hidden** sidebar variants as runtime
  toggles (the design's full variant is what ships; a collapse toggle is a future enhancement,
  not invented here — rule 51).
- **Cloud sync / multi-device** — the design's "synced across sessions" means persisted across
  *browser* sessions (localStorage), NOT a server. No backend.
- **LLM-powered extraction** — extract-from-text is a local heuristic, not a provider call.

## Prior art / precedent / rejected alternatives

- **zustand `persist` + localStorage** for both stores — the standard, well-tested zustand pattern;
  matches the existing store conventions (`create`, selectors, `getState()` in callbacks). *Rejected:
  IndexedDB / `idb`* — overkill for small structured metadata (sessions/terms), adds async
  complexity + a dependency; revisit only if large documents are stored. *Rejected: a hand-rolled
  localStorage wrapper* — `persist` already handles serialize/rehydrate/versioning/migrate.
- **Persisting session text locally** — acceptable: it is the user's own text in their own browser,
  never transmitted (rule 65 §6 privacy posture). The API key is the only thing that must stay
  in-memory (rule 65 §5) — the persisted stores never touch it.
- **Search as a selector** (not stored state) — derive filtered results from the query + sessions,
  matching the no-derived-state store convention.
- **Reuse** — `KeywordsCard`/Polish keyword state (feature #2) for `useTerm`; the token/design
  layer + shadcn primitives (feature #4) for the sidebar surfaces; the `.dark` theme (feature #4).

## Work-item sequencing

| WI | Title | Tier | PR |
|----|-------|------|----|
| WI-1 | `sessionStore` — sessions+tasks data model, CRUD, active session, search selector, persisted (versioned + corruption-safe) | foundational (store, 100%) | M |
| WI-2 | `glossaryStore` — terms CRUD (case-insensitive de-dupe), persisted; `extractTerms(text)` heuristic lib | foundational (store+lib, 100%) | M |
| WI-3 | Persistence hardening — shared `safeJSONStorage` (quota + corruption guards), schema version + migrate, rehydration tests | foundational (lib, 100%) | S |
| WI-4 | Sidebar shell — `<aside>` + Sessions/Glossary tabs + empty states; wire into `Workspace.tsx` | behavioral | M |
| WI-5 | Sessions view — list (new/search/select), detail (rename, task list, back) | behavioral | L |
| WI-6 | Glossary view — list (add/remove), "use"→keywords, suggested/extract-from-text | behavioral | M |
| WI-7 | Run→task recording — a completed translate/polish run is saved as a task in the active session | behavioral | M |

Order: data layer first (WI-1..3, TDD at 100%), then the designed UI (WI-4..6), then the
cross-store integration (WI-7). `pnpm check:all` green per WI; own commit each.

## Test catalogue

- `src/stores/sessionStore.test.ts` — new/rename/delete/select; addTask into the active session;
  search selector (by name + task text, case-insensitive); active-session invariants; reset.
- `src/stores/glossaryStore.test.ts` — add/remove; case-insensitive de-dupe; ordering; reset.
- `src/lib/glossary/extractTerms.test.ts` — candidate extraction (repeated capitalized phrases /
  technical tokens); empty/CJK/punctuation-only ⇒ none; dedupe vs existing terms.
- `src/lib/storage/safeJSONStorage.test.ts` — round-trip; corrupt JSON ⇒ undefined (no throw);
  quota-exceeded on write ⇒ swallowed; version mismatch ⇒ migrate/discard.
- `Sidebar.test.tsx` / `SessionsView.test.tsx` / `GlossaryView.test.tsx` — tab switch; empty
  states; new session; search filters the list; select → detail; rename commits; add/remove term;
  "use" adds to Polish keywords (ARIA-role queries; mocked nothing — pure store interactions).
- `PolishPanel`/integration — a completed polish/translate run appears as a task in the active
  session (WI-7).

Logic globs stay 100%; components behavioral (outside globs). No provider/live-API involvement.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Corrupt/oversized localStorage crashes boot | `safeJSONStorage` returns undefined on parse error; `persist` rehydrates to defaults; tested. |
| Schema evolution breaks old persisted data | `version` + `migrate` in `persist`; unknown/old version → migrate or discard; tested. |
| Quota exceeded on write | write wrapped in try/catch; failure is swallowed (history is best-effort), surfaced only via console-free no-op; tested. |
| Persisting user text (privacy) | Local-only, never transmitted (rule 65 §6); documented in-UI posture unchanged; API key never persisted (rule 65 §5). |
| Sidebar is undesigned beyond the full variant | Only the committed full variant ships; collapse/shell toggle is a future enhancement (rule 51). |
| Cross-store coupling (run→task, term→keywords) | One-way, explicit calls via `getState()`; no store imports another's React state; tested. |

## Backward compatibility

- Two NEW persisted stores (`lucid.sessions`, `lucid.glossary` localStorage keys). No existing data
  to migrate (first persistence in the app). First load with empty storage ⇒ empty states.
- `Workspace.tsx` gains the sidebar; the main region narrows. No API/route change.
- `providerStore` (API key) stays in-memory — explicitly NOT migrated into persistence.

## Definition of Done

- WI-1..WI-7 done; stores/libs TDD at 100%; behavioral ARIA tests; `pnpm check:all` green; per-WI
  commits; version bump (minor) as the last commit before the PR.
- The sidebar works end-to-end: create/rename/select sessions; a completed translate/polish run is
  recorded as a task; add/remove/use glossary terms; search filters; all persisted across reload.
- No prototype dock / shell-toggle invented; API key never persisted; corrupt storage never crashes.
- Final WI: acceptance in `dev-docs/verification/feature-3-<YYYYMMDD>.md`; row → DONE → VERIFIED;
  GH #19 closed with citation.
