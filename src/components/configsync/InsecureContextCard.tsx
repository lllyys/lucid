// Purpose: the insecure-context blocking card (#15 WI-6, design Section D). crypto.subtle is unavailable
// over plain HTTP, so encrypted sync can't run — the card blocks the passphrase and points at the
// HTTPS path (the tailscale-serve hint). No controller action wires here (the user must reopen over
// HTTPS); the button is a passive prompt. Tokens + t() only (rules 30/31/66 §5).

import { useTranslation } from 'react-i18next'

export function InsecureContextCard() {
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
      </div>
    </div>
  )
}
