# Feature #2 — Lucid Workspace (Translate + Polish)

> Status: **DRAFT** (Gate 1 authoring; not yet sent to Gate 2 audit) · GH: #11
> Tracker row: `docs/features.md` #2
> Design bundle: `dev-docs/designs/lucid-workspace/` (committed; rule 51 design gate satisfied).
> Primary design file (per the bundle README): `project/Lucid Workspace.dc.html`. The sibling
> `project/Lucid Workspace v1 (modal).dc.html` is an earlier iteration and is **not** the landing.
> Depends on: #1 (VERIFIED — provider layer + config store + prompts + i18n)

## Revision history

| Rev | Date | Change |
|-----|------|--------|
| v1 | 2026-06-14 | Initial plan (Gate 1). |
| v2 | 2026-06-14 | Applied three independent review lenses (scope/cohesion, rule-compliance, feasibility). **Scope split adopted as default** (feature #2 = the translate+polish workspace; Sessions → Tasks + Glossary panel + persistence become **feature #3**). Introduced an early minimal-shell WI; resolved the WI-11 overload via the split; reconciled `PanelOp` vs the shipped `OperationState` union; promoted the stale-completion `runId` guard into the `operationStore` surface + tests; fixed the result-pane error/cancelled **rendering** as a `needs-design` block (kept the mapping as headless logic per rule 51); named a single source for ProviderSwitcher display metadata and resolved the `google`/`gemini` key; re-specified the diff merge API around an accepted-segment seam (rule 66 §2); enumerated per-control focus indicators (rule 33); reconciled the dark-palette rule-34-vs-51 tension (light-mirror `.dark` + `needs-design` for values); corrected the false "rule 31 / existing tokens" premise; pinned token names to rules 32/34; re-sized WI-3/WI-4 to L for the 100 % branch-coverage burden; flagged the root-tsconfig `@`-alias as a known WI-1 task; wrapper-styled the Sonner toast; restated the `@types/diff` exclusion. |

---

## Feature split (decided this revision)

The v1 draft was a single 11-WI feature. Rule 47's audit table flags "10+ WIs → consider splitting",
and all three review lenses converged on the same cut line. **This plan therefore commits to the
split as the default**, not a conditional escalation:

- **Feature #2 — Lucid Workspace (Translate + Polish).** WI-1..WI-9 below. The genuinely-core,
  design-backed product: token + shadcn foundation, the minimal app shell + header chrome + footer
  privacy line + toast, the operation/diff/detection logic, and the **Translate** and **Polish**
  panels wired to the real provider stream. Ships a usable two-function workspace with a **sidebar
  placeholder slot** that feature #3 fills.
- **Feature #3 — Sessions & Glossary sidebar (+ persistence).** The Sessions → Tasks history model,
  the Sessions panel, the full Glossary panel (suggested chips / extract-from-text / term list), and
  the in-memory → `persist` upgrade. This is a separable left-sidebar surface, not load-bearing for
  translate/polish. It is created as its own tracker row + GH issue and follows its own Gate-1 plan;
  this plan does **not** specify its WIs (a forward pointer only).

The cut keeps each feature inside rule 47's "Large (5+ WIs)" band with a tractable single Gate-2
audit each, and gives the rule-65-critical surfaces (provider switcher, privacy line) their own
audited PR rather than a corner of a giant finale. The Definition of Done below is scoped to
feature #2's WIs only.

---

## Problem

Feature #1 shipped the headless foundation — the single `LLMProvider` layer (Anthropic behind
`createProvider`), the provider config store, versioned prompt builders + `validateRequest`, the
i18n scaffold — behind a deliberately blank placeholder shell (`App.tsx`). lucid currently has **no
product surface**: a user cannot paste text, pick a direction or polish goal, stream a result, see a
diff, or accept it. There is nothing to use.

This feature builds the **Lucid Workspace** — the translate + polish product UI — from the committed
design bundle at `dev-docs/designs/lucid-workspace/`. The bundle's final landing (confirmed by the
chat transcript at `chats/chat1.md`, which the README names as where the intent lives) is **two
distinct, independent functions on one screen**:

- a **Translate panel** (top) — automatic two-way 中↔EN: detect the source language, translate the
  other direction, stream the result with a live caret and end-to-end timer, Copy / Accept;
- a **Polish panel** (below) — refine a draft against its source meaning: an **Original** (meaning
  reference, with a source-language picker), a **Draft to polish** (editable, with an inline
  *Translate original* action and a target-language picker), **Domain keywords** (the model's domain
  anchor), streaming a **Polished** result with a **Result / Compare** toggle (word-level diff vs the
  draft) and Copy / Accept / Regenerate;

both sharing a **header** with a **provider switcher** and a **footer privacy line** that changes per
provider (rule 65 §6). The left **Sidebar** (Sessions → Tasks history + a reusable Glossary) is
**deferred to feature #3** (see Feature split); feature #2 ships the shell with a placeholder sidebar
slot. All model access flows through the feature-#1 provider layer — no component ever calls a vendor
or `fetch` directly (rule 65 §1). The mock's canned output, canned diff, and `setInterval` token
faking are replaced by real `provider.stream()` driven by an `AbortController`, a real word-diff over
the actual draft/result, and live `Intl.Segmenter`-based direction detection.

## Scope

**In scope** (feature #2 — the translate + polish workspace, design-backed):

- **Token + shadcn foundation.** A CSS-variable token layer in `src/index.css` authored **from
  scratch** (today the file is only `@import "tailwindcss";` — there are no existing lucid tokens to
  "extend"), mapping the design palette onto the token **names that rules 32/33/34 already reference**
  (`--bg-color`, `--text-color`, `--text-secondary`, `--border-color`, `--accent-bg`,
  `--accent-primary`, `--hover-bg`, `--primary-color`, `--error-color`, `--radius-sm/md/lg`,
  `--popup-shadow`, the status tokens) plus the design-specific surface/role tokens the mock needs
  (`--bg-canvas`, `--bg-surface`, `--border-control`, etc.); the same token **names** redefined under
  `.dark` (rule 34). shadcn/ui initialized (`components.json`, `cn()` util) and the primitives the
  design needs added via the CLI (`button`, `input`, `textarea`, `dropdown-menu`, `popover`,
  `scroll-area`, `sonner`); a Google Fonts load (Geist, Geist Mono, Newsreader) matching the design
  helmet.
- **The minimal app shell** — `Workspace` layout + `WorkspaceHeader` + footer + toast host + the
  `App.tsx` swap — landed **early** (WI-2) so the panel WIs have a real surface to mount into and
  slice-verify against. The shell carries a **placeholder sidebar slot** (feature #3 fills it).
- **Header chrome** — brand wordmark + run hint + a `Settings` button (visible affordance, opens
  nothing — no dialog is designed, rule 51) + the **provider switcher**.
- **Footer privacy line** — provider-aware (rule 65 §6): local → green dot + "stays on this device";
  hosted → amber dot + "sent to <provider>"; CTA toggles to/from local.
- **Accept-confirmation toast** — Sonner, **wrapper-styled** to the depicted bespoke dark pill.
- **Operation logic** — a store slice driving each panel's run lifecycle (`idle | streaming | done |
  error | cancelled`) over `provider.stream()` with one `AbortController` per panel per run, a
  monotonic per-panel `runId` stale-completion guard, a live end-to-end timer derived from
  `startedAt`, Stop → `cancelled` keeping partial text, mid-stream throw → `error` keeping partial
  text, and a re-entrancy guard (a streaming panel's run button aborts, never restarts).
- **Word-diff logic** — `createWordDiff().diff(original, result)` over the **actual** draft and
  polished result (live, real diff — not canned), structure-preserving (code / inline code / URLs /
  placeholders are opaque atomic tokens), CJK-segmented via an injectable `Intl.Segmenter`, with an
  accept-by-segment merge helper `applyDiff(segments, acceptedIds)` (rule 66 §2), all tested as logic
  with no rendering.
- **Direction detection** — `detectDirection(text)` for the Translate panel's auto two-way 中↔EN.
- **Glossary logic for the keyword affordance only** — `extractTerms(text, lexicon, existing)` +
  `DOMAIN_LEXICON`, and the minimal global-term surface the Polish panel's "＋ from glossary"
  affordance consumes (`terms[]`, `addTerm`, `removeTerm`). The Glossary **panel** surface
  (`suggested[]` chips, `extract()`, `saveSuggested()`) is feature #3 — feature #2 builds only what
  it consumes, so no store method ships without a feature-#2 caller.
- **The Translate + Polish panel UI** depicted in the bundle: Translate panel (direction pill + auto
  badge + swap + run, source textarea, streaming result pane), Polish panel (three input cards +
  Result/Compare + accept/copy/regenerate).
- **Provider switcher** — shadcn `DropdownMenu` driven by a **feature-#2-local presentation map**
  (see Surface area) bridging design labels/dots/badges to the `Vendor` type; selecting an
  implemented vendor calls `useProviderStore.setVendor`; unimplemented vendors render but are refused.
- **i18n** — every user-facing string through `t()` with flat dot keys added to
  `src/locales/en/translation.json` (rule 66 §5); the provider-aware privacy line (rule 65 §6).

**Out of scope / deferred** (with rationale):

- **Sessions → Tasks history + the Glossary panel + persistence.** *Decision: feature #3.* See
  **Feature split** above. The sidebar is a separable surface; the workspace is usable without it.
  Feature #2's shell ships a placeholder sidebar slot. The persistence upgrade (in-memory → `persist`
  middleware) lands with feature #3's stores. **Rule 65 §5 constraint carried forward:** the API key
  is never persisted in plaintext — that exclusion holds in every feature.
- **Result-pane `error` and `cancelled` *rendering*.** *Decision: `needs-design`-blocked (rule 51
  §16).* The primary design (`Lucid Workspace.dc.html`) models only three result-pane states —
  `idle` (italic placeholder), `streaming` (text + live caret), `done` (text + Copy/Accept), via
  `tDotColor` / `pDotColor`. There is **no** `error` and **no** `cancelled` rendering anywhere in the
  bundle. The error/cancelled **mapping** stays as headless logic in `operationStore` (TDD-gated —
  rule 51 keeps the logic obligation, §55). Until a design depicts them, `TranslateResult` /
  `PolishResult` render **only** the three depicted states. File a `needs-design` GH issue (title
  *"Design needed: result-pane error + cancelled states for feature #2"*, labels `enhancement` +
  `needs-design`, body `Refs #11`, listing the states the design must cover: error / rate-limited /
  provider-down / invalid-key / timeout, cancelled-with-partial-text, partial-stream / incomplete).
  Tag the affected WI rows `BLOCKED: needs-design (#NN)` for the error/cancelled rendering slice only.
- **Per-segment (per-hunk) accept/reject *UI*.** The design depicts only whole-result **Accept**. The
  diff *logic* (`applyDiff(segments, acceptedIds)`) is built and tested to support partial accept
  (rule 66 §2 "partial accept is expected"), but the *rendered* per-hunk toggle is not in the bundle
  (rule 51) — so feature #2 ships whole-result Accept and the partial-accept rendering is deferred
  until a design depicts it. The logic carrying the capability is in scope; the surface is not.
- **General multi-language translation in the Translate panel.** The Translate panel is **strictly
  two-way 中↔EN** per the user's explicit instruction in the transcript ("capable of automatic
  two-way translation between Chinese and English"). The Polish panel's language pickers expose the
  design's four labels (中文 / English / Español / 日本語) because the mock depicts them there. A
  general N-language Translate picker is not depicted — deferred.
- **RTL / Arabic / Hebrew rendering.** The final `.dc.html` has no `dir="rtl"` and renders only
  Chinese/English/serif LTR text; the transcript mentions an earlier RTL prototype that was discarded
  before the final handoff. RTL layout is therefore **not depicted** in the committed bundle (rule
  51). The diff/detection *logic* is written to never split grapheme clusters or assume LTR (rule 66
  §3), and result/diff panes use logical CSS properties + a `dir`-ready container, but a depicted RTL
  surface and its acceptance are deferred to a future design.
- **Markdown / fenced-code-block / syntax-highlight rendering** of result/diff content. The mock
  renders plain serif text (`white-space: pre-wrap`); no rich rendering is depicted. Structure
  preservation is enforced in the *prompt* (already shipped) and in the *diff tokenizer* (opaque
  spans), and line breaks survive via `pre-wrap`, but a Markdown renderer is not depicted — deferred.
- **Settings dialog, API-key entry surface, onboarding, error/rate-limited/provider-down/invalid-key
  *banners*.** The transcript's own open questions flag these as undesigned. The header **Settings**
  button is a visible affordance in the mock, so it is rendered, but it opens nothing (no dialog is
  depicted — rule 51). These join the result-pane error/cancelled rendering under the same
  `needs-design` issue.
- **New vendor implementations (OpenAI / Gemini / Ollama).** The provider switcher lists all four
  (the design depicts them), but only Anthropic is implemented (`isVendorImplemented`). Selecting an
  unimplemented vendor is refused by `providerStore.setVendor` (already shipped) — the menu reflects
  the implemented set; wiring new vendors is feature-#1's documented follow-up, not this feature.

### Files OUT of scope

- `src/providers/**` — the entire provider layer is feature #1, **VERIFIED**. This feature *consumes*
  `createProvider`, `useProviderStore`, the `LLMProvider` interface, and the registry; it does not
  modify their behavior. **Two narrow, explicitly-bounded touches are permitted:**
  1. **Stale-comment doc-sync** (rules 20/22): `types.ts`, `providerStore.ts`, and `App.tsx` carry
     comments that call this work "feature #3". Feature #2 is canonical for the operation store and
     the workspace UI, so those comments are corrected to "feature #2" in the WI that supersedes each
     file. No behavior change.
  2. **`OperationState` reconciliation** (type-only, if needed): see Backward compatibility. The
     `operationStore` does **not** redefine `OperationState`; it composes it. If the shipped union
     needs a purely additive type-only edit, it is a `types.ts` edit with no runtime change, done in
     WI-5. This is the only *type* touch and it is bounded to additive/composition.
  - The provider **registry** is **not** extended for display labels — the ProviderSwitcher's display
    metadata comes from a feature-#2-local presentation map (Surface area), not a registry change.
- `src/lib/prompts/**` — built and VERIFIED in #1. Consumed via `buildPrompt` (indirectly, through
  `provider.stream()`) and `validateRequest` / `resolveLanguage`. Not modified.
- `vite.config.ts` coverage globs — already scope coverage to `src/providers/**`, `src/lib/**`,
  `src/stores/**` at **100 % statements/branches/functions/lines** (verified). New logic lands under
  those globs and is held to 100 %; `src/components/**` and `src/hooks/**` are **not** under the
  globs (behavioral component/hook tests, not coverage-counted). The globs are **not changed**:
  `src/components/ui/**` (generated shadcn) is already outside them (`ui/` is not under
  `lib`/`stores`/`providers`); confirm in WI-1.
- `tsconfig.app.json` — already carries the `@` alias (`paths: { "@/*": ["src/*"] }`) and is the file
  the app build uses. **The root `tsconfig.json` does NOT carry the alias** (it is a solution file:
  `files: []`, references only) — see Risks; shadcn-init may need the alias mirrored to the root, a
  validated WI-1 config touch.

## Surface area (file-by-file)

Concrete names + signatures. **L** = logic (TDD-gated, 100 % coverage, foundational tier). **P** =
presentational (behavioral component test by ARIA role, slice-verified). **C** = config/CSS (no test;
visual QA + the existing gate).

### Token + shadcn foundation (C)

- `src/index.css` — extend the existing `@import "tailwindcss";` with:
  - `@theme` block exposing fonts + layout tokens as Tailwind utilities: `--font-sans` (Geist),
    `--font-mono` (Geist Mono), `--font-serif` (Newsreader + CJK serif fallbacks); `--color-*`
    bridges so `bg-canvas` / `text-primary` / `rounded-card` etc. exist.
  - `:root { … }` light-theme token values from the design palette, authored **from scratch** onto
    the rules-32/33/34 token names (above) plus design-specific names: surfaces (`--bg-canvas`
    #FAF9F6, `--bg-surface` #FFFFFF, `--bg-secondary`, `--hover-bg`, `--row-hover`), accent
    (`--accent-primary` #574FD6, `--accent-hover`, `--accent-disabled`, `--accent-bg`,
    `--accent-chip-bg`, also aliased to `--primary-color` for the rules-32/33 button focus patterns),
    success/private (`--success` #2F7D5B, `--success-hover`, `--success-bg`), warning (`--warning`
    #C28A2E), error (`--error` #B23A48, aliased to `--error-color`), the warm-grey text ramp
    (`--text-primary`/`--text-color` … `--text-disabled`/`--text-secondary`), borders
    (`--border-color`, `--border-control`, `--border-card-inner`, `--border-separator`,
    `--border-strong`, `--border-dashed`), radii (`--radius-sm` 4px … `--radius-card` 14px,
    `--radius-pill` 7px, with `--radius-lg` mapped for overlay surfaces), shadows (`--popup-shadow`,
    `--shadow-menu`, `--shadow-toast`, `--shadow-tab` — warm-tinted from #1E1C19), selection,
    scrollbar. **No "rule 31" citation** — `31-design-tokens.md` does not exist in `.claude/rules/`;
    the authoritative token contract is the names rules 32/33/34 reference, which this layer pins.
  - `.dark { … }` overrides — **the same token names** as `:root` so rule 34's mechanism exists and
    every component reading `var(--token)` adapts for free. **The bundle is light-only** (every hex in
    `Lucid Workspace.dc.html` is a light value), so authoring *bespoke* dark values is itself
    self-designed UI under rule 51. **Decision (rule-34-vs-51 reconciliation):** ship the `.dark`
    scope as a **literal mirror of the light values** (or near-mirror with only contrast-floor
    adjustments needed to meet WCAG AA on text/focus), and file the dark **palette values** under the
    same `needs-design` issue as the error states. Do **not** ship invented warm-dark hexes (lifted
    accent, raised diff-add opacity) as a settled decision — those are gated behind the design. The
    `.dark` block existing satisfies rule 34's *mechanism* requirement; the *values* are designed
    before they diverge from light.
  - global resets the design relies on: `::selection`, `::-webkit-scrollbar*`, the caret / pulse /
    toast keyframes — but **NOT** the mock's `textarea:focus, input:focus { outline: none }` (line 21
    of the mock; violates rule 33 — replaced by the compliant focus patterns enumerated below).
- `components.json` — shadcn config: `style` (chosen at init, locked), `rsc:false`, `tsx:true`,
  `tailwind.config:""` (v4 has no JS config), `tailwind.css:"src/index.css"`, `cssVariables:true`,
  aliases (`@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`), `iconLibrary:lucide`.
- `src/lib/utils.ts` — the canonical `cn(...inputs: ClassValue[])` (clsx + tailwind-merge).
- `src/components/ui/*` — generated shadcn primitives (`button`, `input`, `textarea`,
  `dropdown-menu`, `popover`, `scroll-area`, `sonner`). Customizations live in wrappers, not in these
  generated files (rule 32).
- `index.html` — add the Google Fonts `<link>` (Geist / Geist Mono / Newsreader) from the design
  helmet.

### Logic — provider presentation map (L, `src/lib/providers/**`)

- `src/lib/providers/providerPresentation.ts` — **the single source** for the provider switcher's
  display strings, so the menu neither invents a parallel hardcoded provider list (rule 65 §2) nor
  edits the OUT-of-scope registry.
  ```ts
  import type { Vendor } from '@/providers/types'
  export interface ProviderPresentation {
    vendor: Vendor          // canonical type key; the design's 'google' maps to 'gemini'
    labelKey: string        // i18n key, NOT a literal label (rule 66 §5)
    dotToken: string        // CSS var name for the menu dot color
    isLocal: boolean        // drives the 'private' badge (Ollama)
  }
  export const PROVIDER_PRESENTATION: readonly ProviderPresentation[]
  export function presentationFor(vendor: Vendor): ProviderPresentation
  // model display string is derived live from resolveModel(vendor) — NOT stored here,
  // so there is no second source of truth for model IDs (rule 65 §2).
  ```
  Tests assert every entry's `vendor` is a valid `Vendor`, the design's `google` resolves to
  `gemini`, `isLocal` is true only for `ollama`, and the displayed model comes from
  `resolveModel(vendor)` (empty for unimplemented vendors → the menu shows the label only). This file
  lives under `src/lib/**` so it is coverage-gated, but it imports only *types* + `resolveModel` from
  the provider layer (no behavior change there).

### Logic — stores (L, `src/stores/**`)

- `src/stores/operationStore.ts` — drives both panels' run lifecycle over the provider stream.
  ```ts
  import type { LLMProvider, LLMRequest, ProviderError, OperationState } from '@/providers/types'
  type PanelId = 'translate' | 'polish'
  // PanelOp COMPOSES the shipped OperationState union (it does NOT re-declare it):
  // OperationState already carries `status` + (per-arm) `text` + (error arm) `error`.
  // The timer fields live OUTSIDE the union because the union has no home for them.
  type PanelOp = OperationState & { startedAt: number | null; elapsedMs: number | null; runId: number }
  interface OperationState_Store {
    translate: PanelOp
    polish: PanelOp
    run(panel: PanelId, request: LLMRequest, provider: LLMProvider): Promise<void>
    abort(panel: PanelId): void
    reset(panel: PanelId): void             // called on input edit; bumps runId
    tick(panel: PanelId, now: number): void // advances the live timer; NO-OP unless status==='streaming'
  }
  ```
  - One non-persisted `AbortController` per panel per run (kept in a module-scope `Map`, never in
    React state — abort of Translate must not touch Polish). `run` guards re-entrancy: if the panel
    is already `streaming`, `run` aborts (does not start a second stream).
  - **Stale-completion guard (promoted from Risks to surface):** each panel carries a monotonic
    `runId`. `run` increments and captures the panel's `runId` at entry; `abort` and `reset` also
    bump it. **Every** `set()` inside the `for await` body and at finalization is guarded
    `if (panelRunId(panel) !== capturedRunId) return`, so a chunk/finish that resumes after a
    `reset`/new-run no-ops instead of writing into a superseded panel state.
  - **Per-panel writes only:** every action mutates **only** its target panel's sub-slice via
    functional `set((s) => ({ [panel]: { ...s[panel], … } }))`, so concurrent ticking/streaming on
    one panel never clobbers the other's `text`/`status`.
  - Consumes `provider.stream(request, { signal })` (token-by-token — required for the live caret +
    live timer; `translate()`/`polish()` would only give a terminal outcome). Accumulates
    `StreamChunk.text`; on completion sets `done` + freezes `elapsedMs`; on `ProviderException`
    catches `.providerError`, sets `error` keeping partial text; on user abort sets `cancelled`
    keeping partial text. Maps nothing to a raw payload — the panel renders `t(error.messageKey)`
    **(rendered only once the error/cancelled design lands — until then headless)**.
  - The store is **config-agnostic about the provider**: the *caller* (a hook) builds the provider
    via `createProvider(vendor, { apiKey, model })` from `useProviderStore` and passes it in, so the
    store stays a pure lifecycle machine and is unit-testable with a stubbed `LLMProvider`.

### Logic — libs (L)

- `src/lib/translation/detectDirection.ts`
  ```ts
  export function detectDirection(text: string): 'zh-en' | 'en-zh'
  // any CJK Han codepoint (一-鿿 and extensions) ⇒ 'zh-en'; else 'en-zh' (empty ⇒ 'en-zh')
  export function directionLabels(dir): { srcCode: 'zh'|'en'; tgtCode: 'zh'|'en'; srcNative: string; tgtNative: string }
  // maps to codes resolveLanguage (lib/prompts) already accepts; src !== tgt always holds
  ```
  Documented limitation (tested): Japanese kana / Korean hangul are **not** caught by a Han-only
  regex — acceptable because the Translate panel is scoped strictly 中↔EN.
- `src/lib/polish/wordDiff.ts` — the real word-diff (replaces the mock's canned `DIFF` array).
  ```ts
  export type DiffSegment = { id: string; type: 'same' | 'add' | 'del'; value: string }
  export interface WordDiff { diff(original: string, result: string): DiffSegment[] }
  export function createWordDiff(opts?: { segmenter?: Intl.Segmenter }): WordDiff
  // Rule-66-§2 partial-accept seam: ONE merge fn parameterized by accepted segments.
  export function applyDiff(segments: DiffSegment[], acceptedIds: ReadonlySet<string>): string
  //   whole-result accept = all add/del segment ids accepted ⇒ yields the model RESULT text
  //   reject (none accepted)               ⇒ yields the ORIGINAL text
  //   any subset                           ⇒ the expected mixed text (partial accept)
  ```
  - Backed by the `diff` (jsdiff) package via `diffArrays` over **tokenized** input: protect opaque
    spans (fenced/inline code, URLs, `{name}`/`%s`/`{{count}}` placeholders — reuse the
    `STRUCTURE_INSTRUCTION` opaque set) as atomic tokens; segment prose via an injected
    `Intl.Segmenter` (granularity `'word'`), defaulting to
    `new Intl.Segmenter(undefined, { granularity: 'word' })`. Map jsdiff `Change[]` → `DiffSegment[]`
    at the boundary so no vendor shape leaks (rule 65 §1 discipline applied to a lib dep). Segmenter
    is injectable so CJK tests pass a deterministic stub (rule 66 §4; ICU-version determinism risk in
    Risks). **Note (rule 66 §2 correctness):** whole-result accept must reproduce the model's
    `result` string **exactly** (asserted), not re-derive it via "original + adds − dels", which can
    desync when opaque spans are atomic.
- `src/lib/glossary/extractTerms.ts`
  ```ts
  export function extractTerms(text: string, lexicon: readonly string[], existing: readonly string[]): string[]
  // case-insensitive substring match of lexicon terms in text, excluding terms already in `existing`,
  // returned in canonical lexicon casing; multi-word terms supported; substring over-match guarded
  export const DOMAIN_LEXICON: readonly string[]  // curated config (the mock's LEXICON, deduped)
  ```
  **NOTE (rule 60 §5):** `src/lib/glossary/**` is a new high-risk path — verified that the
  `tdd-guard.mjs` `SCOPED` array does **not** yet include it. Add `/^src\/lib\/glossary\/.*\.tsx?$/`
  (and `/^src\/lib\/providers\/.*\.tsx?$/` for the presentation map) to `SCOPED` in WI-1 so a sibling
  `*.test.ts` must precede each production file.

### Logic — keyword/glossary store, minimal feature-#2 surface (L, `src/stores/**`)

- `src/stores/glossaryStore.ts` — **only** the members feature #2's "＋ from glossary" affordance
  consumes (the full Glossary-panel surface — `suggested[]`, `extract()`, `saveSuggested()` — is
  **feature #3**, built with the panel, so no store method ships without a feature-#2 caller).
  ```ts
  interface GlossaryState {
    terms: string[]; input: string
    addTerm(term: string): void          // trims, dedupes (case-insensitive), no-op on empty
    removeTerm(term: string): void
    setInput(v: string): void
  }
  ```
  Per-task polish keywords are **panel-local component state**, not the global glossary (input-
  ownership decision below). `＋ from glossary` copies a glossary term into the active panel's keyword
  list. `extractTerms` powers the panel-local "extract from current text" within the Keywords card.

### Hooks (behavioral, `src/hooks/**` — outside the coverage globs; covered by hook tests)

- `src/hooks/useElapsedTimer.ts` — `useElapsedTimer(startedAt: number | null): number` — drives the
  live e2e timer via an interval, cleaning up on unmount/stop. Tested with `renderHook` + fake timers.
- `src/hooks/usePanelRun.ts` — glue: reads `useProviderStore` (vendor/model/apiKey), builds the
  provider via `createProvider`, calls `operationStore.run/abort`. Guards `isReady()` and catches the
  synchronous `ProviderException` from `createProvider` (verified thrown on unimplemented vendor /
  missing key at `src/providers/index.ts:39-44`) → maps to an `error` op. The Draft card's "Translate
  original" run constructs its `TranslateRequest` from the **polish pickers' codes** (Original source-
  language picker → `sourceLang`, Draft target-language picker → `targetLang`, both via
  `resolveLanguage`), **independent of `detectDirection`**, so a zh→ja or en→es draft translation is
  well-formed and `validateRequest` passes. Tested with a mocked provider layer.

### Components — chrome (P, `src/components/workspace/**`)

- `Workspace.tsx` — top-level layout: header + **placeholder sidebar slot** + main (translate panel +
  polish panel) + footer + toast host. Composes the pieces; owns no business logic.
- `WorkspaceHeader.tsx` — brand wordmark + tagline, `runHint` (⌘↵), a `Settings` button (visible, no
  action — no dialog designed, rule 51), and `<ProviderSwitcher/>`.
- `ProviderSwitcher.tsx` — shadcn `DropdownMenu`; lists vendors from `PROVIDER_PRESENTATION` with dot
  + `t(labelKey)` + model (from `resolveModel`) + `private` badge (Ollama) + active check; selecting
  calls `useProviderStore.setVendor`. Unimplemented vendors render but are refused by the store.
- `FooterPrivacy.tsx` — provider-aware privacy line (rule 65 §6): local → green dot + "stays on this
  device"; hosted → amber dot + "sent to <provider>"; CTA toggles to/from local.
- `WorkspaceToast.tsx` — **wraps** Sonner's `<Toaster/>` with a token-styled variant matching the
  depicted bespoke toast (dark pill, centered `bottom: 58px`, success check, `lucid-toast`
  animation). The bespoke style lives in **this wrapper**, not the generated `ui/sonner.tsx` (rule 32
  single-source-of-truth) — a Sonner default would be a self-designed surface (rule 51 anti-pattern).
  accept/extract confirmations via `toast()`.

### Components — Translate panel (P, `src/components/translate/**`)

- `TranslatePanel.tsx` — header (direction pill from `detectDirection`, auto badge, swap button, run
  button), source `<textarea>` (serif, char count, Clear), result pane (`<TranslateResult/>`).
- `TranslateResult.tsx` — renders the streaming text + live caret (**idle** placeholder; **streaming**
  text + caret; **done** text + Copy/Accept) — the three depicted states only. The `error`/`cancelled`
  states are `needs-design`-blocked: the mapping exists in `operationStore` but is **not rendered**
  here until a design lands. Reads `operationStore.translate`.

### Components — Polish panel (P, `src/components/polish/**`)

- `PolishPanel.tsx` — header (Polish label, run button) + left column (three input cards) + right
  polished pane.
- `OriginalCard.tsx` — Original `<textarea>` + source-language picker (shadcn dropdown).
- `DraftCard.tsx` — Draft `<textarea>` + `↻ Translate original` action (streams a translation of the
  Original into the draft via a translate run built from the polish pickers' codes) + target-language
  picker.
- `KeywordsCard.tsx` — keyword chips (add via Enter, remove via ×) + `＋ from glossary` +
  extract-from-current-text. Panel-local keyword state.
- `PolishResult.tsx` — Result / Compare toggle; Result = streaming text + caret (idle/streaming/done
  only); Compare = rendered `DiffSegment[]` from `wordDiff` (add = accent chip, del = strikethrough)
  over the **actual** draft and result; Copy / Accept (whole-result `applyDiff(segments, allIds)`) /
  Regenerate; meaning-preserved footer. Reads `operationStore.polish`. `error`/`cancelled` rendering
  is `needs-design`-blocked as above.

## Prior art / project precedent / rejected alternatives

- **Provider consumption pattern** — feature #1 established `createProvider(vendor, config)` →
  `LLMProvider`, with `useProviderStore` holding config and `validateRequest` guarding inputs. This
  feature follows that boundary exactly: components never import a vendor module; the operation store
  is handed an `LLMProvider`; tests stub the interface (the `10-tdd.md` "Provider Tests" pattern and
  `providerTestUtils` precedent). The injectable-provider seam mirrors feature #1's injectable
  `fetch`.
- **Store discipline** — feature #1's `providerStore` is the precedent: actions via `getState()`,
  selectors in components (AGENTS.md, no destructuring), reset between tests (`10-tdd.md` store
  pattern). New stores follow it.
- **Provider switcher display metadata — a feature-#2-local presentation map, not a registry edit and
  not a hardcoded list.** *Chosen:* `src/lib/providers/providerPresentation.ts` maps `Vendor` → label
  key / dot token / `isLocal`, deriving the model string live from `resolveModel(vendor)`. *Rejected:
  extending `modelRegistry` with `label`/`displayModel`/`colorToken`/`isLocal`* — that would pull
  `src/providers/**` into scope (contradicting the OUT-of-scope boundary) and put presentation
  concerns in the model registry. *Rejected: the mock's hardcoded `PROVIDERS` array* — it scatters
  display literals and uses the key `google` (the design's label) where the `Vendor` type is
  `gemini`; the presentation map resolves `google → gemini` once, in one tested place (rule 65 §2).
- **Diff engine — `diff` (jsdiff) over a hand-rolled LCS.** *Chosen: the `diff` npm package
  (`^9.0.0`).* It is the canonical JS Myers implementation (~15 yrs, very high weekly downloads, zero
  deps, BSD-3-Clause, **ships its own types — do NOT add `@types/diff`**; an `@types/diff` exists but
  would conflict with v9's bundled types). `diffWords`/`diffArrays` accept an optional
  `Intl.Segmenter`, exactly the CJK hook rule 66 §3 needs. *Rejected: a hand-rolled word-level LCS* —
  it would re-implement the same algorithm, own 100 % of the edge-case-correctness test burden under
  our coverage gate, and **still** need `Intl.Segmenter` for CJK, buying nothing. The dependency
  triggers rule 60 §4 (`check-new-deps.sh`) and is called out for Gate 2.
- **shadcn/ui via CLI, customizations in wrappers** — rule 30/32 precedent and the official Vite +
  Tailwind v4 + React 19 flow (pnpm avoids the npm peer-dep `--force` problem). Generated primitives
  stay untouched; lucid's overlay tokens / focus patterns / the bespoke toast live in wrapper
  components.
- **Token vocabulary** — *Chosen: author the token layer from scratch onto the names rules 32/33/34
  already reference (`--bg-color`/`--text-color`/`--border-color`/`--accent-bg`/`--primary-color`/…)
  and add the design-specific surface/role tokens the mock needs, mapping the design palette onto a
  single naming system.* (Corrected premise from v1: `src/index.css` today is only
  `@import "tailwindcss";` — there were **no** existing lucid tokens to "extend", and no
  `31-design-tokens.md` rule exists.) *Rejected: a parallel shadcn token set
  (`--background`/`--foreground`)* as a second source of truth — instead the shadcn `@theme inline`
  semantic names are **bridged** to lucid tokens so there is one source of truth (rule 32).
- **Diff merge API — one accepted-segment function over two whole-document functions.** *Chosen:*
  `applyDiff(segments, acceptedIds)`, where whole-result accept = all add/del ids and reject = none.
  *Rejected: separate `acceptDiff`/`rejectDiff` whole-document functions* — they do not expose the
  per-segment seam rule 66 §2 requires ("partial accept is the expected behavior"), so the "logic
  carries the capability" claim would be false; and `acceptDiff = original + adds − dels` re-derives
  the result instead of reproducing the model's exact `result` string.
- **Live word-diff over the actual text** — *Chosen* (the transcript's open question "wire a live
  word-diff so it reflects whatever draft you actually type" → yes). *Rejected: keeping the canned
  diff* — it is a demo artifact; rule 66 §2 requires the diff computed from original + result.
- **Input-text ownership** — *Chosen: panel-local component state for the textareas + keyword chips.*
  This keeps one writer per area (rule 48) and avoids coupling the operation store to raw input.
  *Rejected: a shared panel-inputs store* (premature; nothing else needs it) and *putting inputs in
  the operation store* (mixes lifecycle with content).
- **Error/cancelled mapping in logic, rendering deferred** — precedent: rule 51 §55 explicitly splits
  the obligation (logic built + TDD-tested headless; rendering gated on a design bundle). This
  feature follows it: `operationStore` maps every failure to `error.messageKey` and tests it, but the
  visible error/cancelled pane waits on the `needs-design` issue.

## Work-item sequencing

Tier per rule 47 Gate 5: **foundational** = no user-observable surface (verified by unit/integration
+ audit, no browser); **behavioral** = changes app behavior (slice-verified end-to-end against a
mocked provider behind the interface, or browser-verified for pure UI). PR size: S / M / L.

| WI | Title | Tier | PR size |
|----|-------|------|---------|
| WI-1 | shadcn/ui init + `cn()` util + from-scratch token layer in `index.css` (light `:root` + `.dark` light-mirror) + fonts; add `diff` dep (rule 60 ack, no `@types/diff`); extend tdd-guard `SCOPED` with `src/lib/glossary/**` + `src/lib/providers/**`; root-tsconfig `@`-alias touch if shadcn-init needs it (validated `tsc -b`); confirm `ui/**` outside coverage globs; `pnpm check:all` green | foundational | M |
| WI-2 | Minimal app shell — `Workspace` layout (with placeholder sidebar slot) + `WorkspaceHeader` (brand + Settings stub) + footer container + toast host + `App.tsx` swap; behavioral mount test | behavioral | M |
| WI-3 | `detectDirection` + `directionLabels` (src!==tgt invariant) — `src/lib/translation/detectDirection.ts` + tests | foundational | S |
| WI-4 | `wordDiff` (jsdiff + opaque-token tokenizer + injectable segmenter) + `applyDiff(segments, acceptedIds)` — `src/lib/polish/wordDiff.ts` + edge-case + 100 %-branch tests | foundational | **L** |
| WI-5 | `operationStore` — panel lifecycle over `provider.stream()`, abort, timer, re-entrancy, per-panel writes, **runId stale-completion guard**, error/cancel partial-text, `OperationState` composition (type-only `types.ts` touch if needed) — `src/stores/operationStore.ts` + tests | foundational | **L** |
| WI-6 | `useElapsedTimer` + `usePanelRun` hooks (provider construction + `isReady` guard + `ProviderException` map; Draft "Translate original" request from polish pickers) + tests | foundational | S |
| WI-7 | `glossaryStore` (feature-#2 minimal surface) + `extractTerms` + `DOMAIN_LEXICON` + `providerPresentation` map — `src/stores/glossaryStore.ts`, `src/lib/glossary/extractTerms.ts`, `src/lib/providers/providerPresentation.ts` + tests | foundational | M |
| WI-8 | Translate panel UI wired to `operationStore` + provider (idle/streaming/done only) + provider switcher + footer privacy line — `TranslatePanel`, `TranslateResult`, `ProviderSwitcher`, `FooterPrivacy` + behavioral tests | behavioral | M |
| WI-9 | Polish panel UI: three input cards + Result/Compare (live diff) + accept(whole-result)/copy/regenerate + wrapper-styled toast; full feature-#2 acceptance pass — `PolishPanel`, `OriginalCard`, `DraftCard`, `KeywordsCard`, `PolishResult`, `WorkspaceToast` + behavioral tests | behavioral (final) | L |

> **Dependency ordering (verified correct):** WI-1 (foundation) → WI-2 (shell, so panels have a
> surface to mount/slice-verify into) → WI-3/WI-4/WI-5/WI-6/WI-7 (logic before UI; `wordDiff` and
> `detectDirection` and `operationStore` before the panels that consume them). **WI-5
> (`operationStore`) lands and is Gate-4 audited before WI-8/WI-9** — it is the concurrency-critical
> linchpin both panels depend on (two-panel `AbortController` isolation + `runId` supersession).
> Consider a rule-60-§7 Phase-0 spike for `Intl.Segmenter` CJK determinism before WI-4 commits.

> **Stale-comment doc-sync (rules 20/22):** the "feature #3" comments in `types.ts` /
> `providerStore.ts` / `App.tsx` are corrected to "feature #2" in the WI that already touches each
> file — `App.tsx` in WI-2 (rewritten there); `providerStore.ts` / `types.ts` carry a one-line
> comment fix in WI-5 (the first WI that consumes/composes them) with no behavior change.

> **`needs-design` block:** WI-8 and WI-9 render only the three depicted result-pane states
> (`idle`/`streaming`/`done`). The `error`/`cancelled` **rendering** slice is tagged
> `BLOCKED: needs-design (#NN)` and is excluded from these WIs; the mapping is built + tested
> headless in WI-5.

> **Feature #3 (separate plan):** Sessions → Tasks (`sessionStore` + selectors), the Sessions panel,
> the full Glossary panel (`suggested[]`/`extract()`/`saveSuggested()` + chips), and the in-memory →
> `persist` upgrade. Created as its own tracker row + GH issue with its own Gate-1 plan. The feature
> #2 shell's placeholder sidebar slot is where feature #3 mounts.

## Test catalogue

Logic (TDD-gated, **100 % coverage**, `*.test.ts` beside source under the coverage globs). The 100 %
**branch** requirement is why WI-4 (`wordDiff`) and WI-5 (`operationStore`) are sized **L** — every
opaque-span branch, empty/whitespace/CJK-fallback branch, and every abort/cancel/error/re-entrancy/
stale-completion path must be covered, and a single uncovered branch fails the whole gate:

- `src/lib/translation/detectDirection.test.ts` — CJK Han ⇒ `zh-en`; pure Latin ⇒ `en-zh`; empty ⇒
  `en-zh`; mixed-script (English in Chinese) ⇒ `zh-en`; **Japanese kana / Korean hangul NOT caught**
  (documented limitation); emoji/surrogate-only ⇒ `en-zh`; `directionLabels` maps to codes
  `resolveLanguage` accepts and **asserts `srcCode !== tgtCode`** in both directions (no no-op
  same-language request).
- `src/lib/polish/wordDiff.test.ts` — **structure preservation** (Markdown, fenced + inline code,
  URLs, `{name}`/`%s`/`{{count}}` placeholders survive as opaque atomic segments, never split);
  word add/del/same classification; identical input ⇒ all `same`; empty original / empty result;
  whitespace-only; **CJK segmentation** via an injected deterministic stub segmenter (assert
  structural invariants, not exact ICU token boundaries — rule 66 §4); mixed-script (code-in-CJK,
  English-in-Arabic); emoji / combining marks not split; **`applyDiff` whole-result accept reproduces
  the model `result` string exactly** (not a re-derivation), **none-accepted reproduces the original
  exactly**, and a **partial subset yields the expected mixed text** (rule 66 §2 partial-accept seam);
  every `DiffSegment.id` is unique and stable.
- `src/stores/operationStore.test.ts` — chunk accumulation → `done` text + frozen `elapsedMs`; **Stop
  → `cancelled` keeping partial text** (not `error`); mid-stream `ProviderException` → `error` keeping
  partial text + `error.messageKey` mapped; re-entrancy (run while streaming aborts, does not start a
  2nd stream); **two panels independent** (abort Translate leaves Polish streaming); **concurrent
  ticking/streaming on Translate does not alter Polish's `text`/`status`** (per-panel write); `reset`
  on input edit; **`tick` is a no-op unless `status==='streaming'`** (a tick after `done` does not
  re-advance a frozen timer); **a chunk/finish arriving after `reset()` or a new `run()` does NOT
  mutate the panel** (the `runId` supersession guard — named here, not deferred to prose); timer
  advances from `startedAt` via `tick`. Provider stubbed (rule 65 §8) — never live.
- `src/stores/glossaryStore.test.ts` — `addTerm` trims/dedupes (case-insensitive)/no-ops on empty;
  `removeTerm`; `setInput`. (No `suggested`/`extract`/`saveSuggested` here — those are feature #3.)
- `src/lib/glossary/extractTerms.test.ts` — case-insensitive match in canonical casing; multi-word
  terms; substring over-match guarded; excludes `existing`; empty text ⇒ `[]`.
- `src/lib/providers/providerPresentation.test.ts` — every entry's `vendor` is a valid `Vendor`; the
  design's `google` resolves to `gemini`; `isLocal` true only for `ollama`; displayed model derives
  from `resolveModel(vendor)` (empty for unimplemented → label-only); `presentationFor` total over
  `Vendor`.
- `src/hooks/useElapsedTimer.test.tsx` — accumulates with fake timers; freezes when `startedAt` null;
  cleans up interval on unmount.
- `src/hooks/usePanelRun.test.tsx` — enumerated rule-65-§4 rows: `isReady()===false` ⇒ `error` op
  **without calling stream**; `createProvider` `ProviderException` (missing key) ⇒ `error.invalidKey`
  op; `createProvider` `ProviderException` (unimplemented vendor) ⇒ `error.requestFailed` op; happy
  path ⇒ `operationStore.run` with the built provider; Draft "Translate original" builds a
  `TranslateRequest` from the polish pickers (e.g. a Japanese target produces a **valid** request
  that `validateRequest` passes), independent of `detectDirection`.

Components (behavioral, ARIA-role queries, `userEvent`; outside coverage globs):

- `src/components/workspace/Workspace.test.tsx` — shell mounts header + (placeholder) sidebar slot +
  translate + polish + footer + toast host.
- `src/components/translate/TranslatePanel.test.tsx` — typing in the source textarea shows the
  detected direction + char count; Run (role `button`, name /translate/i) calls run; while streaming,
  the button reads /stop/i and clicking it aborts; result shows partial text; Clear empties; Swap
  reverses. (Error/cancelled rendering is `needs-design`-blocked and **not** asserted here.)
- `src/components/polish/PolishPanel.test.tsx` — three input regions present; adding a keyword via
  Enter shows a chip; × removes it; `＋ from glossary` copies a term; Run polishes; Result/Compare
  toggle switches views; Compare shows add/del segments from the **actual** draft+result; Accept fires
  the toast and commits the whole-result text; Regenerate re-runs.
- `src/components/workspace/ProviderSwitcher.test.tsx` — opens the menu; entries come from
  `PROVIDER_PRESENTATION`; selecting an implemented vendor updates the label; an unimplemented vendor
  selection is refused (label unchanged); `private` badge on Ollama; `google` label maps to `gemini`.
- `src/components/workspace/FooterPrivacy.test.tsx` — hosted provider ⇒ amber dot + "sent to …";
  local ⇒ green dot + "stays on this device"; CTA toggles provider.
- `src/components/workspace/WorkspaceToast.test.tsx` — wrapper renders the styled (not default)
  toast; `toast()` surfaces the accept confirmation.
- `src/integration.test.ts` (extend) — paste → run → streamed result → Compare diff computed →
  whole-result Accept, all against a mocked provider behind the interface.

i18n: new flat dot-key groups in `src/locales/en/translation.json` — `header.*`, `provider.*`,
`translate.*`, `polish.*`, `privacy.*`, `toast.*` — reusing the existing `error.*` keys (do not
duplicate). (`sidebar.*`/`sessions.*`/`glossary.*` panel keys land in feature #3; feature #2 adds only
the `glossary` *keyword-affordance* strings it actually renders.) Em-dashes spaced (rule 66 §6). A
`t()` call with no key is a defect; a test asserts every referenced key exists.

Accessibility / styling (visual QA, no unit test). **Focus indicators per rule 33, enumerated by
control class** (the mock's `outline:none` is NOT copied; verified in **both** light and dark per
rule 33 §4 / rule 34):

| Control class | Rule 33 pattern |
|---|---|
| Run / Stop / Accept / Copy / Regenerate, toolbar & icon buttons | U-shaped underline (§1) |
| Source/Original/Draft textareas, keyword input | caret-only (§2) |
| dropdown-menu items (provider, language pickers) | background highlight (§5) |
| Result/Compare segmented toggle | outline / accent-bg (§6) |

Tokens-only, no hardcoded hex in components (rule 30). Dark + light parity (rule 34) — but dark
**values** are the `needs-design`-gated light-mirror until designed (above).

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Dark palette is undesigned** (bundle is light-only; rule 34 requires `.dark`, rule 51 forbids inventing values). | Ship the `.dark` scope as a **literal mirror of the light values** (contrast-floor adjustments only where WCAG AA demands), so rule 34's mechanism exists and components adapt for free, and **file the dark palette values under the `needs-design` issue**. Do **not** ship invented warm-dark hexes as settled. Reconciled in-plan (not left "open at Gate 2"). |
| **Result-pane `error`/`cancelled` rendering is undesigned** (rule 51 §16). | Keep the mapping headless in `operationStore` (TDD-tested); render only the three depicted states in WI-8/WI-9; file `needs-design` and tag the rendering slice `BLOCKED`. |
| `Intl.Segmenter` output is **ICU-version-dependent** (CJK boundaries differ across Node/Chrome) — risks rule 66 §4 determinism. | Assert structural invariants (dels struck, adds highlighted, opaque spans intact, paragraph count preserved), **never exact CJK token splits**; inject a deterministic stub segmenter for CJK fixtures; pin Node `engines`. Rule-60-§7 Phase-0 spike before WI-4 commits. |
| **100 % branch coverage** on the jsdiff-backed tokenizer (`wordDiff`) and the abort/cancel/error/re-entrancy/stale matrix (`operationStore`) is a larger burden than "M". | WI-4 and WI-5 are sized **L**, with explicit branch tests budgeted for every opaque-span / empty / whitespace / CJK branch and every lifecycle path. A single uncovered branch fails the whole gate, so this is non-optional. |
| `diff` dependency triggers rule 60 §4 (slopsquat guard). | Acknowledge in the WI-1 PR body: package `diff` (not `jsdiff`), `^9.0.0`, mature / very high weekly downloads / 0 deps / BSD-3, **own types — explicitly do NOT add `@types/diff`** (it would conflict with v9's bundled types). Gate 2 cross-model review per rule 60 §6 (new external dep). |
| **Stale-completion / stale-closure**: a finished stream writes into a panel the user already reset/loaded. | `runId` is a **surface field** on `PanelOp` (not just prose): `run` captures it; `abort`/`reset` bump it; every `set()` inside the `for await` body + finalization no-ops if the captured id is stale. Dedicated WI-5 test. |
| **`PanelOp` vs the shipped `OperationState` union**: a flat `{status;text;startedAt;elapsedMs;error}` is not assignable to the discriminated union (`idle` arm has no `text`; timer fields have no home). | `PanelOp` **composes** the union: `OperationState & { startedAt; elapsedMs; runId }`. The timer fields live outside the union (the union has no home for them). Any divergence is reconciled by an **additive type-only** edit to `types.ts` in WI-5 (the only type touch; no runtime change) — this is the bounded exception to the `src/providers/**` OUT-of-scope rule. |
| **`@` alias is app-tsconfig-only**, not in the root `tsconfig.json` (a solution file, `files:[]`, references only) — shadcn-init may probe the root. | Treat as a **known WI-1 task**: check whether the current shadcn CLI reads the alias from the referenced `tsconfig.app.json` or only the root; if root, add `compilerOptions.paths` to the root (a solution-style root with bare `compilerOptions` is valid); validate `tsc -b` still builds before committing. |
| **ProviderSwitcher display metadata** can't come from the registry (empty labels/models; `gemini` vs design `google`). | A feature-#2-local `providerPresentation.ts` is the single source for labels/dots/`isLocal`, deriving the model from `resolveModel(vendor)` and resolving `google → gemini`. **No registry edit** (stays OUT of scope) and **no parallel hardcoded list** (rule 65 §2). |
| **Sonner default toast** would be a self-designed surface (rule 51 anti-pattern). | `WorkspaceToast` **wraps** `<Toaster/>` and styles it to the depicted dark pill via tokens; the bespoke style lives in the wrapper, not the generated `ui/sonner.tsx` (rule 32). |
| Two panels stream concurrently → cross-talk / leaked controllers / clobbered slices. | One `AbortController` per panel per run in a module `Map`, never React state; per-panel functional `set`; explicit "abort Translate leaves Polish" + "concurrent tick doesn't clobber" tests. |
| shadcn CLI may edit root `tsconfig.json`. | Run init, diff the config touch, verify `tsc -b` (project references) still builds before committing WI-1. |
| Rendering untrusted provider text (XSS). | Render via React text nodes / `white-space: pre-wrap`; never `dangerouslySetInnerHTML`. Diff segments are React children, not HTML. |
| Component coverage pulling generated `ui/` into the gate. | Coverage globs already scope to `providers`/`lib`/`stores` — `components/ui/**` is out; confirm in WI-1. Hooks live in `src/hooks/**` (also outside the globs) and are covered by hook tests asserted behaviorally. |

## Backward compatibility

- **Provider layer behavior untouched.** `createProvider` / `useProviderStore` / `LLMProvider` /
  registry keep their feature-#1 contracts; this feature only consumes them. The only edits are
  (a) stale-comment doc-sync and (b) an optional **additive type-only** `OperationState` edit — no
  runtime change either way.
- **`OperationState`** was *defined* in feature #1 as a forward-compat contract and *owned by the
  behavioral feature*. This feature is that owner: `operationStore`'s `PanelOp` **composes**
  `OperationState` (`OperationState & { startedAt; elapsedMs; runId }`) rather than re-declaring it.
  The `cancelled`/`error` arms already carry partial `text` (good); the timer + runId fields live
  outside the union. If the union needs any change it is additive and type-only in WI-5.
- **No persisted data exists yet**, so there is no migration surface. Feature #2's stores are written
  serializable so feature #3's `persist` middleware is additive — old (no-storage) state simply
  starts empty. The **API key is never persisted** regardless (rule 65 §5).
- **`App.tsx`** replaces the placeholder shell with the Workspace (with a placeholder sidebar slot);
  no public API or route changes (SPA with a single screen). The i18n keys added are additive;
  existing `common.*` / `error.*` keys are unchanged and reused.
- **`pnpm check:all`** stays the single gate; new deps (`diff`, shadcn runtime deps) are added to
  `package.json` in WI-1 and the lockfile committed in the same change (AGENTS.md "wire it into the
  gate in the same change"). **`@types/diff` is NOT added.**

## Definition of Done (feature #2 — WI-1..WI-9)

- Every WI's logic is TDD-built (RED → GREEN → REFACTOR) with **100 % coverage** on the logic globs
  (`providers`/`lib`/`stores`); component WIs have behavioral ARIA-role tests; `pnpm check:all` green.
- A user can: paste/type text and stream a real two-way 中↔EN translation (live caret + e2e timer,
  Stop aborts to a clean cancelled state); polish a draft against an original with domain keywords and
  toggle Result / Compare over a **real** word-diff; Copy / Accept the whole result (wrapper-styled
  toast); switch provider and see the privacy line change. (Sessions/Glossary history is feature #3.)
- No component calls a vendor or `fetch` directly (rule 65 §1); provider display strings come from the
  single `providerPresentation` map (rule 65 §2); no hardcoded hex in components (rule 30); focus is
  visible per the enumerated control-class table (rule 33) in **both** themes; `.dark` scope exists
  with light-mirror values (rule 34, dark values `needs-design`-gated); all UI strings via `t()`
  (rule 66 §5).
- The result-pane `error`/`cancelled` **rendering** is **not** shipped (only the three depicted
  states); the `needs-design` issue is filed and the rendering slice tagged `BLOCKED`. The
  error/cancelled **mapping** is built + tested headless in `operationStore`.
- Final WI (WI-9): full acceptance pass recorded in
  `dev-docs/verification/feature-2-<YYYYMMDD>.md`; row → `DONE`, then `VERIFIED` after the acceptance
  evidence lands.