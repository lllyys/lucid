// Purpose: the Settings · Sync turn-off dialog (#9, WI-9c; #19 WI-3 restyle, design section E). A modal shadcn
// Dialog with the two-way choice — "Turn off sync" (keep server data) vs "Turn off & erase server data" —
// + Cancel / Turn off actions. The selected choice maps to the `erase` boolean passed to onConfirm; the panel
// awaits controller.disconnect({ erase }). Tokens only (rule 30/31); every string via t() (rule 66 §5).
// Choices use role="radio" (single-select); the keep choice is the default. Local-only selection state
// resets each time the dialog opens.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface DisconnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverUrl: string
  /** Pre-select the erase choice when the dialog opens (the "Disconnect & erase" zone button). */
  initialErase?: boolean
  onConfirm: (erase: boolean) => void
}

function Choice({
  selected,
  onSelect,
  title,
  sub,
  danger,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  sub: string
  danger?: boolean
}) {
  const accent = danger ? 'var(--error-color)' : 'var(--accent-primary)'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={title}
      onClick={onSelect}
      className="flex items-start gap-3 rounded-[13px] border p-[14px] text-left focus-visible:outline-2"
      style={{
        borderColor: danger ? 'var(--danger-border)' : 'var(--border-strong)',
        background: danger ? 'var(--error-bg)' : 'var(--bg-color)',
        outlineColor: accent,
      }}
    >
      <span
        aria-hidden
        className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
        style={{ borderColor: accent }}
      >
        {selected && <span className="size-2 rounded-full" style={{ background: accent }} />}
      </span>
      <span className="flex flex-col gap-[3px]">
        <span className="text-[13px] font-semibold" style={{ color: danger ? 'var(--error-color)' : 'var(--text-color)' }}>
          {title}
        </span>
        <span className="text-[11.5px] leading-[1.55]" style={{ color: danger ? 'var(--error-color)' : 'var(--text-tertiary)' }}>
          {sub}
        </span>
      </span>
    </button>
  )
}

export function DisconnectDialog({ open, onOpenChange, serverUrl, initialErase, onConfirm }: DisconnectDialogProps) {
  const { t } = useTranslation()
  const [erase, setErase] = useState(initialErase ?? false)

  // Reset the choice each time the dialog (re)opens — to the intent the opener passed (keep by default).
  useEffect(() => {
    if (open) setErase(initialErase ?? false)
  }, [open, initialErase])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[420px] gap-0 overflow-hidden border-[var(--border-color)] bg-[var(--bg-color)] p-0"
      >
        <div className="flex flex-col gap-[5px] p-[20px_22px_6px]">
          <DialogTitle className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">
            {t('sync.disconnect.dialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            {t('sync.disconnect.dialogBody')}
          </DialogDescription>
        </div>
        <div role="radiogroup" aria-label={t('sync.disconnect.dialogTitle')} className="flex flex-col gap-[11px] p-[14px_22px_22px]">
          <Choice
            selected={!erase}
            onSelect={() => setErase(false)}
            title={t('sync.disconnect.choiceKeep')}
            sub={t('sync.disconnect.choiceKeepSub')}
          />
          <Choice
            selected={erase}
            onSelect={() => setErase(true)}
            title={t('sync.disconnect.choiceErase')}
            sub={t('sync.disconnect.choiceEraseSub', { server: serverUrl })}
            danger
          />
          <div className="flex gap-[10px] pt-[5px]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[11px_18px] font-sans text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('sync.disconnect.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(erase)}
              className="flex-1 rounded-[10px] border-none bg-[var(--accent-primary)] p-[11px] font-sans text-[13px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('sync.disconnect.confirm')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
