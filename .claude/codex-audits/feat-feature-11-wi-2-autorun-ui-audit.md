---
branch: feat/feature-11-wi-2-autorun-ui
threadId: independent-claude-auditor
rounds: 2
final_verdict: ship-as-is
date: 2026-06-19
---

# Gate-4 audit — feature #11 WI-2 (auto-run UI: toggle / pending ring / AUTO tag / cost gate / paused / IME)

Independent separate-context Claude `auditor` (read-only, worktree); Codex quota-blocked (rule 48 via
subagent). Implemented in worktree `.claude/worktrees/feature-11` by a separate implementer agent.

## Diff (32 files, ~1348 insertions)
- `src/stores/autoRunStore.ts` (+test) — persisted `{enabled:Record<panel,bool>, costAck:Record<vendor,bool>}`
  under a NEW `lucid.autorun` key (no secrets), off by default, migrate + open-keyed defensive merge.
- `src/hooks/useAutoRunPanel.ts` (+test) — composes toggle / readiness / hosted cost gate / `armed` / paused.
- `src/components/autorun/{AutoRunToggle,AutoRunPendingChip,AutoRunCostDialog,AutoRunPausedBanner,AutoTag}.tsx` (+tests).
- `src/lib/workspace/{openSettings,runNowShortcut,platform}.ts` (+tests).
- Panel wiring: TranslatePanel/PolishPanel/DraftCard/OriginalCard (IME compose props, ⌘↵ run-now, scheduleRun),
  SettingsDialog (openSettings listener), index.css (`lucid-ring` keyframe), en/translation.json (+~20 keys).

## Round 1 — follow-up-recommended (0 Critical / 0 High / 1 Medium / 4 Low)

- **M1 (Medium) — cost gate bypassed on a vendor switch.** The cost gate was checked only at toggle time;
  `enabled` is per-panel and `costAck` per-vendor, and the live auto-fire path (panel → debounce.scheduleRun)
  never re-checked `costAck`. So enabling auto-run on Ollama/an acked vendor then switching the active vendor
  (Settings "Use for this workspace") to a different hosted, unacked vendor let the next keystroke fire paid
  calls with no ack for that vendor (rule 65 hole; local→hosted switch is the worst case).
  **FIXED (round 2):** `useAutoRunPanel` now exposes a reactive `armed = enabled && (!hosted || acked)`; both
  panels gate `scheduleRun` AND the IME re-arm on `armed`, not `enabled`. A switch to an unacked hosted vendor
  drops `armed`→false (auto-fire suppressed) and a `needsCostAck` effect re-opens the existing cost dialog for
  that vendor; `cancelCost` turns the panel off (no re-open loop). +5 tests.
- **L1** — `src/hooks/**` not in the coverage `include` (the hook tests are thorough regardless; the gated
  store IS 100%). Accepted (project-wide config change, out of scope).
- **L2** — the standalone `AutoRunPendingChip` `chip` variant is implemented + tested but only the `footer`
  variant is mounted. Accepted — footer-only is the deliberate consolidation (the footer shows the live ring +
  countdown + cancel-via-keystroke); noted here per the auditor's request.
- **L3** — `confirmCost` reads the vendor at click via getState (correct); a vendor change while the modal is
  open can't happen (modal blocks Settings). Accepted.
- **L4** — `isMacPlatform` uses a UA regex (deprecated `navigator.platform` avoided); miss → Ctrl vs ⌘ only. Accepted.

## Round 2 — CLEAN (0 Critical / 0 High / 0 Medium)

Re-audit of the M1 fix (commit `7d2175a`): suppression complete across both panels and both the onChange and
compositionEnd-re-arm paths (grep confirms no auto-fire path still gated on `enabled`); no re-prompt loop
(`cancelCost`→setEnabled(false)→needsCostAck false; `confirmCost`→ack→needsCostAck false; first-enable flow
inert); reactivity correct (primitive selector subscriptions, no render loop, no stale closure); no local-provider
regression (`armed===enabled` for local); rule-51 compliant (reuses the existing cost dialog — no new surface);
no key material read or leaked. Verdict: clean.

## Verdict: ship-as-is — round-2 clean, 0 open Critical/High/Medium (4 Low accepted/noted)
`pnpm check:all` green (lint + typecheck + 100% gated coverage + build); 38 tests across the touched files.
Gate 5 (final WI): browser-verified UI + the mocked-provider RTL suite — see PR + `dev-docs/verification/feature-11-20260619.md`.
