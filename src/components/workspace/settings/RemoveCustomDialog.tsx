// Purpose: the remove-custom-provider confirm dialog (#10 WI-3, design Section D). A shadcn Dialog
// confirming the destructive remove: it forgets the endpoint/model/in-memory key. When the removed
// custom is the ACTIVE provider, an accent notice tells the user the workspace will fall back to a
// built-in (the store falls back to anthropic per WI-2). Removing a non-active custom shows no notice
// (a quiet one-step delete). Esc / outside-click / Cancel dismiss without removing.

import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RemoveCustomDialogProps {
  open: boolean
  /** The label of the custom being removed (shown in the title + body). */
  label: string
  /** True when this custom is the active workspace provider — shows the fallback notice. */
  isActive: boolean
  /** The built-in label the workspace falls back to when removing the active custom (e.g. "Anthropic"). */
  fallbackLabel?: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function RemoveCustomDialog({
  open,
  label,
  isActive,
  fallbackLabel,
  onConfirm,
  onOpenChange,
}: RemoveCustomDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[400px] gap-0 overflow-hidden border-[var(--border-color)] bg-[var(--bg-color)] p-0"
      >
        <DialogHeader className="space-y-1.5 p-5 pb-1.5 text-left">
          <DialogTitle className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">
            {t('settings.removeCustomTitle', { label })}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            {t('settings.removeCustomBody')}
          </DialogDescription>
        </DialogHeader>

        {isActive && (
          <div className="mx-5 my-3.5 flex items-center gap-2.5 rounded-[11px] border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3.5 py-3">
            <span className="size-2 shrink-0 rounded-full bg-[var(--accent-primary)]" />
            <span className="text-[11.5px] leading-[1.55] text-[var(--text-secondary)]">
              {t('settings.removeCustomActiveNotice', { fallback: fallbackLabel ?? '' })}
            </span>
          </div>
        )}

        <div className="flex gap-2.5 px-5 pb-5 pt-2">
          <DialogClose
            className="shrink-0 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('settings.cancel')}
          </DialogClose>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-[10px] border border-[var(--error-color)] bg-[var(--error-bg)] px-3 py-2.5 text-[13px] font-semibold text-[var(--error-color)] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-[var(--error-color)]"
          >
            {t('settings.removeProvider')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
