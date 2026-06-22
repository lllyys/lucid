import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SyncController } from '@/lib/sync/syncController'
import { SyncSettingsDialog } from '@/components/sync/SyncSettingsDialog'
import { SettingsDialog } from './SettingsDialog'

/**
 * Workspace header (feature #2, WI-3; Settings wired in feature #4, WI-1; Sync pill + dialog wired in
 * feature #9, WI-9d; responsive reflow feature #16) — the designed top bar. At ≥960 it shows the brand
 * wordmark + tagline, a keyboard run hint, the Sync status pill (opens Settings · Sync) and Settings.
 * Below 960 (`compact`) it reflows to a 4-element bar — ☰ drawer trigger (left, accent-active while the
 * drawer is open), centered brand+wordmark, and a compacted pill + gear on the right — dropping the
 * tagline, run hint, and divider rules (design Section A/B). The provider/API-key dialog (#13) and the
 * sync dialog each own their own trigger; the Workspace owns the sync controller + open state.
 */
export interface WorkspaceHeaderProps {
  controller: SyncController
  syncSettingsOpen: boolean
  onSyncSettingsChange: (open: boolean) => void
  /** Below 960: reflow to the compact 4-element bar (☰ / centered brand / pill+gear). */
  compact?: boolean
  /** The drawer hamburger (a SidebarDrawer Sheet trigger) rendered in the left slot when compact. */
  drawerTrigger?: ReactNode
}

export function WorkspaceHeader({
  controller,
  syncSettingsOpen,
  onSyncSettingsChange,
  compact = false,
  drawerTrigger,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation()

  if (compact) {
    return (
      <header className="flex h-[50px] shrink-0 items-center justify-between border-b bg-[var(--bg-color)] px-[14px]">
        <div className="flex flex-1 items-center">{drawerTrigger}</div>
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-[var(--accent-primary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.02em]">{t('common.appName')}</span>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <SyncSettingsDialog controller={controller} open={syncSettingsOpen} onOpenChange={onSyncSettingsChange} />
          <SettingsDialog />
        </div>
      </header>
    )
  }

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
