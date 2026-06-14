import { useTranslation } from 'react-i18next'

/**
 * Workspace header (feature #2, WI-3) — the designed top bar: brand wordmark + tagline,
 * a keyboard run hint, and a Settings affordance. The Settings button is a visible
 * affordance with no action: no settings/API-key dialog is in the committed design
 * (rule 51 — that surface is needs-design #13).
 */
export function WorkspaceHeader() {
  const { t } = useTranslation()
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-[var(--bg-color)] px-5">
      <div className="flex items-center gap-[11px]">
        <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-[var(--accent-primary)]">
          <span className="h-[7px] w-[7px] rounded-full bg-[var(--accent-primary)]" />
        </span>
        <span className="text-[18px] font-semibold tracking-[-0.02em]">{t('common.appName')}</span>
        <span className="pt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-[var(--text-tertiary)]">
          {t('header.tagline')}
        </span>
      </div>
      <div className="flex items-center gap-[14px]">
        <span className="font-mono text-[11.5px] text-[var(--text-tertiary)]">{t('header.runHint')}</span>
        <span className="h-[18px] w-px bg-[var(--border-color)]" />
        <button
          type="button"
          className="flex items-center gap-[7px] rounded-md border bg-[var(--bg-color)] px-[10px] py-1.5 font-sans text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
        >
          <span className="h-[13px] w-[13px] rounded-full border-[1.5px] border-[var(--text-tertiary)]" />
          {t('header.settings')}
        </button>
      </div>
    </header>
  )
}
