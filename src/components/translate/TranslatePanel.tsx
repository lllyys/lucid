import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { usePanelRun } from '@/hooks/usePanelRun'
import { detectDirection, directionLabels } from '@/lib/translation/detectDirection'
import { bidiAttrs, type BidiOverride } from '@/lib/translation/bidi'
import { notify } from '@/components/workspace/notify'
import { recordTask } from '@/lib/sessions/recordTask'
import { TranslateResult } from './TranslateResult'
import { DirectionOverride } from './DirectionOverride'

/**
 * Translate panel (feature #2, WI-8; direction override added feature #4, WI-4) — automatic
 * two-way 中↔EN. The translation route is detected from the source; the direction override
 * (#17b) changes only the source editor's VISUAL layout (dir + unicode-bidi), never the request
 * language (plan v4 §3). Run streams via usePanelRun → operationStore; editing the source resets
 * the op (stale-input guard).
 */
export function TranslatePanel() {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [acceptedText, setAcceptedText] = useState<string | null>(null)
  const [dirOverride, setDirOverride] = useState<BidiOverride>('auto')
  const op = useOperationStore((s) => s.translate)
  const { run, abort } = usePanelRun()

  const labels = directionLabels(detectDirection(source))
  const isStreaming = op.status === 'streaming'
  const srcBidi = bidiAttrs(dirOverride)

  const onRun = () => {
    if (isStreaming) {
      abort('translate')
      return
    }
    if (!source.trim()) return
    setAcceptedText(null)
    run('translate', { kind: 'translate', text: source, sourceLang: labels.srcCode, targetLang: labels.tgtCode })
  }
  const onSourceChange = (value: string) => {
    setSource(value)
    setAcceptedText(null)
    useOperationStore.getState().reset('translate')
  }
  const swap = () => {
    if (op.status === 'done') {
      setSource(op.text)
      setAcceptedText(null)
      useOperationStore.getState().reset('translate')
    }
  }
  const clear = () => {
    setSource('')
    setAcceptedText(null)
    useOperationStore.getState().reset('translate')
  }
  const onAccept = (text: string) => {
    setAcceptedText(text) // commit the accepted working translation (rule 66 §2 — not a bare toast)
    recordTask('translate', source, text) // save it to the active session (feature #3, WI-7)
    notify(t('toast.translateAccepted'))
  }

  return (
    <section className="flex min-h-[296px] flex-col border-b">
      <div className="flex items-center justify-between px-[22px] pb-1 pt-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--accent-ink)]">
            {t('translate.label')}
          </span>
          <div className="flex items-center gap-2 rounded-md border bg-[var(--bg-color)] px-2.5 py-[5px] text-[12.5px] font-semibold">
            <span>{labels.srcNative}</span>
            <span className="text-[var(--accent-ink)]">→</span>
            <span>{labels.tgtNative}</span>
          </div>
          <span className="rounded-md bg-[var(--success-bg)] px-1.5 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.05em] text-[var(--success)]">
            {t('translate.auto')}
          </span>
          <DirectionOverride value={dirOverride} onChange={setDirOverride} sampleText={source} />
          <button
            type="button"
            onClick={swap}
            title={t('translate.swap')}
            className="flex size-7 items-center justify-center rounded-md border bg-[var(--bg-color)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
          >
            ⇄
          </button>
        </div>
        <button
          type="button"
          onClick={onRun}
          className={`rounded-[10px] px-[17px] py-[9px] text-[13.5px] font-semibold ${
            isStreaming
              ? 'border bg-[var(--bg-tertiary)] text-[var(--text-color)] hover:bg-[var(--hover-bg)]'
              : 'bg-[var(--accent-primary)] text-[var(--on-accent)]'
          }`}
        >
          {isStreaming ? t('translate.stop') : t('translate.run')}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <section className="flex flex-1 flex-col border-r bg-[var(--bg-color)]">
          <div className="flex items-center justify-between px-[22px] pb-2 pt-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
              {t('translate.source')}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-[var(--text-disabled)]">
                {t('translate.charCount', { count: source.length })}
              </span>
              <button type="button" onClick={clear} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-color)]">
                {t('translate.clear')}
              </button>
            </div>
          </div>
          <textarea
            aria-label={t('translate.source')}
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            placeholder={t('translate.sourcePlaceholder')}
            spellCheck={false}
            dir={srcBidi.dir}
            style={{ ...srcBidi.style, textAlign: 'start' }}
            className="min-h-0 flex-1 resize-none bg-transparent px-6 pb-6 font-serif text-[19px] leading-[1.75]"
          />
        </section>
        <section className="flex flex-1 flex-col bg-[var(--bg-canvas)] px-6 py-4">
          <span className="mb-2 font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
            {t('translate.translation')}
          </span>
          <TranslateResult
            accepted={op.status === 'done' && acceptedText === op.text}
            onAccept={onAccept}
            onRetry={onRun}
          />
        </section>
      </div>
    </section>
  )
}
