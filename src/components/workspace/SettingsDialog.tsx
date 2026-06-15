import { useState } from 'react'
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
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import { implementedPresentations, presentationFor } from '@/lib/providers/providerPresentation'
import { maskKey, validateKeyShape } from '@/lib/providers/apiKey'
import { applyKeyChange } from '@/lib/providers/keyChange'

/**
 * Provider Settings / API-key entry (feature #4, WI-1 — designed surface #13). Lists the
 * IMPLEMENTED providers only (rule 51 — no silent no-op rows; Anthropic today) and edits the
 * active vendor's key. Save validates the key SHAPE (a typo guard, not auth), then routes through
 * `applyKeyChange` so changing/clearing the key aborts any in-flight panel and clears a runtime
 * `invalidKey` rejection. The key is held in memory for this session only — never persisted,
 * never logged (rule 65 §5); the copy says exactly that (NOT "secure storage").
 */
export function SettingsDialog() {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const apiKey = useProviderStore((s) => s.apiKey)
  const translate = useOperationStore((s) => s.translate)
  const polish = useOperationStore((s) => s.polish)
  const draftTranslate = useOperationStore((s) => s.draftTranslate)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [shapeError, setShapeError] = useState('') // i18n key, or '' when none

  // Closing discards the unsaved draft + reveal so reopening can't expose a typed-but-unsaved key.
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setDraft('')
      setReveal(false)
      setShapeError('')
    }
  }

  const providers = implementedPresentations()
  const activeLabel = t(presentationFor(vendor).labelKey)
  const masked = maskKey(apiKey)
  const hasKey = apiKey.trim() !== ''
  // A runtime 401 is the authoritative "invalid key" — reflected by any panel op left in invalidKey
  // for the active provider. A key change resets those ops (applyKeyChange), so this tracks the live key.
  const runtimeInvalid = [translate, polish, draftTranslate].some(
    (op) => op.status === 'error' && op.error.kind === 'invalidKey',
  )

  const save = () => {
    const res = validateKeyShape(vendor, draft)
    if (!res.ok) {
      setShapeError(res.messageKey ?? 'settings.keyRequired')
      return
    }
    setShapeError('')
    applyKeyChange(draft.trim())
    setDraft('')
    setReveal(false)
  }
  const clear = () => {
    applyKeyChange('')
    setDraft('')
    setShapeError('')
  }

  const errorMsg = shapeError
    ? t(shapeError, { provider: activeLabel })
    : runtimeInvalid
      ? t('settings.keyRejected')
      : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-[7px] rounded-md border bg-[var(--bg-color)] px-[10px] py-1.5 font-sans text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          <span className="h-[13px] w-[13px] rounded-full border-[1.5px] border-[var(--text-tertiary)]" />
          {t('header.settings')}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-w-[580px] gap-0 border-[var(--border-color)] bg-[var(--bg-color)] p-0"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-[var(--border-color)] p-4 text-left">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-[15px] font-semibold text-[var(--text-color)]">
              {t('settings.title')}
            </DialogTitle>
            <DialogDescription className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
              {t('settings.subtitle')}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t('settings.close')}
            className="flex size-[30px] items-center justify-center rounded-[9px] border bg-[var(--bg-color)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            ✕
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0">
          <div className="flex w-[200px] shrink-0 flex-col gap-1.5 border-r border-[var(--border-color)] p-3">
            <span className="px-1 pb-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              {t('settings.providerHeading')}
            </span>
            {providers.map((p) => {
              const active = p.vendor === vendor
              const set = active && hasKey
              return (
                <div
                  key={p.vendor}
                  aria-current={active ? 'true' : undefined}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                  style={active ? { background: 'var(--accent-bg)' } : undefined}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${p.dotToken})` }} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[12.5px] font-semibold text-[var(--text-color)]">
                      {t(p.labelKey)}
                    </span>
                    <span className="font-mono text-[9.5px] text-[var(--text-tertiary)]">
                      {set ? t('settings.statusKeySet') : t('settings.statusNoKey')}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-[18px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-[var(--text-color)]">{activeLabel}</span>
            </div>

            {hasKey && (
              <div className="flex items-center gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
                <span className="flex-1 font-mono text-[12.5px] tracking-[0.02em] text-[var(--text-color)]">
                  {masked}
                </span>
                <span className="rounded-md bg-[var(--success-bg)] px-1.5 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--success)]">
                  {t('settings.savedBadge')}
                </span>
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-lg border bg-[var(--bg-color)] px-2.5 py-[5px] text-[11.5px] text-[var(--error-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
                >
                  {t('settings.clear')}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                {t('settings.keyLabel')}
              </span>
              <div className="flex items-center gap-2 rounded-[11px] border bg-[var(--bg-color)] py-1 pl-3 pr-1 focus-within:border-[var(--accent-primary)]">
                <input
                  type={reveal ? 'text' : 'password'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('settings.keyPlaceholder')}
                  aria-label={t('settings.keyLabel')}
                  spellCheck={false}
                  className="flex-1 border-none bg-transparent py-1.5 font-mono text-[13px] text-[var(--text-color)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="rounded-md px-2 py-1.5 font-mono text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
                >
                  {reveal ? t('settings.hide') : t('settings.reveal')}
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-[7px] text-[12.5px] font-semibold text-[var(--on-accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
                >
                  {t('settings.save')}
                </button>
              </div>
              {errorMsg && (
                <span role="alert" className="text-[11.5px] text-[var(--error-color)]">
                  {errorMsg}
                </span>
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
              <span className="text-[13px] text-[var(--text-tertiary)]">🔒</span>
              <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
                {t('settings.memoryNote', { provider: activeLabel })}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
