import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { createWordDiff, applyDiff, type DiffSegment } from '@/lib/polish/wordDiff'
import { groupHunks, acceptedIdsForRejected, type Hunk } from '@/lib/polish/groupHunks'
import { cleanPolishOutput } from '@/lib/polish/cleanPolishOutput'
import { ResultBanner } from '@/components/workspace/ResultBanner'
import { useViewportTier } from '@/hooks/useViewportTier'
import { WordLookupPopover } from '@/components/lookup/WordLookupPopover'

const wd = createWordDiff()

function segStyle(type: DiffSegment['type'], struck: boolean): React.CSSProperties | undefined {
  if (type === 'add') return { background: 'var(--diff-add-bg)', color: 'var(--diff-add-fg)', borderRadius: '3px', padding: '0 2px' }
  // No opacity — `opacity: 0.72` composited --diff-del-fg to 3.42:1 on dark (AA fail); full color is 5.30:1.
  if (type === 'del') return struck ? { color: 'var(--diff-del-fg)', textDecoration: 'line-through' } : undefined
  return undefined
}

/**
 * Polished result pane (feature #2, WI-9; per-hunk accept/reject added feature #4, WI-7 — #15b).
 * Result view = streaming/done text; Compare view = the word-diff with per-hunk reject toggles,
 * Keep-all / Reject-all, and an "N of M kept" summary. Accept commits applyDiff over the kept
 * hunks (rule 66 §2); explicit Reject discards the polish and keeps the draft. The rejected set
 * resets whenever a new result arrives (keyed by the op's runId). error/cancelled → ResultBanner.
 */
export function PolishResult({
  draft,
  onAccept,
  onRegenerate,
  onReject,
}: {
  draft: string
  onAccept: (text: string) => void
  onRegenerate: () => void
  onReject: () => void
}) {
  const { t } = useTranslation()
  const op = useOperationStore((s) => s.polish)
  // On phone the Result/Compare toggle + hunk bar pin as a sticky sub-header so accept/reject stays
  // one tap away while the diff scrolls (design Section C). Tier-gated so desktop is byte-for-byte
  // unchanged (audit H3). Mobile tests mock useViewportTier; under jsdom it defaults to desktop.
  const isMobile = useViewportTier() === 'phone'
  const [view, setView] = useState<'result' | 'compare'>('result')
  const [copied, setCopied] = useState(false)
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set())
  const isDone = op.status === 'done'
  const runId = op.runId
  // On done, strip any model meta-prose (preamble / surrounding quotes / "Changes made:" list) so the
  // Result text, the Compare word-diff, copy, and Accept all use ONLY the polished sentence (bug #96).
  // While streaming we show the raw partial (preamble detection needs the full text).
  const text = op.status === 'idle' ? '' : isDone ? cleanPolishOutput(op.text) : op.text
  const segs = useMemo(() => (isDone ? wd.diff(draft, text) : []), [isDone, draft, text])
  const hunks = useMemo(() => groupHunks(segs), [segs])

  // A new result (new runId) clears any prior per-hunk rejections.
  useEffect(() => setRejected(new Set()), [runId])

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

  const accepted = acceptedIdsForRejected(hunks, rejected)
  const accept = () => onAccept(applyDiff(segs, accepted))
  const toggleHunk = (id: string) =>
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const keepAll = () => setRejected(new Set())
  const rejectAll = () => setRejected(new Set(hunks.map((h) => h.id)))
  const keptCount = hunks.length - hunks.filter((h) => rejected.has(h.id)).length

  // segment id → its hunk, so each segment renders its hunk's reject toggle (once, on the first id).
  const hunkBySeg = new Map<string, Hunk>()
  hunks.forEach((h) => h.segmentIds.forEach((id) => hunkBySeg.set(id, h)))

  const renderCompare = () =>
    segs.map((seg) => {
      if (seg.type === 'same') return <span key={seg.id}>{seg.value}</span>
      const hunk = hunkBySeg.get(seg.id)!
      const isRejected = rejected.has(hunk.id)
      const isFirst = hunk.segmentIds[0] === seg.id
      const chip = isFirst ? (
        <button
          key={`${seg.id}-chip`}
          type="button"
          aria-pressed={isRejected}
          aria-label={isRejected ? t('polish.keepHunk') : t('polish.rejectHunk')}
          onClick={() => toggleHunk(hunk.id)}
          className="mx-0.5 inline-flex size-[16px] -translate-y-px items-center justify-center rounded-[5px] border bg-[var(--bg-color)] align-middle text-[9px] leading-none focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          style={{ color: isRejected ? 'var(--success)' : 'var(--error-color)' }}
        >
          {isRejected ? '↩' : '✕'}
        </button>
      ) : null
      // A rejected add disappears; a rejected del is kept as plain text; a kept del is struck.
      if (seg.type === 'add' && isRejected) return chip
      return (
        <span key={seg.id}>
          {chip}
          <span style={segStyle(seg.type, !isRejected)}>{seg.value}</span>
        </span>
      )
    })

  return (
    <div>
      {isDone && (
        <div
          data-slot="polish-subheader"
          className={`mb-2 flex flex-wrap items-center gap-2 ${
            isMobile ? 'sticky top-0 z-10 -mx-6 border-b bg-[var(--bg-color)] px-6 py-2' : ''
          }`}
        >
          <div className="inline-flex gap-0.5 rounded-[7px] bg-[var(--bg-tertiary)] p-0.5">
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
          {view === 'compare' && hunks.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {t('polish.hunkSummary', { kept: keptCount, total: hunks.length })}
              </span>
              <button type="button" onClick={keepAll} className="rounded-[7px] border bg-[var(--bg-color)] px-2 py-[3px] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
                {t('polish.keepAll')}
              </button>
              <button type="button" onClick={rejectAll} className="rounded-[7px] border bg-[var(--bg-color)] px-2 py-[3px] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
                {t('polish.rejectAll')}
              </button>
            </div>
          )}
        </div>
      )}

      <div
        dir="auto"
        style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
        className="whitespace-pre-wrap font-serif text-[20px] leading-[1.78]"
      >
        {view === 'compare' && isDone ? (
          renderCompare()
        ) : (
          <>
            <WordLookupPopover text={text} done={isDone} owner="polishResult" />
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
        <>
          {view === 'compare' && (
            <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">{t('polish.reviewHint')}</p>
          )}
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
              onClick={onReject}
              title={t('polish.rejectTitle')}
              className="rounded-md border bg-[var(--bg-color)] px-3 py-1 text-[12px] text-[var(--text-color)] hover:bg-[var(--hover-bg)]"
            >
              {t('polish.reject')}
            </button>
            <button
              type="button"
              onClick={accept}
              className="rounded-md bg-[var(--success-solid)] px-3 py-1 text-[12px] font-semibold text-[var(--on-accent)] hover:bg-[var(--success-hover)]"
            >
              {t('common.accept')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
