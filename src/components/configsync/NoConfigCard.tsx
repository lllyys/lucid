// Purpose: the clean first-run "no synced config yet" card (#15 WI-6, design Section D). "Set a
// passphrase" reveals the SetPassphraseCard (the gate owns that toggle); "Keep working local-only" →
// workLocalOnly(). Tokens + t() only (rules 30/31/66 §5).

import { useTranslation } from 'react-i18next'
import type { ConfigSyncController } from '@/lib/config/configSyncController'

export function NoConfigCard({
  controller,
  onSetPassphrase,
}: {
  controller: ConfigSyncController
  onSetPassphrase: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="w-[404px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--popup-shadow)]">
      <div className="flex flex-col items-center gap-4 p-[30px_26px_26px] text-center">
        <span
          aria-hidden
          className="flex size-[46px] flex-none items-center justify-center rounded-[13px] border border-dashed border-[var(--border-dashed)] bg-[var(--bg-canvas)] text-[19px] text-[var(--text-tertiary)]"
        >
          🔒
        </span>
        <div className="flex flex-col gap-[5px]">
          <span className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">
            {t('configSync.noConfig.title')}
          </span>
          <span className="max-w-[30ch] text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            {t('configSync.noConfig.body')}
          </span>
        </div>
        <button
          type="button"
          onClick={onSetPassphrase}
          className="cursor-pointer self-stretch rounded-[11px] border-none bg-[var(--accent-primary)] p-[12px_16px] font-sans text-[13.5px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('configSync.noConfig.setPassphrase')}
        </button>
        <button
          type="button"
          onClick={() => controller.workLocalOnly()}
          className="cursor-pointer border-none bg-transparent p-0 font-sans text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('configSync.noConfig.keepLocal')}
        </button>
      </div>
    </div>
  )
}
