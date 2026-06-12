# 30 - UI Consistency

> See detailed specs in `dev-docs/design-system.md`.

lucid's UI is built on **Tailwind v4** + **shadcn/ui**. Design tokens live as CSS
custom properties wired into the Tailwind theme; components compose Tailwind
utilities over shadcn primitives. Never reach for a vendor or one-off styling
path when a token or shadcn primitive already covers the case.

## Core Principles

- Design system first — reach for an existing token or shadcn primitive before adding new CSS.
- Preserve established patterns and visual language.
- Prefer incremental adjustments over redesigns unless requested.
- Keep behavior consistent across surfaces (editor pane vs diff/result pane).

## Quick Rules

1. **Use tokens first** - Never hardcode colors. Use Tailwind theme tokens / CSS vars. See `31-design-tokens.md`.
2. **Follow component patterns** - See `32-component-patterns.md`.
3. **Focus must be visible** - See `33-focus-indicators.md` (accessibility).
4. **Dark theme parity** - See `34-dark-theme.md`.

## Summary (Details in Sub-Rules)

- **Overlay surfaces** (shadcn dialog/popover/panel): 1px border, `--radius-lg` (8px), `--popup-shadow`, compact padding.
- **Overlay inputs**: Borderless, no outline. Focus = caret only.
- **Overlay buttons**: Focus = U-shaped underline via `::after`, not rings.
- **Selection states**: Use `--accent-bg` + `--accent-primary`.
- **Hover states**: Use `--hover-bg` or `--bg-tertiary`.
- **Dark mode**: Use Tailwind's `dark:` variant (`class` strategy), not attribute selectors.
