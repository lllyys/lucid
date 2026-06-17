// Purpose: the Settings · Sync connect form (#9, WI-9c, design surface B). The not-connected (local-only)
// surface: a 560px card with the opt-in/privacy copy, Server URL + masked Access token inputs, the
// "what leaves this device" data-scope list, the persisted-token note, and Connect / Stay local-only
// actions. Also renders the `connecting` state (spinner checklist + Cancel) per the design. Pure
// presentation — submit calls onConnect({serverUrl, token}); the panel owns the controller wiring.
// Tokens only (rule 30/31); every string via t() (rule 66 §5).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SyncConfig } from '@/stores/syncStore'

export interface ConnectFormProps {
  onConnect: (config: SyncConfig) => void
  onStayLocal?: () => void
  /** Prefill the inputs (re-connect / update-token flow re-shows this form with the current config). */
  initialConfig?: SyncConfig
  /** When true, render the connecting state instead of the form. */
  connecting?: boolean
  /** The server being reached (connecting-state sub-line). */
  serverUrl?: string
  onCancel?: () => void
}

/** …last4 of the token for the persisted-token note (never the full token — rule 65 §5). */
function last4(token: string): string {
  return token.slice(-4) || '————'
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

function ConnectingCard({ serverUrl, onCancel }: { serverUrl?: string; onCancel?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex w-[380px] max-w-full flex-col gap-[18px] rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] p-6 shadow-[var(--shadow-tab)]">
      <div className="flex flex-col items-center gap-[14px] p-[18px_0_8px] text-center">
        <span
          aria-hidden
          className="inline-block size-[44px] animate-spin rounded-full border-[2.4px] border-[var(--accent-primary)] border-t-transparent"
        />
        <div className="flex flex-col gap-[5px]">
          <span className="text-[15px] font-semibold text-[var(--text-color)]">{t('sync.connecting.title')}</span>
          {serverUrl && <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{serverUrl}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-[var(--border-color)]">
        <div className="flex items-center gap-[10px] bg-[var(--bg-canvas)] p-[11px_14px]">
          <span aria-hidden className="text-[12px] text-[var(--success)]">✓</span>
          <span className="text-[12px] text-[var(--text-color)]">{t('sync.connecting.reached')}</span>
        </div>
        <div className="flex items-center gap-[10px] bg-[var(--bg-canvas)] p-[11px_14px]">
          <span aria-hidden className="text-[12px] text-[var(--success)]">✓</span>
          <span className="text-[12px] text-[var(--text-color)]">{t('sync.connecting.tokenAccepted')}</span>
        </div>
        <div className="flex items-center gap-[10px] bg-[var(--bg-canvas)] p-[11px_14px]">
          <span
            aria-hidden
            className="inline-block size-[11px] animate-spin rounded-full border-[1.5px] border-[var(--accent-primary)] border-t-transparent"
          />
          <span className="text-[12px] text-[var(--text-secondary)]">{t('sync.connecting.pulling')}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[10px] font-sans text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
      >
        {t('sync.connecting.cancel')}
      </button>
    </div>
  )
}

export function ConnectForm({ onConnect, onStayLocal, initialConfig, connecting, serverUrl, onCancel }: ConnectFormProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState(initialConfig?.serverUrl ?? '')
  const [token, setToken] = useState(initialConfig?.token ?? '')
  const [revealed, setRevealed] = useState(false)

  if (connecting) return <ConnectingCard serverUrl={serverUrl} onCancel={onCancel} />

  const trimmedUrl = url.trim()
  const trimmedToken = token.trim()
  const canConnect = trimmedUrl !== '' && trimmedToken !== ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canConnect) return
    onConnect({ serverUrl: trimmedUrl, token: trimmedToken })
  }

  return (
    <form
      onSubmit={submit}
      className="w-[560px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--shadow-tab)]"
    >
      {/* header */}
      <div className="flex items-start gap-[13px] border-b border-[var(--border-color)] p-[22px_24px_18px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-subtle)]">
          <span className="flex size-[11px] items-center justify-center rounded-full border-[1.5px] border-[var(--accent-primary)]">
            <span className="size-[4px] rounded-full bg-[var(--accent-primary)]" />
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[17px] font-semibold text-[var(--text-color)]">{t('sync.connect.title')}</span>
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{t('sync.connect.subtitle')}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-[6px_10px]">
          <span className="size-2 rounded-full bg-[var(--dot-idle)]" />
          <span className="text-[11.5px] font-semibold text-[var(--text-secondary)]">{t('sync.connect.localOnlyBadge')}</span>
        </span>
      </div>

      <div className="flex flex-col gap-[17px] p-[20px_24px_24px]">
        {/* opt-in callout */}
        <div className="flex items-start gap-[10px] rounded-[12px] border border-dashed border-[var(--accent-dash)] bg-[var(--accent-subtle)] p-[12px_14px]">
          <span aria-hidden className="mt-px shrink-0 text-[13px] leading-none text-[var(--accent-ink)]">
            ◔
          </span>
          <span className="text-[12px] leading-[1.6] text-[var(--text-secondary)]">{t('sync.connect.optInCallout')}</span>
        </div>

        {/* server url */}
        <label className="flex flex-col gap-[7px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('sync.connect.serverUrlLabel')}
          </span>
          <input
            aria-label={t('sync.connect.serverUrlLabel')}
            type="text"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('sync.connect.serverUrlPlaceholder')}
            className="rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[10px_12px] font-mono text-[13px] text-[var(--text-color)] outline-none focus-visible:border-[var(--accent-border)]"
          />
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t('sync.connect.serverUrlHint')}</span>
        </label>

        {/* token */}
        <label className="flex flex-col gap-[7px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('sync.connect.tokenLabel')} <span className="text-[var(--text-tertiary)]">· {t('sync.connect.tokenLabelBearer')}</span>
          </span>
          <div className="flex items-center gap-2 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[4px_5px_4px_12px]">
            <input
              aria-label={t('sync.connect.tokenLabel')}
              type={revealed ? 'text' : 'password'}
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('sync.connect.tokenPlaceholder')}
              className="flex-1 border-none bg-transparent p-[8px_0] font-mono text-[13px] tracking-[0.06em] text-[var(--text-color)] outline-none"
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="rounded-[6px] p-[6px_8px] font-mono text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {revealed ? t('sync.connect.hide') : t('sync.connect.show')}
            </button>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t('sync.connect.tokenHint')}</span>
        </label>

        {/* what leaves the device */}
        <div className="flex flex-col overflow-hidden rounded-[13px] border border-[var(--border-color)] bg-[var(--bg-canvas)]">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] p-[11px_14px]">
            <span className="text-[12.5px] font-semibold text-[var(--text-color)]">{t('sync.connect.dataScopeTitle')}</span>
            <span className="rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] p-[3px_7px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--accent-ink)]">
              {t('sync.connect.dataScopeBadge')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--border-color)]">
            <ScopeRow icon="✓" iconColor="var(--success)" text={t('sync.connect.dataSessions')} textColor="var(--text-color)" />
            <ScopeRow icon="✓" iconColor="var(--success)" text={t('sync.connect.dataGlossary')} textColor="var(--text-color)" />
            <ScopeRow icon="✓" iconColor="var(--success)" text={t('sync.connect.dataKeywords')} textColor="var(--text-color)" />
            <ScopeRow icon="○" iconColor="var(--text-tertiary)" text={t('sync.connect.dataKeysNever')} textColor="var(--text-secondary)" />
          </div>
          <div className="border-t border-[var(--border-color)] p-[10px_14px] font-mono text-[10px] leading-[1.6] text-[var(--text-tertiary)]">
            {t('sync.connect.dataScopeFootnote')}
          </div>
        </div>

        {/* persisted-token note */}
        <div className="flex items-start gap-[9px] rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-color)] p-[11px_13px]">
          <span aria-hidden className="mt-px shrink-0 text-[13px] text-[var(--text-secondary)]">
            🔒
          </span>
          <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
            {t('sync.connect.persistedTokenNote', { last4: last4(trimmedToken) })}
          </span>
        </div>

        {/* actions */}
        <div className="flex items-center gap-[10px] pt-0.5">
          <button
            type="submit"
            disabled={!canConnect}
            className="flex flex-1 items-center justify-center gap-2 rounded-[11px] border-none bg-[var(--accent-primary)] p-[12px_16px] font-sans text-[13.5px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('sync.connect.connect')}
          </button>
          <button
            type="button"
            onClick={onStayLocal}
            className="shrink-0 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[12px_16px] font-sans text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('sync.connect.stayLocal')}
          </button>
        </div>
      </div>
    </form>
  )
}
