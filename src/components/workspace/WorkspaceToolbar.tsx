import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Workspace toolbar (feature #2, WI-3) — the designed bar above the panels. Owns the
 * static "one workspace" subtitle and a right-aligned slot for chrome injected by later
 * WIs (the provider switcher, WI-8). The designed active-session chip is sidebar/session
 * DATA → deferred to feature #3 (#19), so it is not rendered here.
 */
export function WorkspaceToolbar({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-[var(--bg-canvas)] px-[22px] py-[11px]">
      <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{t('toolbar.subtitle')}</span>
      <div className="flex-1" />
      {children}
    </div>
  )
}
