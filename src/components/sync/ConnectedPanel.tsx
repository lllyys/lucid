// Purpose: the Settings · Sync connected panel (#9, WI-9c, design surface C). The connected (non-local)
// surface: a 560px card with the SyncStatusCard at top (swaps per live state), the "Connected to" server
// row (URL + redacted token + Edit), the data-scope counts grid, and the Disconnect zone (keep vs erase).
// Pure presentation — store reads + controller wiring live in SyncSettingsPanel; the two disconnect
// buttons call onDisconnect(false|true) so the parent can open the confirm dialog. Tokens only (rule
// 30/31); every string via t() (rule 66 §5); the token is shown ONLY as …last4 (rule 65 §5).

import { useTranslation } from 'react-i18next'
import type { SyncConfig, SyncCounts, SyncStatus } from '@/stores/syncStore'
import { SyncStatusCard } from './SyncStatusCard'

export interface ConnectedPanelProps {
  config: SyncConfig
  counts: SyncCounts
  status: SyncStatus
  lastSyncedAt: number | null
  queuedCount: number
  onSyncNow: () => void
  onRetry: () => void
  onShowConflict: () => void
  onUpdateToken: () => void
  onEdit: () => void
  onDisconnect: (erase: boolean) => void
}

function CountTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-[var(--bg-canvas)] p-[12px_14px]">
      <span className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">{value}</span>
      <span className="font-mono text-[9.5px] text-[var(--text-tertiary)]">{label}</span>
    </div>
  )
}

export function ConnectedPanel(props: ConnectedPanelProps) {
  const { t } = useTranslation()
  const { config, counts } = props
  const last4 = config.token.slice(-4) || '————'

  return (
    <div className="w-[560px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--shadow-tab)]">
      {/* header */}
      <div className="flex items-center justify-between gap-[14px] border-b border-[var(--border-color)] p-[20px_24px]">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[17px] font-semibold text-[var(--text-color)]">{t('sync.panel.title')}</span>
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{t('sync.panel.subtitle')}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] border border-[var(--success-border)] bg-[var(--success-bg)] p-[7px_12px]">
          <span className="size-2 rounded-full bg-[var(--success)]" />
          <span className="text-[12px] font-semibold text-[var(--success)]">{t('sync.panel.connectedBadge')}</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-[20px_24px_24px]">
        <SyncStatusCard
          status={props.status}
          lastSyncedAt={props.lastSyncedAt}
          queuedCount={props.queuedCount}
          onSyncNow={props.onSyncNow}
          onRetry={props.onRetry}
          onShowConflict={props.onShowConflict}
          onUpdateToken={props.onUpdateToken}
        />

        {/* server row */}
        <div className="flex flex-col gap-[7px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('sync.panel.connectedTo')}
          </span>
          <div className="flex items-center gap-3 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-[12px_14px]">
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate font-mono text-[12.5px] text-[var(--text-color)]">{config.serverUrl}</span>
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t('sync.panel.tokenNote', { last4 })}</span>
            </div>
            <button
              type="button"
              onClick={props.onEdit}
              className="shrink-0 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[6px_11px] font-sans text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('sync.panel.edit')}
            </button>
          </div>
        </div>

        {/* data scope */}
        <div className="flex flex-col gap-[7px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('sync.panel.scopeTitle')}
          </span>
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-[11px] border border-[var(--border-color)] bg-[var(--border-color)]">
            <CountTile value={counts.sessions} label={t('sync.panel.sessions')} />
            <CountTile value={counts.tasks} label={t('sync.panel.tasks')} />
            <CountTile value={counts.terms} label={t('sync.panel.terms')} />
            <CountTile value={counts.keywords} label={t('sync.panel.keywords')} />
          </div>
        </div>

        {/* disconnect zone */}
        <div className="flex flex-col gap-[11px] border-t border-[var(--border-color)] pt-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('sync.disconnect.zoneTitle')}
          </span>
          <div className="flex flex-wrap gap-[10px]">
            <button
              type="button"
              onClick={() => props.onDisconnect(false)}
              className="flex min-w-[200px] flex-1 flex-col items-start gap-[3px] rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[11px_14px] text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              <span className="text-[12.5px] font-semibold text-[var(--text-color)]">{t('sync.disconnect.disconnect')}</span>
              <span className="font-mono text-[9.5px] leading-[1.5] text-[var(--text-tertiary)]">{t('sync.disconnect.disconnectSub')}</span>
            </button>
            <button
              type="button"
              onClick={() => props.onDisconnect(true)}
              className="flex min-w-[200px] flex-1 flex-col items-start gap-[3px] rounded-[11px] border border-[var(--danger-border)] bg-[var(--error-bg)] p-[11px_14px] text-left focus-visible:outline-2 focus-visible:outline-[var(--error-color)]"
            >
              <span className="text-[12.5px] font-semibold text-[var(--error-color)]">{t('sync.disconnect.erase')}</span>
              <span className="font-mono text-[9.5px] leading-[1.5] text-[var(--error-color)]">{t('sync.disconnect.eraseSub')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
