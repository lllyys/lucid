import { useTranslation } from 'react-i18next'

/** Shared empty state for a sidebar tab (feature #3). */
export function SidebarEmpty({ body }: { body: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-3.5 py-6 text-center">
      <span className="flex size-[42px] items-center justify-center rounded-[12px] bg-[var(--bg-tertiary)] text-[17px] text-[var(--text-disabled)]">
        ❑
      </span>
      <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{t('sidebar.nothingSaved')}</span>
      <span className="max-w-[30ch] font-mono text-[10.5px] leading-[1.6] text-[var(--text-tertiary)]">{body}</span>
    </div>
  )
}
