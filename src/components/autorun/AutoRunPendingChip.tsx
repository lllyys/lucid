import { useTranslation } from 'react-i18next'

/**
 * The debounce-pending countdown ring + label (feature #11, design Section B). The ring is PURE CSS
 * (`lucid-ring` keyframe over `stroke-dashoffset`) — the parent keys this component off the hook's
 * `pendingKey` so each reschedule remounts it and the animation restarts from full. There is NO
 * per-frame remainingMs state. `variant="footer"` is the compact in-source-footer placement; the
 * default is the standalone chip. The label shows the full debounce duration (the ring conveys the
 * live countdown visually); `onCancel` aborts the pending run.
 */
export function AutoRunPendingChip({
  debounceMs,
  pendingKey,
  onCancel,
  variant = 'chip',
}: {
  debounceMs: number
  pendingKey: number
  onCancel: () => void
  variant?: 'chip' | 'footer'
}) {
  const { t } = useTranslation()
  const seconds = (debounceMs / 1000).toFixed(1)
  const size = variant === 'footer' ? 14 : 16

  const ring = (
    <span className="relative block flex-none" style={{ width: size, height: size }} key={pendingKey}>
      <svg width={size} height={size} viewBox="0 0 16 16" className="block">
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--accent-border)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="37.7"
          transform="rotate(-90 8 8)"
          style={{ animation: `lucid-ring ${debounceMs}ms linear forwards` }}
        />
      </svg>
    </span>
  )

  if (variant === 'footer') {
    return (
      <span className="inline-flex items-center gap-2">
        {ring}
        <span className="font-mono text-[11px] font-medium text-[var(--accent-ink)]">
          {t('autorun.pendingShort', { seconds })}
        </span>
      </span>
    )
  }

  return (
    <div className="inline-flex items-center gap-2.5 self-start rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-3 py-2 shadow-sm">
      {ring}
      <span className="text-[12.5px] font-semibold text-[var(--accent-ink)]">
        {t('autorun.pending', { seconds })}
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-sm px-1 py-0.5 font-mono text-[10.5px] text-[var(--accent-ink)] hover:text-[var(--accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        aria-label={t('autorun.cancelPending')}
      >
        {t('autorun.cancel')}
      </button>
    </div>
  )
}
