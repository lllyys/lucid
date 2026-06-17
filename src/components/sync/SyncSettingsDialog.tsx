// Purpose: the Settings · Sync dialog (#9, WI-9d) — a CONTROLLED shadcn Dialog whose trigger IS the
// SyncStatusPill (Radix `asChild` forwards the toggle, so the pill needs no onOpenSettings here) and whose
// content wraps the already-built SyncSettingsPanel. Mirrors SettingsDialog's precedent (shadcn Dialog
// opened from a header affordance). The Workspace owns the controller + open state, so this is pure
// composition; every string via t() (rule 66 §5), tokens-only chrome (rule 30/31).

import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { SyncController } from '@/lib/sync/syncController'
import { SyncStatusPill } from './SyncStatusPill'
import { SyncSettingsPanel } from './SyncSettingsPanel'

export interface SyncSettingsDialogProps {
  controller: SyncController
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SyncSettingsDialog({ controller, open, onOpenChange }: SyncSettingsDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <SyncStatusPill />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-w-[520px] gap-0 overflow-hidden border-[var(--border-color)] bg-[var(--bg-color)] p-0"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-[var(--border-color)] p-4 text-left">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-[16px] font-semibold text-[var(--text-color)]">
              {t('sync.dialog.title')}
            </DialogTitle>
            <DialogDescription className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
              {t('sync.dialog.description')}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t('settings.close')}
            className="flex size-[31px] items-center justify-center rounded-[9px] border bg-[var(--bg-color)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            ✕
          </DialogClose>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto p-5">
          <SyncSettingsPanel controller={controller} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
