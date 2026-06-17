// Purpose: the sync status pill (#9, WI-9a, design surface A) — a compact header indicator that reflects
// the live syncStore status across all 8 states and (per the design) opens Settings · Sync on click.
// Reads the store via selectors (AGENTS.md — never destructure); maps the pure `syncPillView` tone to
// design tokens (rule 30/31 — tokens only, no hardcoded colors) and localizes every string with t().

import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/stores/syncStore'
import { syncPillView, type PillTone, type PillView } from './syncPillView'

/**
 * Tone → design tokens. Labels use the AA-safe ink tokens (which lift in dark, rule 34), NOT the darker
 * `-hover` shades the light design draws — e.g. synced stays on `--success` rather than `--success-hover`
 * (#246b49), which fails AA on the dark `--success-bg`. `detail` is the fainter mono hint: for the grey
 * idle tone it drops to `--text-tertiary` (matching the design's label-vs-detail tonal split); the colored
 * tones tint the detail the same as the label, exactly as the bundle does.
 */
const TONE: Record<PillTone, { border: string; bg: string; dot: string; label: string; detail: string }> = {
  idle: { border: 'var(--border-strong)', bg: 'var(--bg-color)', dot: 'var(--dot-idle)', label: 'var(--text-secondary)', detail: 'var(--text-tertiary)' },
  synced: { border: 'var(--success-border)', bg: 'var(--success-bg)', dot: 'var(--success)', label: 'var(--success)', detail: 'var(--success)' },
  syncing: { border: 'var(--accent-border)', bg: 'var(--accent-subtle)', dot: 'var(--accent-ink)', label: 'var(--accent-ink)', detail: 'var(--accent-ink)' },
  warn: { border: 'var(--warning-border)', bg: 'var(--warning-bg)', dot: 'var(--warning)', label: 'var(--warning)', detail: 'var(--warning)' },
  danger: { border: 'var(--danger-border)', bg: 'var(--error-bg)', dot: 'var(--error-color)', label: 'var(--error-color)', detail: 'var(--error-color)' },
}

export interface SyncStatusPillProps {
  /** Opens the Settings · Sync surface — the design's pill is click → settings (wired in WI-9c). */
  onOpenSettings?: () => void
}

function Indicator({ view, color }: { view: PillView; color: string }) {
  if (view.indicator === 'spinner') {
    return (
      <span
        aria-hidden
        className="inline-block size-[11px] shrink-0 animate-spin rounded-full border-[1.6px] border-current border-t-transparent"
        style={{ color }}
      />
    )
  }
  if (view.indicator === 'warn-icon') {
    return (
      <span aria-hidden className="text-[12px] leading-none" style={{ color }}>
        ⚠
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`size-[9px] shrink-0 rounded-full${view.pulse ? ' animate-pulse' : ''}`}
      style={{ background: color }}
    />
  )
}

export function SyncStatusPill({ onOpenSettings }: SyncStatusPillProps) {
  const { t } = useTranslation()
  const status = useSyncStore((s) => s.status)
  const queuedCount = useSyncStore((s) => s.queuedCount)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)

  const view = syncPillView({ status, queuedCount, lastSyncedAt }, Date.now())
  const tone = TONE[view.tone]
  const label = t(view.labelKey)

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      aria-label={t('sync.pill.aria', { status: label })}
      className="inline-flex items-center gap-2 rounded-[9px] border px-[11px] py-[7px] shadow-[var(--shadow-tab)] hover:opacity-90"
      style={{ borderColor: tone.border, background: tone.bg }}
    >
      <Indicator view={view} color={tone.dot} />
      <span className="text-[12.5px] font-semibold" style={{ color: tone.label }}>
        {label}
      </span>
      {view.detail && (
        <span className="font-mono text-[10px]" style={{ color: tone.detail }}>
          {t(view.detail.key, view.detail.vars)}
        </span>
      )}
    </button>
  )
}
