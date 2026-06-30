# Lucid Session Task Read View — design bundle (feature #25 / GH #211)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-30 to unblock feature #25
(GH #211) — read a recorded session task. Resolves needs-design #212.

`project/...dc.html` is the committed depiction; this README distills the spec. The read view **mirrors the
Starred detail (#22)** — a read-only layer inside the Sessions sidebar — and the row's Open-in-workspace
affordance **reuses #24's `loadSource`**.

## The model (already built — this is the read/open surface)
`Task` stores `kind` (`translate`|`polish`), `title`, `sourceText`, `resultText` (`src/stores/sessionStore.ts`).
Today `TaskRow` (`SessionsView.tsx`) is a non-interactive `<div>` showing only the truncated title. This bundle
makes the row open a **read-only task detail** and adds a per-row **Open-in-workspace** affordance.

## Part A — the task row, now interactive
- The **whole row is one button**; tapping its **body opens the read view** (never overwrites the editor). A
  trailing **`›`** signals "opens a detail" (like the session rows).
- A **nested `↗` Open-in-workspace button** with **`stopPropagation`** loads the task back into the editor
  (reuses #24 `loadSource`). It appears on **hover / focus** on desktop and is **always present below 600px**
  (touch — a transparent pad keeps the hit target ≥ 44px). A stray tap on the body reads; only `↗` loads.
- Badges unchanged from the existing list: **`⇄`** = translate (carries direction), **`✦`** = polish.
- Row meta line: `Translate · 中→EN · 1.5s · 20m` / `Polish · 2.1s · 2m` (kind · direction[translate] · latency · age).

## Part B — the read view, translate task
- **Back link `‹ <session name>`** → returns to the **task list of the same session** (a layer inside the
  Sessions sidebar; the read view is NOT the editor).
- **Pinned header**: the `⇄` badge · "Translation" · "中 → EN" · "1.5s · 20m ago" (kind, direction, latency, age).
- **`Source · 中文`** block (on `--surface`) — full `sourceText`, Newsreader, **read-only**.
- **`Result · English`** block (on the canvas tint) — full `resultText`, **read-only**.
- **Sticky action row** (pinned at the bottom; body scrolls between header + this row): **`⧉ Copy`** (copies the
  **result** via the clipboard API) + **`Open in workspace ›`** (loads the task back into the editor via #24
  `loadSource`).
- Read view is **render-only — no edit affordances on the text**. Editing happens after Open-in-workspace.

## Part C — the read view, polish task
- Same back link + sticky action row. Header: `✦` · "Polished" · "2.1s · 2m ago".
- **`Original`** block — the original draft (`sourceText`).
- **`Polished`** block — the polished result (`resultText`).
- **`Keywords kept`** — chips of the keywords the run preserved (the polish trio: original / polished / keywords).

## States depicted
row (resting / hover→`↗` / focus / polish) · read-view translate (中→EN) · read-view polish (EN) ·
**long · mid-scroll** · **result not saved · interrupted run** (missing `resultText`) · **RTL** (Arabic source,
`dir=rtl`, "نسخ" / "فتح في مساحة العمل ‹") · **CJK char-level row truncation** · **dark** · **phone** (read view
over the drawer).

## Token / behavior mapping (design → codebase)
`--ink`→`--text-color`, `--t4/5`→tertiary text, `--accent-ink`→accent/focus, `--surface`→`--bg-color`,
`--canvas`→canvas tint. Copy = `navigator.clipboard.writeText(resultText)`. Open-in-workspace = #24
`loadSourceIntoWorkspace` (loads the source into the editor; lands in translate per #24's established behavior —
the exact source/result population is a Gate-1 decision). Back navigation = local read-view state inside
`SessionsView` (mirrors the session-detail toggle).

## Relates
#22 (Starred detail — the read-view pattern) · #24 (Open in workspace / `loadSource`) · #3/#19 (Sessions sidebar
chrome) · #14 (auto-record — populates tasks) · #9/#21 (sync — restores them). Refs #211 · #212 (this design).
