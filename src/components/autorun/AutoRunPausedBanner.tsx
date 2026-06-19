import { useTranslation } from 'react-i18next'
import { openSettings } from '@/lib/workspace/openSettings'

/**
 * The "Auto-run paused" warning (feature #11, design Section D — "was on · provider went unready").
 * Shown when auto-run is enabled but the provider lost its key/endpoint: the toggle + text are kept,
 * nothing fires silently, and "Fix" routes to Settings. Tokens + t() only.
 */
export function AutoRunPausedBanner() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[13px] border px-4 py-3.5"
      style={{ borderColor: 'var(--warning-border)', background: 'var(--warning-bg)' }}
    >
      <span
        aria-hidden
        className="mt-px flex size-[22px] flex-none items-center justify-center rounded-[7px] border border-[var(--warning-border)] bg-[var(--bg-color)] text-[12px] text-[var(--warning)]"
      >
        ⚠
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-[var(--warning)]">{t('autorun.paused.title')}</span>
        <span className="text-[12px] leading-[1.55] text-[var(--text-secondary)]">{t('autorun.paused.body')}</span>
      </div>
      <button
        type="button"
        onClick={() => openSettings()}
        className="flex-none rounded-[9px] border border-[var(--warning-border)] bg-[var(--bg-color)] px-3.5 py-2 text-[12px] font-semibold text-[var(--warning)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
      >
        {t('autorun.paused.fix')}
      </button>
    </div>
  )
}
