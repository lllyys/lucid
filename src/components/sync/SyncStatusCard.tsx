// Purpose: the Settings · Sync top status card (#9, WI-9c, design surface D). The panel's top card swaps
// per live state — idle/syncing/offline/conflict/auth-error/unreachable — while the rest of the connected
// panel holds. Reuses the pill's tone→token mapping idea (rule 30/31 — tokens only, no hardcoded colors);
// every string is localized via t() (rule 66 §5). Pure presentation: state + callbacks come from props so
// the SyncSettingsPanel owns store reads and controller wiring.

import { useTranslation } from 'react-i18next'
import type { SyncStatus } from '@/stores/syncStore'

type CardTone = 'synced' | 'syncing' | 'warn' | 'danger'
type CardIndicator = 'dot' | 'spinner' | 'warn-icon'

/** Tone → design tokens (mirrors SyncStatusPill.TONE; AA-safe ink tokens, lift in dark per rule 34). */
const TONE: Record<CardTone, { border: string; bg: string; dot: string; fg: string }> = {
  synced: { border: 'var(--success-border)', bg: 'var(--success-bg)', dot: 'var(--success)', fg: 'var(--success)' },
  syncing: { border: 'var(--accent-border)', bg: 'var(--accent-subtle)', dot: 'var(--accent-ink)', fg: 'var(--accent-ink)' },
  warn: { border: 'var(--warning-border)', bg: 'var(--warning-bg)', dot: 'var(--warning)', fg: 'var(--warning)' },
  danger: { border: 'var(--danger-border)', bg: 'var(--error-bg)', dot: 'var(--error-color)', fg: 'var(--error-color)' },
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export interface SyncStatusCardProps {
  status: SyncStatus
  lastSyncedAt: number | null
  queuedCount: number
  onSyncNow: () => void
  onRetry: () => void
  onShowConflict: () => void
  onUpdateToken: () => void
}

interface CardView {
  tone: CardTone
  indicator: CardIndicator
  pulse: boolean
  titleKey: string
  /** Detail rendered as the mono sub-line; resolved by the component (some carry interpolation). */
  detail: { key: string; vars?: Record<string, number> } | null
  action: { labelKey: string; handler: keyof Pick<SyncStatusCardProps, 'onSyncNow' | 'onRetry' | 'onShowConflict' | 'onUpdateToken'> } | null
}

function syncedDetail(lastSyncedAt: number | null, now: number): CardView['detail'] {
  if (lastSyncedAt === null) return null
  const elapsed = Math.max(0, now - lastSyncedAt)
  if (elapsed < MINUTE) return { key: 'sync.card.syncedDetailJustNow' }
  if (elapsed < HOUR) return { key: 'sync.card.syncedDetailMinutesAgo', vars: { n: Math.floor(elapsed / MINUTE) } }
  return { key: 'sync.card.syncedDetailHoursAgo', vars: { n: Math.floor(elapsed / HOUR) } }
}

function viewFor(props: SyncStatusCardProps, now: number): CardView {
  const { status, queuedCount, lastSyncedAt } = props
  switch (status) {
    case 'syncing':
      return {
        tone: 'syncing',
        indicator: 'spinner',
        pulse: false,
        titleKey: 'sync.card.syncingTitle',
        detail: { key: 'sync.card.syncingDetail', vars: { n: queuedCount } },
        action: null,
      }
    case 'offline':
      return {
        tone: 'warn',
        indicator: 'dot',
        pulse: false,
        titleKey: 'sync.card.offlineTitle',
        detail: { key: 'sync.card.offlineDetail', vars: { n: queuedCount } },
        action: { labelKey: 'sync.card.retry', handler: 'onRetry' },
      }
    case 'conflict':
      return {
        tone: 'warn',
        indicator: 'warn-icon',
        pulse: false,
        titleKey: 'sync.card.conflictTitle',
        detail: { key: 'sync.card.conflictDetail' },
        action: { labelKey: 'sync.card.details', handler: 'onShowConflict' },
      }
    case 'auth-error':
      return {
        tone: 'danger',
        indicator: 'dot',
        pulse: false,
        titleKey: 'sync.card.authTitle',
        detail: { key: 'sync.card.authDetail' },
        action: { labelKey: 'sync.card.updateToken', handler: 'onUpdateToken' },
      }
    case 'unreachable':
      return {
        tone: 'danger',
        indicator: 'dot',
        pulse: true,
        titleKey: 'sync.card.unreachableTitle',
        detail: { key: 'sync.card.unreachableDetail' },
        action: { labelKey: 'sync.card.retryNow', handler: 'onRetry' },
      }
    // idle (=synced) — also the fallback shell for connecting/local-only (the panel guards those states).
    default:
      return {
        tone: 'synced',
        indicator: 'dot',
        pulse: false,
        titleKey: 'sync.card.syncedTitle',
        detail: syncedDetail(lastSyncedAt, now),
        action: { labelKey: 'sync.card.syncNow', handler: 'onSyncNow' },
      }
  }
}

function Indicator({ indicator, pulse, color }: { indicator: CardIndicator; pulse: boolean; color: string }) {
  if (indicator === 'spinner') {
    return (
      <span
        aria-hidden
        className="inline-block size-[13px] shrink-0 animate-spin rounded-full border-[1.8px] border-current border-t-transparent"
        style={{ color }}
      />
    )
  }
  if (indicator === 'warn-icon') {
    return (
      <span aria-hidden className="text-[15px] leading-none" style={{ color }}>
        ⚠
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`size-[11px] shrink-0 rounded-full${pulse ? ' animate-pulse' : ''}`}
      style={{ background: color }}
    />
  )
}

export function SyncStatusCard(props: SyncStatusCardProps) {
  const { t } = useTranslation()
  const view = viewFor(props, Date.now())
  const tone = TONE[view.tone]
  const isSynced = view.tone === 'synced'

  return (
    <div
      className="flex items-center justify-between gap-[14px] rounded-[13px] border p-[14px_16px]"
      style={{ borderColor: tone.border, background: tone.bg }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Indicator indicator={view.indicator} pulse={view.pulse} color={tone.dot} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold" style={{ color: tone.fg }}>
            {t(view.titleKey)}
          </span>
          {view.detail && (
            <span className="font-mono text-[10.5px]" style={{ color: tone.fg }}>
              {t(view.detail.key, view.detail.vars)}
            </span>
          )}
        </div>
      </div>
      {view.action && (
        <button
          type="button"
          onClick={props[view.action.handler]}
          className="shrink-0 rounded-[9px] border bg-[var(--bg-color)] px-[13px] py-2 font-sans text-[12.5px] font-semibold focus-visible:outline-2"
          style={{ borderColor: tone.border, color: tone.fg, outlineColor: tone.fg } as React.CSSProperties}
        >
          {isSynced && <span aria-hidden>↻ </span>}
          {t(view.action.labelKey)}
        </button>
      )}
    </div>
  )
}
