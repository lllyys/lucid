// Purpose: the insecure-context blocking card (#15 WI-6, design Section D). crypto.subtle is unavailable
// over plain HTTP, so encrypted sync can't run — the card blocks the passphrase and points at the
// HTTPS path (the tailscale-serve hint). The "Open the HTTPS URL" button is a best-effort prompt: it
// swaps the current location to https:// (the user still needs HTTPS fronting). Tokens + t() only.

import { useTranslation } from 'react-i18next'

// Best-effort: reopen the current page over https:// (the user must have HTTPS fronting, e.g. tailscale
// serve). Injectable for tests so we don't touch the real location.
function openHttps() {
  const here = window.location?.href
  if (here && here.startsWith('http:')) window.location.href = here.replace(/^http:/, 'https:')
}

export function InsecureContextCard({ onOpenHttps = openHttps }: { onOpenHttps?: () => void } = {}) {
  const { t } = useTranslation()
  return (
    <div className="w-[480px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--popup-shadow)]">
      <div className="flex items-start gap-[13px] border-b border-[var(--border-color)] bg-[var(--warning-bg)] p-[22px_24px_18px]">
        <span
          aria-hidden
          className="flex size-8 flex-none items-center justify-center rounded-[9px] border border-[var(--warning-border)] bg-[var(--bg-color)] text-[15px] text-[var(--warning)]"
        >
          ⚠
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--warning)]">
            {t('configSync.insecure.title')}
          </span>
          <span className="font-mono text-[10.5px] text-[var(--warning)]">
            {t('configSync.insecure.subtitle')}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-[15px] p-[20px_24px_24px]">
        <p className="m-0 text-[12.5px] leading-[1.65] text-[var(--text-secondary)]">
          {t('configSync.insecure.body')}
        </p>
        <div className="overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-[var(--border-color)]">
          <div className="flex items-center gap-2.5 bg-[var(--bg-canvas)] p-[11px_14px]">
            <span aria-hidden className="flex-none text-[12px] text-[var(--error-color)]">✕</span>
            <span className="font-mono text-[11.5px] text-[var(--text-tertiary)]">{t('configSync.insecure.insecureUrl')}</span>
            <span className="ml-auto font-mono text-[9.5px] text-[var(--text-tertiary)]">{t('configSync.insecure.insecureTag')}</span>
          </div>
          <div className="flex items-center gap-2.5 bg-[var(--bg-canvas)] p-[11px_14px]">
            <span aria-hidden className="flex-none text-[12px] text-[var(--success)]">✓</span>
            <span className="font-mono text-[11.5px] text-[var(--text-color)]">{t('configSync.insecure.secureUrl')}</span>
            <span className="ml-auto font-mono text-[9.5px] text-[var(--success-hover)]">{t('configSync.insecure.secureTag')}</span>
          </div>
        </div>
        <div className="flex items-start gap-[9px] rounded-[12px] border border-dashed border-[var(--accent-dash)] bg-[var(--accent-subtle)] p-[12px_14px]">
          <span aria-hidden className="mt-px flex-none font-mono text-[11px] text-[var(--accent-ink)]">$</span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11.5px] leading-[1.55] text-[var(--text-secondary)]">
              {t('configSync.insecure.tailscaleHint')}
            </span>
            <span className="truncate font-mono text-[11px] text-[var(--text-color)]">
              {t('configSync.insecure.tailscaleCmd')}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenHttps}
          className="cursor-pointer rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] py-3 font-sans text-[13px] font-semibold text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('configSync.insecure.openHttps')}
        </button>
      </div>
    </div>
  )
}
