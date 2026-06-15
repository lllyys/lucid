import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { notify } from '@/components/workspace/notify'

/**
 * Translate result pane (feature #2, WI-8). Renders the three DESIGNED states: idle
 * (italic placeholder), streaming (text + live caret), done (text + Copy/Accept). On
 * error/cancelled it keeps the partial text visible (rule 65 §3) with no caret and no
 * message — the error/cancelled MESSAGE surface is needs-design #14.
 */
export function TranslateResult() {
  const { t } = useTranslation()
  const op = useOperationStore((s) => s.translate)
  const [copied, setCopied] = useState(false)

  if (op.status === 'idle') {
    return (
      <p className="max-w-[42ch] font-serif text-[17px] italic leading-relaxed text-[var(--text-disabled)]">
        {t('translate.resultPlaceholder')}
      </p>
    )
  }

  const copy = () => {
    try {
      void navigator.clipboard?.writeText(op.text)
    } catch {
      /* clipboard unavailable (e.g. jsdom) — the visible text is still selectable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div>
      <div className="whitespace-pre-wrap font-serif text-[20px] leading-[1.78]">
        {op.text}
        {op.status === 'streaming' && (
          <span className="ml-px inline-block h-[0.95em] w-0.5 translate-y-0.5 bg-[var(--accent-primary)] [animation:lucid-caret_1s_steps(1)_infinite]" />
        )}
      </div>
      {op.status === 'done' && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-md border bg-[var(--bg-color)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
          >
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button
            type="button"
            onClick={() => notify(t('toast.translateAccepted'))}
            className="rounded-md bg-[var(--success)] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[var(--success-hover)]"
          >
            {t('common.accept')}
          </button>
        </div>
      )}
    </div>
  )
}
