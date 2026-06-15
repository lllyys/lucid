# Feature #3 — Sessions & Glossary sidebar (data + persistence)

> Status: **PLANNED** (Gate 2 PASSED — round 1 NEEDS REVISION → v2; round 2 READY TO BUILD.
> Independent audit via fresh-context subagents, as Codex was rate-limited — rule-48 fallback.)
> Proceeding to Gate 3. · Tracker: `docs/features.md` #3 · GH: #19
> Design: `dev-docs/designs/lucid-workspace/project/Lucid Workspace.dc.html` (sidebar = the `<aside>`
> at the SIDEBAR/#18 block: Sessions + Glossary tabs, full/shell/hidden variants). Depends on #2
> (VERIFIED) + #4 (VERIFIED). Branch `feat/feature-3-sidebar` (main is protected).

## Gate-2 round-1 resolutions (v2)

Round 1 (independent multi-subagent audit; Codex was rate-limited — rule 48 fresh-context fallback)
= NEEDS REVISION, 4 Criticals + Highs + Mediums. All resolved here (authoritative over the prose
below where they differ). `zustand@^5` `persist` + `createJSONStorage` verified importable.

### Locked interfaces (Critical #1)

```ts
// src/stores/sessionStore.ts
export interface Task { id: string; kind: 'translate' | 'polish'; title: string; sourceText: string; resultText: string; createdAt: number }
export interface Session { id: string; name: string; createdAt: number; tasks: Task[] }
interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  newSession: () => string                 // creates + selects; returns new id
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => void
  selectSession: (id: string) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void  // into the active session (no-op if none)
  reset: () => void
}
export function searchSessions(sessions: Session[], query: string): Session[]  // pure selector, see Search
// src/stores/glossaryStore.ts
export interface Term { id: string; label: string }
interface GlossaryStore {
  terms: Term[]
  addTerm: (label: string) => void         // trims; case-insensitive de-dupe (keep FIRST; reject dup)
  removeTerm: (id: string) => void
  reset: () => void
}
```

IDs use a seeded counter (no `Math.random`/`Date.now` in store bodies per harness rules — pass a
clock/id-source as an injectable test seam mirroring `operationStore`'s `setOperationClock`).

### Persistence (Critical #1 + Highs: safeJSONStorage / zustand v5 / SSR / quota / multi-tab)

- `src/lib/storage/safeJSONStorage.ts`: `createSafeJSONStorage()` returning a zustand
  `StateStorage` (`getItem/setItem/removeItem`). `getItem` returns `null` on absent/corrupt/oversized
  (>1MB) data (never throws); `setItem` wraps `localStorage.setItem` in try/catch and swallows
  `QuotaExceededError` (best-effort) after attempting eviction (below). **SSR guard:** if
  `typeof window === 'undefined' || !window.localStorage`, all ops no-op (`getItem`→null). Used via
  `persist(fn, { name, version: 1, storage: createJSONStorage(() => safeJSONStorage), migrate })`.
- `version: 1`; `migrate(persisted, fromVersion)`: on any unknown/older version OR a thrown
  migration, return `undefined` (→ zustand falls back to initial state). Tested: corrupt JSON,
  oversized blob, version mismatch, migrate-throws — each boots to defaults without throwing.
- **Persist keys:** `lucid.sessions`, `lucid.glossary`. **Scalar-only** persisted fields
  (`createdAt: number` via the injectable clock — never a `Date`); a round-trip serialization test
  asserts `parse(stringify(state))` is identical.
- **Quota/growth:** `sessionStore` caps history at **50 most-recent sessions** (drop oldest on
  insert); each session caps at **200 tasks** (drop oldest). On a still-failing `setItem`, surface a
  one-time localized toast `error.storageFull` (rule 65 §4 — not silent) and continue in-memory.
- **Multi-tab:** single-tab is the supported scope (documented). A `storage`-event listener that
  rehydrates on cross-tab writes is an explicit **stretch** in WI-3 (last-write-wins); if not done,
  WI-3 notes "no cross-tab live sync — reload to see another tab's changes."
- **Key never persisted:** an invariant test asserts neither persist blob ever contains an `sk-`/key
  field (the API key lives only in the in-memory `providerStore`, rule 65 §5).

### WI-7 run→task integration (Critical #2)

No store mutation inside a panel. Add `src/hooks/useRecordTask.ts` exposing `recordTask(kind,
sourceText, resultText)` which calls `useSessionStore.getState().addTask(...)` with a derived
`title` (first ≤40 chars of `sourceText`, single-line). The panels call it at the existing **commit**
points: `TranslatePanel.onAccept` and `PolishPanel.onAccept` (a task = an ACCEPTED result, not every
run). `Task` captures `sourceText` + `resultText` (the user's own text, local-only — rule 65 §6; no
analytics). Tested via the hook + a panel-accept integration test.

### Glossary "use term" → Polish keywords (Critical #3)

PolishPanel's `keywords` move from local `useState` to a tiny store
`src/stores/polishKeywordsStore.ts` (`keywords: string[]`, `addKeyword`, `removeKeyword`, `reset`).
PolishPanel reads via selector + passes to `KeywordsCard` unchanged (KeywordsCard stays
presentational — NOT rebuilt). `GlossaryView`'s "use" calls `useTerm` = a pure action that invokes
`usePolishKeywordsStore.getState().addKeyword(label)`. No cross-component prop-drilling, no store
importing another's React state. Tested: "use" adds to the keyword store → reflected in PolishPanel.

### Sidebar variant scope (Critical #4 — corrected rationale)

The design depicts full/shell/hidden, but `sidebarMode` is switched **only by the prototype
"Design review" dock** (design `:309–345,577,826–827`) — there is **no product control**. Building
shell/hidden as product features would require **inventing** an undesigned product collapse/toggle
control, which rule 51 forbids. So the product ships the **full** variant only (`showSidebar=true`,
no `shellMode`); the conditional shell/hidden branches are NOT built (nothing untested ships). A
product sidebar-collapse affordance is a future **needs-design** (noted, not blocking). This is
rule-51 *compliance*, not withholding designed UI.

### Workspace restructure (High #5)

`Workspace.tsx` becomes a flex row under the toolbar: `<Sidebar>` (fixed `w-[268px]`, per design) +
`<main className="flex-1 …">`. Sidebar holds the Sessions/Glossary tab state.

### extractTerms (High #6)

`src/lib/glossary/extractTerms.ts`: `extractTerms(text: string, existing?: readonly string[]):
string[]`. Heuristic: capitalized multi-word phrases (`/\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)*/u`) AND
tokens repeated ≥2×, length ≥4 (filters common stopwords); cap at 8; de-dupe case-insensitively against `existing`. **CJK/RTL:**
documented Latin-script-oriented limitation for v1 (CJK has no case; returns none for case-less
scripts) — a fixture asserts CJK/punctuation-only → `[]`; a follow-up can add segmenter-based
CJK term mining. No provider call.

### Search selector (Medium)

`searchSessions(sessions, query)`: case-insensitive substring over `name` + each task's `title` +
`sourceText`; empty query → all; linear scan (documented acceptable; a 100-session scale test
asserts < 100ms). Query is a parameter, not stored state.

### Privacy surfacing (Medium, rule 65 §6)

The workspace footer (`FooterPrivacy`, feature #2) already states the active provider's posture at
the point of action; persisted session text is local-only and never sent anywhere (no analytics
ingest persisted text). No new disclosure surface needed; confirmed, not invented.

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
| WI-4 | Sidebar shell — restructure `Workspace.tsx` into flex row (`<Sidebar w-268>` + `<main flex-1>`) + Sessions/Glossary tabs + empty states (full variant only — see v2) | behavioral | M |
| WI-5 | Sessions view — list (new/search/select), detail (rename, task list, back) | behavioral | L |
| WI-6 | Glossary view + `polishKeywordsStore` hoist (PolishPanel keywords → store; KeywordsCard unchanged) + `useTerm`→`addKeyword` + extract-from-text | behavioral (+store) | M |
| WI-7 | `useRecordTask` hook — `TranslatePanel`/`PolishPanel` `onAccept` record an accepted result as a task in the active session | behavioral | M |

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
