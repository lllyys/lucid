# 32 - Component Patterns

Standard patterns for UI components. Follow these for consistency. lucid composes
**shadcn/ui** primitives (Dialog, Popover, DropdownMenu, ScrollArea, etc.) styled
with **Tailwind v4** tokens. Prefer a shadcn primitive over hand-rolled markup.

## Single Source of Truth

Each component's styles must live in ONE place only. Duplicating styles across
files causes cascade hazards.

**Anti-pattern:**
- The same surface styled in both a shared stylesheet AND a component-local class
- Import/utility order determines which wins → "breaks later" bug

**Correct pattern:**
- A component's bespoke styles live ONLY with that component (its module, or a
  single shared token/utility layer).
- Don't redefine shadcn primitive styles in app-level CSS; extend via the
  component's own variants / `className` props.

## Overlay Surfaces (Dialog / Popover / Panel)

lucid surfaces — settings dialogs, the language/goal picker, provider config,
inline action popovers — are built on shadcn's `Dialog`, `Popover`, and
`DropdownMenu`. These handle portaling, focus trapping, positioning, and
dismissal for you. Do not re-implement positioning math by hand.

**Base surface pattern** (shared overlay tokens):

```css
.overlay-surface {
  padding: var(--popup-padding);              /* 6px */
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);            /* 8px */
  background: var(--bg-color);
  box-shadow: var(--popup-shadow);
  animation: overlay-fade-in 0.1s ease-out;
}

.overlay-surface--vertical {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

**Surface animation:**
```css
@keyframes overlay-fade-in {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Rules:**
- Compact padding (6px via `--popup-padding`)
- 1px border with `--border-color`
- Radius 8px (use `--radius-lg`)
- Shadow via `--popup-shadow`
- 0.1s fade-in animation
- Let shadcn own positioning, focus trap, and dismissal (Esc / outside click)

## Overlay Inputs

```css
.overlay-input {
  border: none;
  background: transparent;
  color: var(--text-color);
  outline: none;
  font-size: 12px;
  font-family: var(--font-sans);
}

.overlay-input:focus {
  outline: none;
  box-shadow: none;
  /* Focus indicated by caret only */
}

.overlay-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.5;
}

/* URL/path inputs */
.overlay-input--mono {
  font-family: var(--font-mono);
}

.overlay-input--full {
  width: 100%;
}
```

**Rules:**
- Borderless, transparent background
- No focus ring/outline - caret is the focus indicator
- 12px font size
- Mono font for URLs/paths (e.g. provider base URLs, API endpoints)

## Overlay Icon Buttons

```css
.overlay-icon-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);            /* 4px */
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.overlay-icon-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--text-color);
}

.overlay-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Focus: U-shaped underline */
.overlay-icon-btn:focus-visible {
  outline: none;
}

.overlay-icon-btn:focus-visible::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 4px;
  right: 4px;
  height: 4px;
  border-bottom: 2px solid var(--primary-color);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

/* Icon sizing */
.overlay-icon-btn svg {
  width: 14px;
  height: 14px;
}

/* Variants */
.overlay-icon-btn--primary:hover:not(:disabled) {
  color: var(--primary-color);
}

.overlay-icon-btn--danger:hover:not(:disabled) {
  color: var(--error-color);
}
```

## Action Buttons

```css
.action-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
}

.action-btn:active:not(:disabled) {
  background: var(--bg-secondary);
}

.action-btn:disabled {
  opacity: 0.4;
}

/* Active state: dot indicator */
.action-btn.active::before {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  background: var(--accent-primary);
  border-radius: 50%;
}

/* Focus: U-shaped underline */
.action-btn:focus-visible {
  outline: none;
}

.action-btn:focus-visible::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 4px;
  right: 4px;
  height: 4px;
  border-bottom: 2px solid var(--accent-primary);
  border-radius: 0 0 4px 4px;
}
```

## Dropdown Menu (shadcn DropdownMenu)

Use shadcn's `DropdownMenu` for menus (provider switcher, target-language
chooser, polish-goal chooser). Style its content/item slots with tokens:

```css
.menu-content {
  min-width: 180px;
  padding: 5px;
  background: color-mix(in srgb, var(--bg-color) 97%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--popup-shadow);
}

.menu-item {
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: default;
}

.menu-item:hover,
.menu-item[data-highlighted] {
  background: var(--primary-color);
  color: var(--contrast-text);
}

.menu-item .icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-item .icon svg {
  width: 14px;
  height: 14px;
}

.menu-separator {
  height: 1px;
  background: var(--border-color);
  opacity: 0.6;
  margin: 4px 0;
}
```

## Selection/Active States

**Always use tokens:**

```css
/* Correct */
.item.active {
  background: var(--accent-bg);
  color: var(--accent-primary);
}

/* Wrong - hardcoded */
.item.active {
  background: rgba(0, 102, 204, 0.1);
  color: #0066cc;
}
```

## Frame Ownership (Nested Containers)

When a wrapper exists, it owns the visual "frame" (background, border, radius).
Children are flat.

**Example: diff/result cards**

```css
/* CORRECT: Wrapper owns frame */
.result-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.result-card pre {
  background: transparent;
  border: none;
  border-radius: 0;
}

/* WRONG: Both layers have frames */
.result-card {
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}
pre {
  border-radius: var(--radius-md);  /* Conflicts! */
  background: var(--bg-secondary);   /* Double layer! */
}
```

**Rule:** When a wrapper provides the frame, inner `pre`/content must be flat.

## Scrollbars

```css
/* Global thin scrollbars (from index.css) */
::-webkit-scrollbar {
  width: 1px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

## Resize Handles

```css
.resize-handle {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  transition: background 0.15s;
}

.resize-handle:hover {
  background: var(--border-color);
}
```

## Z-Index Hierarchy

Prefer shadcn's built-in layering (it portals overlays and manages stacking).
When you must set z-index explicitly, keep it consistent:

| Layer | Z-Index | Components |
|-------|---------|------------|
| Base | 0-10 | Content, panels, resize handles |
| Floating | 50-60 | Inline result previews |
| Bars | 100-102 | Status bar, toolbar |
| Dropdown | 103 | Menu content |
| Popover | 1000 | Popovers, inline action surfaces |
| Dialog / Modal | 9999 | shadcn Dialog (portaled to body) |

**Notes:**
- shadcn Dialog/Popover portal to `body`; let the primitive manage stacking.
- Set explicit z-index only for app-level chrome (bars, custom overlays).

## File References

- Shared overlay/token styles: `src/styles/index.css`
- shadcn primitives: `src/components/ui/`
- App component styles: co-located with each component under `src/components/`
