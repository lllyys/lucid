import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { ResultBanner } from '@/components/workspace/ResultBanner'
import { WordLookupPopover } from '@/components/lookup/WordLookupPopover'

/**
 * Translate result pane (feature #2, WI-8; error/cancelled banner added feature #4, WI-5; word
 * lookup added feature #20, WI-6). States: idle (italic placeholder), streaming (text + live
 * caret), done (text + Copy/Accept), error/cancelled (partial text kept — rule 65 §3 — plus a
 * localized ResultBanner #14). The done result text renders through WordLookupPopover so each word
 * is a clickable dictionary lookup; words are interactive only at `done` so a stale offset can
 * never be clicked while the text still grows.
 *
 * Accept COMMITS the result to the panel (via onAccept) — it is not a bare toast (rule 66 §2);
 * the panel owns the accepted working translation and shows the "accepted" state here.
 */
export function TranslateResult({
  accepted,
  onAccept,
  onRetry,
}: {
  accepted: boolean
  onAccept: (text: string) => void
  onRetry: () => void
}) {
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
      <div
        dir="auto"
        style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
        className="whitespace-pre-wrap font-serif text-[20px] leading-[1.78]"
      >
        <WordLookupPopover text={op.text} done={op.status === 'done'} owner="translateResult" />
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
            onClick={() => onAccept(op.text)}
            className="rounded-md bg-[var(--success-solid)] px-3 py-1 text-[12px] font-semibold text-[var(--on-accent)] hover:bg-[var(--success-hover)]"
          >
            {accepted ? t('common.accepted') : t('common.accept')}
          </button>
        </div>
      )}
      {(op.status === 'error' || op.status === 'cancelled') && (
        <ResultBanner
          status={op.status}
          error={op.status === 'error' ? op.error : undefined}
          hasPartial={op.text !== ''}
          onRetry={onRetry}
        />
      )}
    </div>
  )
}
