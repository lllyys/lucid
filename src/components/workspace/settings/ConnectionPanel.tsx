// Purpose: the Settings test-connection card (feature #6 — #28, design #29). Shows the VIEWED vendor's
// connection state (idle/testing/ok/fail) with a colored dot + detail line + a Test button. State +
// the probe live in providerStore/useTestConnection; this component is presentational. The stat tiles
// are a separate `StatTiles` component rendered after the credentials (matching the design's order).

import { useTranslation } from 'react-i18next'
import type { TestResult } from '@/stores/providerStore'

interface ConnectionPanelProps {
  result: TestResult
  onTest: () => void
}

const DOT: Record<TestResult['status'], string> = {
  idle: 'var(--text-tertiary)',
  testing: 'var(--accent-primary)',
  ok: 'var(--success)',
  fail: 'var(--error-color)',
}
const LABEL_COLOR: Record<TestResult['status'], string> = {
  idle: 'var(--text-secondary)',
  testing: 'var(--accent-ink)',
  ok: 'var(--success)',
  fail: 'var(--error-color)',
}

export function ConnectionPanel({ result, onTest }: ConnectionPanelProps) {
  const { t } = useTranslation()
  const { status } = result
  const label =
    status === 'ok'
      ? t('settings.connOk')
      : status === 'fail'
        ? t('settings.connFail')
        : status === 'testing'
          ? t('settings.testing')
          : t('settings.connIdle')
  const detail =
    status === 'ok'
      ? t('settings.connOkDetail', { ms: result.latencyMs ?? 0 })
      : status === 'fail'
        ? t(result.msgKey ?? 'error.unknown')
        : status === 'idle'
          ? t('settings.connIdleDetail')
          : ''
  const btnLabel =
    status === 'testing' ? t('settings.testing') : status === 'idle' ? t('settings.testConnection') : t('settings.testAgain')

  return (
    <div className="flex items-center justify-between gap-3.5 rounded-[13px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="size-[11px] shrink-0 rounded-full" style={{ background: DOT[status] }} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[14px] font-semibold" style={{ color: LABEL_COLOR[status] }}>
            {label}
          </span>
          {detail && <span className="truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">{detail}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onTest}
        disabled={status === 'testing'}
        className="shrink-0 rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-primary)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--on-accent)] hover:brightness-105 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
      >
        {btnLabel}
      </button>
    </div>
  )
}

/** The 2×2 stat grid — rendered after the credentials (design order). Latency / last-tested come from
 * the live probe; pricing / rate-limit have no registry source, so they show a documented "—". */
export function StatTiles({ result }: { result: TestResult }) {
  const { t } = useTranslation()
  const latency = result.status === 'ok' && result.latencyMs !== undefined ? `${result.latencyMs} ms` : '—'
  const lastTested = result.status === 'ok' ? t('settings.statJustNow') : '—'
  const tiles = [
    { label: t('settings.statLatency'), value: latency },
    { label: t('settings.statLastTested'), value: lastTested },
    { label: t('settings.statPricing'), value: '—' },
    { label: t('settings.statRate'), value: '—' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col gap-0.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-[13px] py-3"
        >
          <span className="font-mono text-[9.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
            {tile.label}
          </span>
          <span className="text-[15px] font-semibold text-[var(--text-color)]">{tile.value}</span>
        </div>
      ))}
    </div>
  )
}
