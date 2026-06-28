import { useTranslation } from 'react-i18next'

/**
 * The ⌕ lookup-mode toggle for an editable pane header (feature #169, WI-4 — design bundle
 * `dev-docs/designs/lucid-word-lookup-editable/` §B). Latches word-lookup on for the pane's
 * mirror overlay (and is the discoverable TOUCH entry point); the Alt-click path is the invisible
 * power-user equivalent. A toggle BUTTON (`aria-pressed`), deliberately NOT `role="switch"` — the
 * translate/polish pane headers already own an AutoRunToggle switch, and a second switch would
 * collide with their `getByRole('switch')` queries. Greyed + disabled when the field is empty
 * (design §D — nothing to look up). Tokens only; visible focus ring (rule 33); dark-theme parity
 * via tokens.
 */
export function LookupToggle({
  active,
  disabled,
  onToggle,
}: {
  active: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const label = active ? t('lookup.editable.toggleOn') : t('lookup.editable.toggle')
  const aria = active ? t('lookup.editable.toggleAriaOn') : t('lookup.editable.toggleAria')
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={aria}
      title={aria}
      disabled={disabled}
      onClick={onToggle}
      className={`flex items-center gap-1 rounded-md px-2 py-[5px] font-mono text-[11px] font-medium uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-ink)]'
          : 'border bg-[var(--bg-color)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-color)]'
      }`}
    >
      <span aria-hidden>⌕</span>
      <span>{label}</span>
    </button>
  )
}
