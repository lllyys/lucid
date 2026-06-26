# Lucid Word-lookup Popover — design bundle (feature #20)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-26 to unblock the
design-gated UI of feature #20 (GH #164) — the click-a-word dictionary popover. Resolves needs-design #166.

## What it depicts

The **word-lookup popover** — the surface that opens when a user clicks a word in a rendered text pane
(translate result, polish original/draft/result). For the clicked word in its sentence context it shows the
**translation**, **pronunciation (IPA)**, and **in-context meaning**, plus a **play button** (speak the word
aloud). Includes the popover's states (loading / loaded / playing / no-audio / error / long-word), light +
dark, responsive (popover on desktop, bottom-sheet on phone), and RTL.

## Status
The #20 headless logic (provider `define`/lookup request kind + prompt, CJK/RTL word segmentation, browser
SpeechSynthesis wrapper) is design-independent and built/TDD'd through the feature workflow. This bundle
covers the rendering layer (the popover + its states). Full spec is distilled at implementation time.

## Notes
- `project/...dc.html` is the depiction; `project/support.js` is the shared framework.
- Reuses the workspace palette (light + dark) — map design tokens to the codebase (`--ink`→`--text-color`,
  `--surface`→`--bg-color`, `--accent`→`--accent-primary`, `--shadow-c*`→`--shadow-*`, etc.).
- Refs #164 (feature #20), #166 (this design request).
