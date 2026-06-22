// Purpose: the Settings · Sync connected panel (#9, WI-9c; #19 WI-3 simplification, design section B/D). The
// connected (non-local) surface: a card with an ON on/off toggle row (off → onTurnOff opens the turn-off
// dialog), a top status card that swaps per live state — OR an "empty · just turned on" card when idle with
// no prior sync (status idle && lastSyncedAt null) — then the connection row, the data-scope counts grid, and
// the "Turn off" zone (keep vs erase). The connection row is token-aware (rule 65 §5): a single-origin
// connection (token === '') shows a READ-ONLY "Syncing to" origin row with NO Edit; a remote connection
// (non-empty token) keeps the "Connected to" server row + redacted token …last4 + Edit (backward compat).
// Pure presentation — store reads + controller wiring live in SyncSettingsPanel; the turn-off buttons call
// onDisconnect(false|true) so the parent can open the confirm dialog. Tokens only (rule 30/31); every string
// via t() (rule 66 §5); the token is shown ONLY as …last4 (rule 65 §5).

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
  /** Toggling the ON switch off → open the turn-off dialog (the single-origin "turn off" affordance). */
  onTurnOff: () => void
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

/** The "Connected — nothing to sync yet" card shown right after turning sync on (no prior sync). */
function EmptyStateCard() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-[14px_16px]">
      <span className="size-[11px] shrink-0 rounded-full bg-[var(--success)]" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-[var(--success-hover)]">{t('sync.empty.title')}</span>
        <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">{t('sync.empty.detail')}</span>
      </div>
    </div>
  )
}

export function ConnectedPanel(props: ConnectedPanelProps) {
  const { t } = useTranslation()
  const { config, counts } = props
  const last4 = config.token.slice(-4) || '————'
  const isSingleOrigin = config.token === ''
  // "empty · just turned on": connected but never synced, and not mid-cycle / failing.
  const isEmpty = props.status === 'idle' && props.lastSyncedAt === null

  return (
    <div className="w-[520px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--shadow-tab)]">
      {/* header */}
      <div className="flex items-center justify-between gap-[14px] border-b border-[var(--border-color)] p-[20px_24px]">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[17px] font-semibold text-[var(--text-color)]">{t('sync.panel.title')}</span>
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
            {isSingleOrigin ? t('sync.origin.headerSub') : t('sync.panel.subtitle')}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] border border-[var(--success-border)] bg-[var(--success-bg)] p-[7px_12px]">
          <span className="size-2 rounded-full bg-[var(--success)]" />
          <span className="text-[12px] font-semibold text-[var(--success)]">{t('sync.panel.connectedBadge')}</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-[20px_24px_24px]">
        {/* ON on/off toggle — off → open the turn-off dialog */}
        <div className="flex items-center justify-between gap-4 rounded-[14px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[14px] font-semibold text-[var(--text-color)]">{t('sync.toggle.switchLabel')}</span>
            <span className="font-mono text-[10.5px] leading-[1.55] text-[var(--accent-ink)]">
              {t('sync.origin.switchSubOn', { origin: config.serverUrl })}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={true}
            aria-label={t('sync.toggle.switchLabel')}
            onClick={props.onTurnOff}
            className="relative h-[26px] w-11 shrink-0 rounded-full border border-[var(--accent-primary)] bg-[var(--accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            <span className="absolute left-5 top-0.5 size-5 rounded-full bg-[var(--on-accent)] shadow-[var(--shadow-tab)]" />
          </button>
        </div>

        {isEmpty ? (
          <EmptyStateCard />
        ) : (
          <SyncStatusCard
            status={props.status}
            lastSyncedAt={props.lastSyncedAt}
            queuedCount={props.queuedCount}
            onSyncNow={props.onSyncNow}
            onRetry={props.onRetry}
            onShowConflict={props.onShowConflict}
            onUpdateToken={props.onUpdateToken}
          />
        )}

        {/* connection row — token-aware: single-origin = read-only origin (no Edit); remote = server + Edit */}
        {isSingleOrigin ? (
          <div className="flex flex-col gap-[7px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              {t('sync.origin.label')}
            </span>
            <div className="flex items-center gap-3 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-[12px_14px]">
              <span
                aria-hidden
                className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[13px] text-[var(--accent-ink)]"
              >
                ⌂
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate font-mono text-[12.5px] text-[var(--text-color)]">{config.serverUrl}</span>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t('sync.origin.sub')}</span>
              </div>
              <span className="shrink-0 rounded-[6px] border border-[var(--success-border)] bg-[var(--success-bg)] p-[4px_7px] font-mono text-[9px] font-semibold uppercase tracking-[0.04em] text-[var(--success-hover)]">
                {t('sync.origin.sameOriginBadge')}
              </span>
            </div>
          </div>
        ) : (
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
        )}

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
