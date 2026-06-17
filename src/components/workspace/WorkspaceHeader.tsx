import { useTranslation } from 'react-i18next'
import type { SyncController } from '@/lib/sync/syncController'
import { SyncSettingsDialog } from '@/components/sync/SyncSettingsDialog'
import { SettingsDialog } from './SettingsDialog'

/**
 * Workspace header (feature #2, WI-3; Settings wired in feature #4, WI-1; Sync pill + dialog wired in
 * feature #9, WI-9d) — the designed top bar: brand wordmark + tagline, a keyboard run hint, the Sync
 * status pill (opens Settings · Sync), and the Settings affordance. The provider/API-key dialog (#13)
 * and the sync dialog each own their own trigger; the Workspace owns the sync controller + open state.
 */
export interface WorkspaceHeaderProps {
  controller: SyncController
  syncSettingsOpen: boolean
  onSyncSettingsChange: (open: boolean) => void
}

export function WorkspaceHeader({ controller, syncSettingsOpen, onSyncSettingsChange }: WorkspaceHeaderProps) {
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
        <SyncSettingsDialog controller={controller} open={syncSettingsOpen} onOpenChange={onSyncSettingsChange} />
        <span className="h-[18px] w-px bg-[var(--border-color)]" />
        <SettingsDialog />
      </div>
    </header>
  )
}
