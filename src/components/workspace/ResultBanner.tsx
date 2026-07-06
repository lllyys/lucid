import { useTranslation } from 'react-i18next'
import { isRetryableError } from '@/providers/errors'
import type { ErrorKind, ProviderError } from '@/providers/types'

/**
 * Error / cancelled banner for the translate + polish result panes (feature #4, WI-5 — #14).
 * Renders the panel op's ALREADY-normalized ProviderError (mapping lives in streamOp; the store
 * preserves it) as a localized title + body — NEVER error.detail (rule 65 §4/§5). Retry shows
 * only for a retryable error that produced NO partial output (`isRetryableError(error) &&
 * !hasPartial`); once bytes streamed, the user uses Regenerate instead (no replay — rule 65 §4,
 * plan v4 §1). A cancelled op shows a neutral "Stopped" with no Retry. Partial text stays visible
 * in the pane regardless (rule 65 §3) — this banner sits beside it.
 */

// Exhaustive by construction: a new ErrorKind without a title is a compile error (v4 §6).
const TITLE_KEY: Record<ErrorKind, string> = {
  rateLimited: 'banner.rateLimited.title',
  providerDown: 'banner.providerDown.title',
  unreachable: 'banner.unreachable.title',
  invalidKey: 'banner.invalidKey.title',
  requestFailed: 'banner.requestFailed.title',
  timeout: 'banner.timeout.title',
  aborted: 'banner.aborted.title',
  refusal: 'banner.refusal.title',
  incomplete: 'banner.incomplete.title',
  validation: 'banner.validation.title',
  unknown: 'banner.unknown.title',
}

export function ResultBanner({
  status,
  error,
  hasPartial,
  onRetry,
}: {
  status: 'error' | 'cancelled'
  error?: ProviderError
  hasPartial: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const cancelled = status === 'cancelled'
  const title = cancelled ? t('banner.stopped.title') : t(TITLE_KEY[error?.kind ?? 'unknown'])
  const body = cancelled ? t('banner.stopped.body') : t(error?.messageKey ?? 'error.unknown')
  const showRetry = !cancelled && !!error && isRetryableError(error) && !hasPartial

  return (
    <div
      role="status"
      className="mt-3 flex items-start gap-2.5 rounded-[11px] border px-3 py-2.5"
      style={{
        borderColor: cancelled ? 'var(--border-color)' : 'var(--danger-border)',
        background: cancelled ? 'var(--bg-canvas)' : 'var(--error-bg)',
      }}
    >
      <span aria-hidden className="text-[14px] leading-tight" style={{ color: cancelled ? 'var(--text-tertiary)' : 'var(--error-color)' }}>
        {cancelled ? '◼' : '⚠'}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12.5px] font-semibold text-[var(--text-color)]">{title}</span>
        <span className="text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">{body}</span>
      </div>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border bg-[var(--bg-color)] px-2.5 py-[5px] text-[12px] font-medium text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('banner.retry')}
        </button>
      )}
    </div>
  )
}
