# Lucid Polish Clear-input — design bundle (feature #23)

Committed handoff from the `claude.ai/design` project **lucid**
(`22b34402-6cc0-4011-8089-b2832b9356ec`), imported via the DesignSync MCP on 2026-06-29 to unblock feature #23
(GH #198) — a Clear button on the polish input pane. Resolves needs-design #199.

`project/...dc.html` is the committed depiction (header + the verbatim implementation-spec table); this README
distills the spec. A parity element — it mirrors the translate **source** Clear exactly.

## Implementation spec (from the design board)
- **Placement** — in the `OriginalCard` header, **leading the right-side control group** (before the
  `LookupToggle` and the `LanguagePicker`).
- **Appearance** — a borderless text button, Geist 12px. Resting `--t5` → hover `--ink`; focus-visible ring
  `--accent-ink`. **Identical to the translate source Clear** (`TranslatePanel.tsx`).
- **Visibility** — shown only when `value.trim()` is non-empty; hidden when empty (the `LookupToggle` goes
  disabled alongside, as today). Disabled-at-40% is an acceptable alternative if hiding causes header reflow.
- **Behavior** — wipes the Original input, then **resets the dependent draft / polish operation state** (parity
  with the translate source `clear()`), and **returns focus to the Original textarea**.
- **Copy** — new i18n key `polish.clear` (reuse the `translate.clear` string value). Localized + mirrored RTL
  (the design shows "مسح" with the header mirrored under `dir=rtl`).

## States depicted (7)
default (text → Clear shown) · empty (Clear hidden, lookup toggle disabled) · hover (→ `--ink`) · focus (ring
`--accent-ink`) · dark · RTL (Arabic, header mirrors) · phone portrait (single-row header, ≥44px hit area).

## Token mapping (design → codebase)
`--ink`→`--text-color`, `--t5`→`--text-tertiary` (the translate Clear's resting token), `--accent-ink`→the
accent focus token, `--surface`→`--bg-color`, `--border*`→border tokens. Reuse the translate source Clear's exact
classes/handler shape so the two panes stay consistent.

## Distinct from #18
#18 was the polish-**goal** selector (Clarity/Grammar/Tone/Concise). This is a Clear-**text** button on the
polish input. Refs #198 (feature #23), #199 (this design request); mirrors the translate source Clear.
