import { useTranslation } from 'react-i18next'

/**
 * The quiet AUTO chip shown in the streaming/result chrome when the active op was auto-triggered
 * (feature #11, design Section C). Identical streaming chrome otherwise — only this tag tells the
 * user "auto-run triggered this, not me". A manual run (isAuto=false) renders nothing.
 */
export function AutoTag({ isAuto }: { isAuto: boolean }) {
  const { t } = useTranslation()
  if (!isAuto) return null
  return (
    <span
      role="status"
      aria-label={t('autorun.tagAria')}
      className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--accent-border)] bg-[var(--accent-bg)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-ink)]"
    >
      {t('autorun.tag')}
    </span>
  )
}
