# Bugs

Bug tracker for lucid. Lifecycle: `OPEN → IN PROGRESS → FIXED → VERIFIED` (`REOPENED` for
regressions). One row per bug; expanded repro/expected/actual below the table.

| ID | Title | Status | Severity | Notes |
|----|-------|--------|----------|-------|
| 1 | session/task/term ids collide after reload (in-memory counter not reconciled with persisted state) | FIXED | high | Counter-based `genId` resets to 0 each load → re-issued live ids after rehydration. Also blocked #9 sync (counter ids aren't globally unique → cross-device collision). Fixed v0.6.12 (PR #67): prod mints `${prefix}_${randomUuid()}` (`src/lib/uuid.ts` — `crypto.randomUUID` + insecure-context `getRandomValues` fallback); test seams keep deterministic counters. Also fixed the mirror hook's column parse (was a no-op). Gate-4 CLEAN (2-round Codex). GH: #55 |
| 2 | Provider Settings dialog content clipped — right detail pane (test-connection card/button, API-key input, stat tiles, privacy note) sheared off | FIXED | medium | The 880px-designed SettingsDialog renders clamped: the shared `DialogContent` base className ends with `sm:max-w-lg` (512px), which tailwind-merge won't reconcile against SettingsDialog's unprefixed `max-w-[880px]` (different variant group), so at ≥640px viewports `sm:max-w-lg` wins and `overflow-hidden` shears the right pane. NOT a feature-#9 regression (`dialog.tsx`/`SettingsDialog.tsx` predate the sync work). Same latent cap on `SyncSettingsDialog` (`max-w-[520px]`≈512px, not visibly clipped). **Fixed v0.7.1:** `sm:`-scoped all 3 DialogContent width overrides (`sm:max-w-[880px]`/`[520px]`/`[420px]`) so tailwind-merge keeps them over the base `sm:max-w-lg` — fixed at the call site, primitive untouched (rule 32); + a regression test asserting the merged class; verified via headless-Chromium CDP (dialog 880px, `clipped:false`). Gate-4 CLEAN (independent Claude auditor). GH: #90 |
| 3 | Provider switcher mislabels the active Custom provider as "Anthropic" (Custom absent from the toolbar switcher) | FIXED | medium | `implementedPresentations()` (`src/lib/providers/providerPresentation.ts:42`) excludes `custom` from the toolbar list (`… && p.vendor !== 'custom'`), and `ProviderSwitcher` (`:24`) does `providers.find(p=>p.vendor===vendor) ?? providers[0]` → when `vendor==='custom'`, `find`→undefined → falls back to `providers[0]`=Anthropic. So the trigger shows "Anthropic" while the active provider is Custom (footer correctly says "sent to Custom"), and Custom isn't selectable from the dropdown (a one-way trap — can't return to Custom from the toolbar). **Display bug only** — runs still route to the real `vendor` (Custom). Fix: use `presentationFor(vendor)` (full map, incl. custom) for the active trigger label/dot instead of the `?? providers[0]` fallback; adding a Custom dropdown ROW may be rule-51 design-gated. GH: #93 |
| 4 | Polish result shows the model's prose (preamble + "Changes made:" list) instead of only the polished text — pollutes Result + the Compare word-diff | FIXED | medium | The polish prompt already says "Return only the transformed text, with no commentary" (`STRUCTURE_INSTRUCTION`, `src/lib/prompts/index.ts:63`, both plain+reference modes), but the model added a preamble + a quoted sentence + a "Changes made:" markdown list anyway (non-compliance), and lucid renders the raw output. Worse: `PolishResult.tsx:43` computes `wd.diff(draft, text)` over the FULL prose → the Compare word-diff (and Accept) is built against prose, not the clean sentence. Fix: strengthen the prompt (forbid preamble/quotes/changes-list) and/or strip a leading preamble + trailing changes-section before diff/display; the structured changes already live in the Compare tab. GH: #96 |
| 5 | "Test connection" reports "cut off / incomplete" for a working OpenAI-compatible endpoint (e.g. DeepSeek) | OPEN | medium | A real translation through **Custom** (DeepSeek — `https://api.deepseek.com`, `deepseek-v4-flash`, valid key) succeeds + streams, but **Settings → Custom → Test connection** → "Failed — The response was cut off before it finished." Root cause: the probe (`src/lib/providers/testConnection.ts:36`) calls `stream(PROBE_REQUEST, { …, maxOutputTokens: 1 })`; an OpenAI-compatible endpoint then returns `finish_reason: 'length'`, which `src/providers/openaiCompatibleProvider.ts:102` maps to `makeProviderError('incomplete')` → the probe's `catch` returns `{ ok:false, kind:'incomplete' }`. A 1-token-capped response **proves connectivity** (reachable + key valid — the real run works); reasoning models (`deepseek-v4-flash`) make it worse (the single token is spent on hidden reasoning → no visible first byte before the cap throws). Fix: treat an `incomplete`/`length` probe outcome as a successful connection (catch it in `probeProvider` → `{ ok:true }`) and/or raise the probe's `maxOutputTokens`. Affects all OpenAI-compatible endpoints; interacts with feature #10 (per-custom connection test reuses this probe). GH: #126 |

## Open Bug Details

### Bug #1 — session/task/term ids collide after reload

**Repro:** create a session + task (gets `s1`, `t2`), reload the page (zustand rehydrates them), click "new session". `genId` restarts its module counter at 0, so it re-issues `s1` — now two sessions share an id.

**Expected:** every session/task/term id is unique and stable across reloads (and across devices, for #9 sync).

**Actual:** `renameSession`/`deleteSession`/`addTask` match by id, so an operation on one `s1` hits both. Data-integrity bug. Surfaced by the Gate-4 audit of feature #9 WI-1a.

**Root cause:** `src/stores/sessionStore.ts` + `src/stores/glossaryStore.ts` mint ids from a module-level counter (`let idSeq = 0; genId = …${++idSeq}`) that is not persisted/reconciled on rehydrate. (`polishKeywordsStore` is unaffected — its ids are value-derived since WI-1c.)

**Fix:** mint globally-unique ids with `crypto.randomUUID()` in production (collision-free across reloads AND devices); the existing `__resetSessionIds`/`__resetGlossaryIds` test seams install a deterministic counter so tests keep stable ids.

### Bug #2 — Provider Settings dialog content clipped on the right

**Repro:** on a desktop viewport (≥640px), click **Settings** (top-right). The provider Settings dialog opens with its right detail pane clipped at the dialog's right edge — the "Not tested" test-connection card's button, the right portion of the "Paste your key…" API-key input, the LAST + RATE stat tiles, and the "Held in memory…" privacy note are sheared off.

**Expected:** the dialog renders at its 880px design width (252px left rail + ~628px right pane); all right-pane content (test card + button, full key input, both stat-tile columns, privacy note) is fully visible.

**Actual:** the dialog is clamped well below 880px and the right pane is cut off by the DialogContent's `overflow-hidden`.

**Root cause (hypothesis):** `src/components/ui/dialog.tsx` `DialogContent` base className ends with `… sm:max-w-lg` (32rem / 512px). `SettingsDialog` (`src/components/workspace/SettingsDialog.tsx:101`) passes `className="max-w-[880px] …"` (unprefixed). `cn()`/tailwind-merge reconciles same-variant `max-w-*` (so the base unprefixed `max-w-[calc(100%-2rem)]` → `max-w-[880px]`) but does NOT merge the `sm:`-prefixed `sm:max-w-lg` against the unprefixed override. At ≥640px the `sm:max-w-lg` media-query rule wins → the dialog caps at ~512px → the 880px two-pane content overflows and `overflow-hidden` clips it. Likely fix (for /fix-issue): override at the same variant — `sm:max-w-[880px]` on `SettingsDialog` — or drop `sm:max-w-lg` from the shared `DialogContent` base so callers' `max-w-*` wins. The same latent cap affects the new `SyncSettingsDialog` (`max-w-[520px]` ≈ 512px, so not visibly clipped); fixing the shared primitive covers both.

**Not a regression from feature #9:** `dialog.tsx` was last changed by `40b3420` (feature #4 WI-1) and `SettingsDialog.tsx` by feature #5 (#6) — both predate the WI-9 sync work. The clipping has existed since the 880px SettingsDialog redesign; the sync work neither introduced nor touched it.

### Bug #3 — Provider switcher mislabels the active Custom provider

**Repro:** Settings → select **Custom** → configure base URL + model + key → **Use for this workspace** (active vendor → `custom`) → close Settings → look at the toolbar provider switcher (top-right) + its dropdown.

**Expected:** the switcher trigger shows **Custom** (custom dot), consistent with the footer ("Your text is sent to Custom to be processed"); Custom is visible/returnable from the switcher.

**Actual:** the trigger shows **"Anthropic"** (Anthropic dot) though Custom is the active provider (footer confirms Custom); the dropdown lists only Anthropic / OpenAI / Google / Local — **no Custom** — so you can't switch back to Custom from the toolbar (only via Settings). A one-way trap.

**Root cause:** `src/lib/providers/providerPresentation.ts:41-43` — `implementedPresentations()` filters `… && p.vendor !== 'custom'`, deliberately excluding Custom from the toolbar switcher list (rationale: Custom has no fixed model / needs a base URL → configured in Settings). `src/components/workspace/ProviderSwitcher.tsx:24` — `const active = providers.find((p) => p.vendor === vendor) ?? providers[0]`: for `vendor === 'custom'`, `find` returns `undefined` → the `?? providers[0]` fallback substitutes the first list entry (Anthropic) for the trigger label + dot. **Display-only** — `usePanelRun` + the footer read the real `vendor`, so runs still route to Custom; only the switcher label is wrong.

**Fix direction (for /fix-issue):** use `presentationFor(vendor)` (the full `PROVIDER_PRESENTATION` map includes `custom`) for the active trigger label/dot when the active vendor isn't in the switcher list, instead of the `?? providers[0]` fallback — a straight bug fix that adds no new surface. Whether to also add Custom as a selectable dropdown row (so users can switch back from the toolbar) is a separate design decision and may be rule-51 design-gated. The `provider.custom` i18n key already exists.

### Bug #4 — Polish result includes the model's prose instead of only the polished text

**Repro:** Polish a draft (e.g. "i dont want to setup another server for persistence.") → POLISHED → **Result** tab.

**Expected:** Result shows ONLY the polished sentence ("I don't want to set up another server for persistence."); the changes are surfaced via the **Compare** word-diff (which already exists).

**Actual:** Result shows the model's full prose — a "Here is the improved sentence:" preamble, the sentence in quotes, and a "Changes made:" markdown bullet list.

**Why it's worse than cosmetic:** `src/components/polish/PolishResult.tsx:43` computes `wd.diff(draft, text)` over the FULL model output, so the prose pollutes the **Compare** word-diff too (and **Accept**, which commits `applyDiff` over the kept segments) — not just the Result text.

**Root cause:** the polish prompt already instructs clean output (`STRUCTURE_INSTRUCTION` = "Return only the transformed text, with no commentary", `src/lib/prompts/index.ts:63`, in both plain mode (line 95) and reference mode (line 114)); the model ignored it and added prose, and lucid renders the raw output with no hardening — so a non-compliant model's preamble/explanation leaks into the result and the diff.

**Fix direction:** strengthen the polish prompt (explicitly forbid a preamble, surrounding quotes, and any "changes/explanation" list) and/or post-process to strip a leading preamble + a trailing "Changes made:"-style section before diffing/displaying, so a non-compliant model still yields a clean Result + a correct Compare diff. Keep prompt builders versioned/tested (rule 65 §7). The structured "changes via other means" the user asked for already exists as the **Compare** tab — once the Result text is clean, that diff becomes correct.

### Bug #5 — "Test connection" fails on a working OpenAI-compatible endpoint

**Repro:** Settings → **Custom**: Base URL `https://api.deepseek.com`, Model `deepseek-v4-flash`, paste a valid key → Translate something (it streams successfully, proving the endpoint + key work) → click **Test connection**.

**Expected:** Test connection → **Connected** (with a latency reading). The probe verifies reachability + auth; a real run already succeeds.

**Actual:** Test connection → **Failed — "The response was cut off before it finished."** (the `error.incomplete` message).

**Root cause:** `probeProvider` (`src/lib/providers/testConnection.ts:36`) sends `stream(PROBE_REQUEST, { signal, timeoutMs, maxOutputTokens: 1 })` to stay minimal, and `break`s on the first chunk. But with `maxOutputTokens: 1` an OpenAI-compatible endpoint returns `finish_reason: 'length'`, which `src/providers/openaiCompatibleProvider.ts:102` maps to `ProviderException(makeProviderError('incomplete', { detail: 'length' }))`. When the cap is hit before any visible byte arrives — the norm for a reasoning model like `deepseek-v4-flash`, whose single allotted token is consumed by hidden reasoning — the `incomplete` error throws before the loop's `break`, so the `catch` returns `{ ok:false, kind:'incomplete' }`. Hitting the self-imposed 1-token cap is *expected* and proves the endpoint responded; classifying it as a connection failure is the bug.

**Fix direction (for /fix-issue):** in `probeProvider`, treat an `incomplete` outcome (or specifically `detail:'length'`, the self-induced cap) as a **successful** connection — connectivity + auth are what the probe checks, not completion; and/or raise the probe's `maxOutputTokens` so a real first byte arrives before the cap. Add a regression test (mock the transport to end with `finish_reason: 'length'` → assert `{ ok:true }`). Note: feature #10 (custom providers) adds a per-custom connection test that reuses this same probe — the fix benefits both.
