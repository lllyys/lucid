import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useProviderStore } from '@/stores/providerStore'
import { presentationFor } from '@/lib/providers/providerPresentation'

/**
 * The hosted-provider cost gate (feature #11, design Section A — "first enable · cost gate"). Shown
 * once per hosted vendor the first time auto-run is enabled on it; local providers never see it.
 * Accept → ack the vendor + enable; "Not now" → dismiss without enabling. A modal shadcn Dialog,
 * tokens + t() only (rules 30/66 §5).
 */
export function AutoRunCostDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const providerLabel = t(presentationFor(vendor).labelKey)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[380px] gap-0 overflow-hidden border-[var(--border-color)] bg-[var(--bg-color)] p-0"
      >
        <div className="flex flex-col gap-1.5 p-[16px_18px_6px]">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-6 flex-none items-center justify-center rounded-[7px] border border-[var(--warning-border)] bg-[var(--warning-bg)] text-[12px] text-[var(--warning)]"
            >
              ◔
            </span>
            <DialogTitle className="text-[14px] font-semibold text-[var(--text-color)]">
              {t('autorun.cost.title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] leading-[1.6] text-[var(--text-secondary)]">
            {t('autorun.cost.body', { provider: providerLabel })}
          </DialogDescription>
        </div>
        <div className="flex gap-2.5 p-[14px_18px_18px]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-none rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('autorun.cost.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-[9px] border-none bg-[var(--accent-primary)] py-2.5 text-[12.5px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('autorun.cost.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
