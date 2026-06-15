import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { createWordDiff, applyDiff, type DiffSegment } from '@/lib/polish/wordDiff'
import { ResultBanner } from '@/components/workspace/ResultBanner'

const wd = createWordDiff()

function segStyle(type: DiffSegment['type']): React.CSSProperties | undefined {
  if (type === 'add') return { background: 'var(--diff-add-bg)', color: 'var(--diff-add-fg)', borderRadius: '3px', padding: '0 2px' }
  if (type === 'del') return { color: 'var(--diff-del-fg)', textDecoration: 'line-through', opacity: 0.72 }
  return undefined
}

/**
 * Polished result pane (feature #2, WI-9). Result view = streaming text + caret / done text;
 * Compare view = the live word-diff of the draft vs the polished result. Accept commits the
 * whole-result text to the draft (rule 66 §2 — applyDiff over all change ids reproduces the
 * model result exactly). error/cancelled keep partial text with no message (needs-design #14).
 * The "meaning preserved" footer is needs-design #15 and intentionally not rendered.
 */
export function PolishResult({
  draft,
  onAccept,
  onRegenerate,
}: {
  draft: string
  onAccept: (text: string) => void
  onRegenerate: () => void
}) {
  const { t } = useTranslation()
  const op = useOperationStore((s) => s.polish)
  const [view, setView] = useState<'result' | 'compare'>('result')
  const [copied, setCopied] = useState(false)
  const isDone = op.status === 'done'
  const text = op.status === 'idle' ? '' : op.text
  const segs = useMemo(() => (isDone ? wd.diff(draft, text) : []), [isDone, draft, text])

  if (op.status === 'idle') {
    return (
      <p className="max-w-[44ch] font-serif text-[17px] italic leading-relaxed text-[var(--text-disabled)]">
        {t('polish.resultPlaceholder')}
      </p>
    )
  }

  const copy = () => {
    try {
      void navigator.clipboard?.writeText(text)
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  const accept = () => onAccept(applyDiff(segs, new Set(segs.filter((s) => s.type !== 'same').map((s) => s.id))))

  return (
    <div>
      {isDone && (
        <div className="mb-2 inline-flex gap-0.5 rounded-[7px] bg-[var(--bg-tertiary)] p-0.5">
          <button
            type="button"
            aria-pressed={view === 'result'}
            onClick={() => setView('result')}
            className="rounded-md px-2.5 py-0.5 text-[11.5px] font-medium aria-pressed:bg-[var(--bg-color)]"
          >
            {t('polish.result')}
          </button>
          <button
            type="button"
            aria-pressed={view === 'compare'}
            onClick={() => setView('compare')}
            className="rounded-md px-2.5 py-0.5 text-[11.5px] font-medium aria-pressed:bg-[var(--bg-color)]"
          >
            {t('polish.compare')}
          </button>
        </div>
      )}

      <div
        dir="auto"
        style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
        className="whitespace-pre-wrap font-serif text-[20px] leading-[1.78]"
      >
        {view === 'compare' && isDone ? (
          segs.map((s) => (
            <span key={s.id} style={segStyle(s.type)}>
              {s.value}
            </span>
          ))
        ) : (
          <>
            {text}
            {op.status === 'streaming' && (
              <span className="ml-px inline-block h-[0.95em] w-0.5 translate-y-0.5 bg-[var(--accent-primary)] [animation:lucid-caret_1s_steps(1)_infinite]" />
            )}
          </>
        )}
      </div>

      {(op.status === 'error' || op.status === 'cancelled') && (
        <ResultBanner
          status={op.status}
          error={op.status === 'error' ? op.error : undefined}
          hasPartial={op.text !== ''}
          onRetry={onRegenerate}
        />
      )}

      {isDone && (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onRegenerate} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-color)]">
            {t('polish.regenerate')}
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-md border bg-[var(--bg-color)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
          >
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button
            type="button"
            onClick={accept}
            className="rounded-md bg-[var(--success-solid)] px-3 py-1 text-[12px] font-semibold text-[var(--on-accent)] hover:bg-[var(--success-hover)]"
          >
            {t('common.accept')}
          </button>
        </div>
      )}
    </div>
  )
}
