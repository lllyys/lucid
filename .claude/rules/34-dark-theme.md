# 34 - Dark Theme Rules

All styling must work in both light and dark themes.

## Theme Mechanism

lucid uses **Tailwind v4's `class` dark-mode strategy**. Dark mode is toggled by
adding a `dark` class to the root element (`<html>`); Tailwind's `dark:` variant
then applies the dark styles, and CSS custom properties (design tokens) are
redefined under the `.dark` scope.

```tsx
// Toggle via the root element
document.documentElement.classList.toggle("dark", isDark);
```

```css
/* Tokens defined for light, overridden under .dark */
:root {
  --bg-color: #ffffff;
  --text-color: #1a1a1a;
}

.dark {
  --bg-color: #1e1e1e;
  --text-color: #e6e6e6;
}
```

Because tokens carry the theme, most components need **no** explicit dark rules —
they read `var(--bg-color)` / `var(--text-color)` and adapt automatically.

## How to Write Dark-Aware Styles

| Approach | When | Example |
|----------|------|---------|
| Token-driven (preferred) | Almost always | `background: var(--bg-color)` |
| Tailwind `dark:` variant | Utility-level overrides in JSX | `class="bg-white dark:bg-zinc-900"` |
| `.dark` CSS override | Effects tokens can't express (shadows, custom rgba) | `.dark .popup { box-shadow: ... }` |

**Rule:** Prefer tokens. Reach for the `dark:` variant only for one-off utility
tweaks, and a `.dark` CSS override only for visual effects a token can't model.
Never use attribute selectors like `[data-theme]` for theming.

## When Overrides Are Needed

Most cases should NOT need overrides if using tokens correctly:

```css
/* No override needed - token handles it */
.component {
  background: var(--bg-color);        /* Automatically correct in dark */
  color: var(--text-color);           /* Automatically correct in dark */
  border-color: var(--border-color);  /* Automatically correct in dark */
}
```

**Override only when:**
1. Using `rgba()` values that need different opacity in dark
2. Using specific visual effects (shadows, glows)
3. Adjusting contrast for readability

## Common Dark Theme Patterns

### Shadows
```css
.popup {
  box-shadow: var(--popup-shadow);
}

.dark .popup {
  box-shadow: var(--popup-shadow-dark);
}
```

### Hover States

**Prefer tokens over hardcoded rgba:**

```css
/* CORRECT - uses token */
.item:hover {
  background: var(--hover-bg);
}

/* WRONG - hardcoded rgba bypasses theme system */
.item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.dark .item:hover {
  background: rgba(255, 255, 255, 0.06);  /* Extra maintenance burden */
}
```

**Only use raw rgba when:**
1. The token doesn't exist yet (file an issue to add it)
2. You need a non-standard opacity for a specific visual effect

**Scrollbar colors:**
```css
/* CORRECT - tokens adapt to theme */
::-webkit-scrollbar-thumb {
  background: var(--border-color);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

### Diff Highlights
```css
.diff-added {
  background: rgba(46, 160, 67, 0.15);
}

.dark .diff-added {
  background: rgba(46, 160, 67, 0.25);
}
```

### Subtle Backgrounds
```css
.subtle-bg {
  background: rgba(0, 0, 0, 0.02);
}

.dark .subtle-bg {
  background: rgba(255, 255, 255, 0.03);
}
```

## Tokens with Built-in Dark Support

These tokens are redefined under the `.dark` scope (in `index.css`) and switch
automatically when the `dark` class is present on the root:

| Token | Light | Dark |
|-------|-------|------|
| `--bg-color` | Theme-specific | Theme-specific |
| `--text-color` | `#1a1a1a` | Light text |
| `--text-secondary` | `#666666` | `#858585` |
| `--border-color` | `#d5d4d4` | Darker border |
| `--selection-color` | Blue tint | Cyan tint |
| `--accent-bg` | Blue 10% | Blue 12% |
| `--accent-primary` | Blue | Brighter blue |
| `--error-color` | `#cf222e` | `#f85149` |
| `--error-bg` | `#ffebe9` | Red 15% |

### Status / Feedback Tokens

Status surfaces (translation success, provider error, polish warning) use
centralized dark tokens (defined in `index.css`):

| Light Token | Dark Token |
|-------------|------------|
| `--status-info` | `--status-info-dark` (#58a6ff) |
| `--status-success` | `--status-success-dark` (#3fb950) |
| `--status-warning` | `--status-warning-dark` (#d29922) |
| `--status-error` | `--status-error-dark` (#f85149) |

**Pattern for dark status backgrounds:**
```css
.dark .status-info {
  --status-border: var(--status-info-dark);
  --status-bg: color-mix(in srgb, var(--status-info-dark) 8%, transparent);
}
```

## Testing Requirements

1. **Visual check in both themes** before committing CSS changes
2. **Use reference document** - open `dev-docs/css-reference.md` to verify all elements
3. **Contrast ratio** - text must be readable (WCAG AA: 4.5:1)
4. **Focus indicators** - must be visible in dark theme
5. **Shadows** - verify depth perception works in dark
6. **Compare screenshots** - check against `dev-docs/archive/screenshots/` baselines (gitignored)

## Avoiding Common Mistakes

```css
/* WRONG: Hardcoded color won't adapt */
.component {
  background: #f5f5f5;
}

/* CORRECT: Token adapts automatically */
.component {
  background: var(--bg-secondary);
}

/* WRONG: White text hardcoded */
.active-item {
  color: white;
}

/* CORRECT: Inverts properly */
.active-item {
  color: var(--bg-color);
}
```

## Migration Checklist

When fixing old code:
- [ ] Replace any attribute/legacy theme selector with the `.dark` class scope
- [ ] Replace hardcoded colors with tokens
- [ ] Add a `.dark` override (or `dark:` utility) only if using `rgba()`/effects
- [ ] Test both themes visually
