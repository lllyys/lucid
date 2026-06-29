import { useTranslation } from 'react-i18next'
import { useStarredStore, type StarredInput, type StarredItem } from '@/stores/starredStore'

/**
 * The star toggle (feature #22, WI-3 — design Section A). One control, two scales: `icon` (30px,
 * in the lookup-popover header) and `pill` (labelled, on the translate/polish result toolbars).
 * not-starred (outline ☆, "Star") ⇄ starred (filled ★, "Starred"); clicking a starred control
 * unstars. `aria-pressed` carries the state and the label flips. Starred state is reflected by a
 * content scan of the store's `items` (mirroring the store's own dedupe tuple — NOT by id), so a
 * re-open of the same lookup/result reads as already-starred. Token-driven; visible accent focus
 * ring; the star-pop is motion-safe (honours reduced-motion). Consumes `useStarredStore` only —
 * the store is shipped + sync-wired and is never mutated here beyond star()/unstar().
 */
export type StarVariant = 'icon' | 'pill'

/** Same tuple the store's `sameContent` dedupes on — kind + source + context + direction. */
function matchesInput(item: StarredItem, input: StarredInput): boolean {
  return (
    item.kind === input.kind &&
    item.source === input.source &&
    item.context === input.context &&
    item.sourceLang === input.sourceLang &&
    item.targetLang === input.targetLang
  )
}

const ICON_BASE =
  'relative flex size-[30px] items-center justify-center rounded-[9px] border text-[16px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]'
const ICON_OFF =
  'border-[var(--border-strong)] bg-[var(--bg-color)] text-[var(--text-tertiary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-ink)]'
const ICON_ON = 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-ink)]'

const PILL_BASE =
  'inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[12px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]'
const PILL_OFF =
  'border-[var(--border-strong)] bg-[var(--bg-color)] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-ink)]'
const PILL_ON = 'border-[var(--accent-border)] bg-[var(--accent-bg)] font-semibold text-[var(--accent-ink)]'

export function StarButton({ input, variant = 'pill' }: { input: StarredInput; variant?: StarVariant }) {
  const { t } = useTranslation()
  const starred = useStarredStore((s) => s.items.some((i) => matchesInput(i, input)))

  const toggle = () => {
    const { items, star, unstar } = useStarredStore.getState()
    const match = items.find((i) => matchesInput(i, input))
    if (match) unstar(match.id)
    else star(input)
  }

  const label = starred ? t('starred.starred') : t('starred.star')
  // key flips on toggle so the pop replays; motion-safe honours prefers-reduced-motion.
  const glyph = (
    <span
      key={starred ? 'on' : 'off'}
      aria-hidden
      className={starred ? 'motion-safe:[animation:lucid-star-pop_0.32s_ease-out]' : undefined}
    >
      {starred ? '★' : '☆'}
    </span>
  )

  if (variant === 'icon') {
    return (
      <button
        type="button"
        aria-pressed={starred}
        aria-label={label}
        onClick={toggle}
        className={`${ICON_BASE} ${starred ? ICON_ON : ICON_OFF}`}
      >
        {glyph}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={starred}
      onClick={toggle}
      className={`${PILL_BASE} ${starred ? PILL_ON : PILL_OFF}`}
    >
      <span className="text-[14px]">{glyph}</span>
      {label}
    </button>
  )
}
