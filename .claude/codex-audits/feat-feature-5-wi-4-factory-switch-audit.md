---
branch: feat/feature-5-wi-4-factory-switch
threadId: subagent-claude
rounds: 1
final_verdict: ship-as-is
date: 2026-06-15
---

# Gate-4 audit — feature #5 WI-4 (factory switch + activate openai/gemini/ollama)

Independent implementation audit of the WI-4 diff vs `main` — flips openai/gemini/ollama to
`implemented:true`, adds the Record-based `createProvider` vendor switch, the Ollama no-key path, and
the now-reachable ollama `isReady` branch. **This activates real API calls for three providers.**

Author/auditor separation (rule 48): implementing Claude authored; a fresh independent in-harness
`claude` subagent (read-only) audited (Codex unavailable — `subagent-claude`). It verified routing,
ran the suite (563 tests, 100%), and checked mock hygiene + the component-test updates.

## Round 1 — `subagent-claude` — CLEAN

**VERDICT: CLEAN** (zero Critical/High/Medium). 2 LOW (one is a tracked WI-6 follow-up, see below).

- **Factory routing**: Record keyed `Record<Vendor, () => VendorStreamFn>` (TS-exhaustive) — anthropic→
  anthropicStream; openai→openaiCompatibleStream @ `https://api.openai.com/v1`; ollama→
  openaiCompatibleStream @ `http://localhost:11434/v1` with `apiKey || 'ollama'`; gemini→geminiStream;
  custom→openaiCompatibleStream with baseUrl+model guards. Tests assert the exact URLs + streamed output.
- **Ollama no-key**: empty-key throw skipped for ollama; placeholder bearer `'ollama'` (ignored by
  Ollama); `isReady` returns true on model-only. Tested (build w/o key @ localhost; store readiness).
- **Empty-key guard**: openai/gemini/anthropic/custom still throw `invalidKey` without a key (tested).
- **Coverage honesty**: 100% (838/838). The unreachable-via-public-API defense-in-depth guards
  (createProvider `!isVendorImplemented`, store setVendor/isReady) are covered via
  `vi.spyOn(registry,'isVendorImplemented').mockReturnValue(false)` — legitimate (the only honest way to
  exercise a guard protecting against a future type-before-adapter vendor), not branch-filler. Build/
  stream tests assert real behavior (exact endpoint + streamed `{status:'done',text}`).
- **Mock hygiene**: all three spy tests restore (`finally`/inline `mockRestore`) — no test pollution.
- **Registry flip**: 3 flipped to implemented; defaults/fallbacks/allowAnyModel unchanged; header
  comment updated (rule 22).
- **Component tests**: the `toBeNull()`→`toBeInTheDocument()` flips honestly reflect activation — the
  old switcher/dialog always rendered `implementedPresentations()` dynamically; flipping the flag adds
  3 rows with no component change. Not papering over a regression.
- **Security**: no key logged; placeholder harmless; no vendor SDK in UI/feature code (all via createProvider).

### LOW findings

| # | file | issue | resolution |
|---|------|-------|------------|
| 1 | `SettingsDialog.tsx` (old) | Ollama ("Local") now lists in Settings, but the OLD dialog only offers an API-key input + "No key" — misleading for a no-key local provider, and no model/base-URL control. | **Tracked WI-6 follow-up.** The designed Ollama no-key card + per-vendor model picker ARE in the committed #29 bundle (`Lucid Workspace.dc.html`) and land in WI-6a/6b. Out of WI-4's (factory) scope; the auditor agrees it's not a code-correctness blocker. Until WI-6, Ollama is fully usable via the switcher (default llama3.2). |
| 2 | `providerPresentation.ts:42` | Registry now has 5 implemented vendors but the switcher lists 4 (custom excluded). | Informational — intentional + documented + tested (custom's config UI ships with WI-6b). No action. |

## Verdict

**ship-as-is.** Routing, no-key path, key guards, registry flip, security, coverage, and mock hygiene
all correct. The headless multi-provider layer is complete — OpenAI/Gemini/Ollama work behind the
single `LLMProvider` interface. The one LOW (Ollama Settings UX) is the WI-6 rebuild's job, design-covered.
