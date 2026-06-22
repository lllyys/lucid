// Purpose: the simplified Settings · Sync OFF (local-only) surface (#19 WI-3, design section B). Collapses
// the #9 URL+token form to a single on/off switch ("Sync workspace data to this server"): toggling on calls
// onTurnOn → controller.connectSingleOrigin() (token-free, window.location.origin). A collapsed Advanced
// disclosure ("Use a different server", aria-expanded) reveals the EXISTING ConnectForm for the cross-origin
// remote path (submit → onConnect → controller.connect). The "what leaves this device" scope grid is static
// (no live counts here — sync is off). Tokens only (rule 30/31, design --accent-tint→--accent-subtle); every
// string via t() (rule 66 §5). Switch a11y: role="switch" aria-checked; disclosure: aria-expanded/-controls.

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SyncConfig } from '@/stores/syncStore'
import { ConnectForm } from './ConnectForm'

export interface SyncToggleCardProps {
  /** The served origin (window.location.origin) shown in the switch sub-line. */
  origin: string
  /** Toggle on → single-origin connect (token-free). */
  onTurnOn: () => void
  /** Advanced (remote) connect — the ConnectForm submit. */
  onConnect: (config: SyncConfig) => void
}

function ScopeRow({ icon, iconColor, text, textColor }: { icon: string; iconColor: string; text: string; textColor: string }) {
  return (
    <div className="flex items-center gap-[9px] bg-[var(--bg-canvas)] p-[10px_14px]">
      <span aria-hidden className="shrink-0 text-[12px]" style={{ color: iconColor }}>
        {icon}
      </span>
      <span className="text-[12px]" style={{ color: textColor }}>
        {text}
      </span>
    </div>
  )
}

export function SyncToggleCard({ origin, onTurnOn, onConnect }: SyncToggleCardProps) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedId = useId()

  return (
    <div className="w-[520px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--shadow-tab)]">
      {/* header */}
      <div className="flex items-center justify-between gap-[14px] border-b border-[var(--border-color)] p-[20px_24px]">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[17px] font-semibold text-[var(--text-color)]">{t('sync.toggle.header')}</span>
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{t('sync.toggle.headerSub')}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[7px_12px]">
          <span className="size-2 rounded-full bg-[var(--dot-idle)]" />
          <span className="text-[12px] font-semibold text-[var(--text-secondary)]">{t('sync.toggle.localOnlyBadge')}</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-[20px_24px_24px]">
        {/* the single on/off switch (OFF) */}
        <div className="flex items-center justify-between gap-4 rounded-[14px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[14px] font-semibold text-[var(--text-color)]">{t('sync.toggle.switchLabel')}</span>
            <span className="font-mono text-[10.5px] leading-[1.55] text-[var(--text-tertiary)]">
              {t('sync.toggle.switchSubOff', { origin })}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={false}
            aria-label={t('sync.toggle.switchLabel')}
            onClick={onTurnOn}
            className="relative h-[26px] w-11 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-[var(--bg-color)] shadow-[var(--shadow-tab)]" />
          </button>
        </div>

        {/* opt-in callout */}
        <div className="flex items-start gap-[10px] rounded-[12px] border border-dashed border-[var(--accent-dash)] bg-[var(--accent-subtle)] p-[12px_14px]">
          <span aria-hidden className="mt-px shrink-0 text-[13px] leading-none text-[var(--accent-ink)]">
            ◔
          </span>
          <span className="text-[12px] leading-[1.6] text-[var(--text-secondary)]">{t('sync.toggle.optInCallout')}</span>
        </div>

        {/* what leaves this device (static) */}
        <div className="flex flex-col overflow-hidden rounded-[13px] border border-[var(--border-color)] bg-[var(--bg-canvas)]">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] p-[11px_14px]">
            <span className="text-[12.5px] font-semibold text-[var(--text-color)]">{t('sync.toggle.scopeTitle')}</span>
            <span className="rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] p-[3px_7px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--accent-ink)]">
              {t('sync.toggle.scopeBadge')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--border-color)]">
            <ScopeRow icon="✓" iconColor="var(--success)" text={t('sync.toggle.scopeSessions')} textColor="var(--text-color)" />
            <ScopeRow icon="✓" iconColor="var(--success)" text={t('sync.toggle.scopeGlossary')} textColor="var(--text-color)" />
            <ScopeRow icon="✓" iconColor="var(--success)" text={t('sync.toggle.scopeKeywords')} textColor="var(--text-color)" />
            <ScopeRow icon="○" iconColor="var(--text-tertiary)" text={t('sync.toggle.scopeKeysNever')} textColor="var(--text-secondary)" />
          </div>
        </div>

        {/* advanced disclosure */}
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => setAdvancedOpen((o) => !o)}
          className={`flex items-center justify-between gap-[10px] rounded-[11px] border p-[12px_14px] text-left focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)] ${
            advancedOpen
              ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)]'
              : 'border-[var(--border-color)] bg-[var(--bg-color)] hover:bg-[var(--hover-bg)]'
          }`}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12.5px] font-semibold text-[var(--text-color)]">{t('sync.advanced.disclosureTitle')}</span>
            <span className={`font-mono text-[10px] ${advancedOpen ? 'text-[var(--accent-ink)]' : 'text-[var(--text-tertiary)]'}`}>
              {t('sync.advanced.disclosureSub')}
            </span>
          </span>
          <span
            aria-hidden
            className={`shrink-0 ${advancedOpen ? 'rotate-180' : ''}`}
            style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `6px solid ${advancedOpen ? 'var(--accent-ink)' : 'var(--text-tertiary)'}`,
            }}
          />
        </button>

        {/* advanced expanded → the existing ConnectForm (remote/cross-origin path) */}
        {advancedOpen && (
          <div id={advancedId}>
            <ConnectForm
              onConnect={onConnect}
              onStayLocal={() => setAdvancedOpen(false)}
              stayLocalLabelKey="sync.advanced.useThisServerInstead"
            />
          </div>
        )}
      </div>
    </div>
  )
}
