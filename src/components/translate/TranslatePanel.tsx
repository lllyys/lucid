import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { usePanelRun } from '@/hooks/usePanelRun'
import { useAutoRunDebounce } from '@/hooks/useAutoRunDebounce'
import { useAutoRunPanel } from '@/hooks/useAutoRunPanel'
import { detectDirection, directionLabels } from '@/lib/translation/detectDirection'
import { bidiAttrs, type BidiOverride } from '@/lib/translation/bidi'
import { isRunNowShortcut } from '@/lib/workspace/runNowShortcut'
import { isMacPlatform } from '@/lib/workspace/platform'
import type { LLMRequest } from '@/providers/types'
import { notify } from '@/components/workspace/notify'
import { useAutoRecordTask } from '@/hooks/useAutoRecordTask'
import { AutoRunToggle } from '@/components/autorun/AutoRunToggle'
import { AutoRunPendingChip } from '@/components/autorun/AutoRunPendingChip'
import { AutoRunCostDialog } from '@/components/autorun/AutoRunCostDialog'
import { AutoRunPausedBanner } from '@/components/autorun/AutoRunPausedBanner'
import { AutoTag } from '@/components/autorun/AutoTag'
import { TranslateResult } from './TranslateResult'
import { DirectionOverride } from './DirectionOverride'

const AUTORUN_DEBOUNCE_MS = 1500

/**
 * Translate panel (feature #2, WI-8; direction override added feature #4, WI-4) — automatic
 * two-way 中↔EN. The translation route is detected from the source; the direction override
 * (#17b) changes only the source editor's VISUAL layout (dir + unicode-bidi), never the request
 * language (plan v4 §3). Run streams via usePanelRun → operationStore; editing the source resets
 * the op (stale-input guard). Auto-run (feature #11, opt-in via the header toggle) debounces a run
 * after typing settles — IME-safe, cost-gated on hosted providers, paused when the provider is
 * unready; a manual Run now / ⌘↵ cancels the pending timer and fires immediately (no AUTO tag).
 */
export function TranslatePanel() {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [acceptedText, setAcceptedText] = useState<string | null>(null)
  const [dirOverride, setDirOverride] = useState<BidiOverride>('auto')
  const op = useOperationStore((s) => s.translate)
  const { run, abort } = usePanelRun()
  const auto = useAutoRunPanel('translate')
  const debounce = useAutoRunDebounce('translate', { debounceMs: AUTORUN_DEBOUNCE_MS })
  useAutoRecordTask('translate', 'translate', source) // feature #14 — auto-save each completed run to history

  const labels = directionLabels(detectDirection(source))
  const isStreaming = op.status === 'streaming'
  const srcBidi = bidiAttrs(dirOverride)

  // Build the translate request from the latest source text (auto-run + manual share one builder).
  const buildRequest = (text: string): LLMRequest => {
    const l = directionLabels(detectDirection(text))
    return { kind: 'translate', text, sourceLang: l.srcCode, targetLang: l.tgtCode }
  }

  const runNow = () => {
    if (isStreaming) {
      abort('translate')
      return
    }
    if (!source.trim()) return
    debounce.cancel() // a manual run short-circuits any pending auto-run
    setAcceptedText(null)
    run('translate', buildRequest(source)) // isAuto=false → no AUTO tag
  }
  const onSourceChange = (value: string) => {
    setSource(value)
    setAcceptedText(null)
    useOperationStore.getState().reset('translate')
    if (auto.enabled) debounce.scheduleRun(buildRequest(value))
  }
  const onSourceKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isRunNowShortcut(e.nativeEvent, isMacPlatform())) {
      e.preventDefault()
      runNow()
    }
  }
  // Composition commit must ALWAYS clear the hook's composing flag (else future schedules stay
  // blocked); onCompositionEnd does that + re-arms. When auto is off, cancel the just-armed timer.
  const onSourceCompositionEnd = (value: string) => {
    debounce.onCompositionEnd(buildRequest(value))
    if (!auto.enabled) debounce.cancel()
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
    // Commit the accepted working translation to the editor (rule 66 §2). History is auto-saved on the
    // run's completion (feature #14), so Accept no longer records — it only commits to the editor.
    setAcceptedText(text)
    notify(t('toast.translateAccepted'))
  }

  return (
    <section className="flex min-h-[296px] shrink-0 flex-col border-b">
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
        <div className="flex items-center gap-3.5">
          <AutoRunToggle enabled={auto.enabled} canEnable={auto.canEnable} onToggle={auto.requestToggle} />
          <button
            type="button"
            onClick={runNow}
            className={`rounded-[10px] px-[17px] py-[9px] text-[13.5px] font-semibold ${
              isStreaming || auto.enabled
                ? 'border bg-[var(--bg-color)] text-[var(--text-color)] hover:bg-[var(--hover-bg)]'
                : 'bg-[var(--accent-primary)] text-[var(--on-accent)]'
            }`}
          >
            {isStreaming ? t('translate.stop') : auto.enabled ? t('autorun.runNow') : t('translate.run')}
          </button>
        </div>
      </div>

      {auto.paused && (
        <div className="px-[22px] pb-2">
          <AutoRunPausedBanner />
        </div>
      )}

      <div className="flex items-start">
        <section className="flex flex-1 flex-col border-r bg-[var(--bg-color)]">
          <div className="flex items-center justify-between px-[22px] pb-2 pt-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
              {t('translate.source')}
            </span>
            <div className="flex items-center gap-3">
              {debounce.isPending && (
                <AutoRunPendingChip
                  debounceMs={AUTORUN_DEBOUNCE_MS}
                  pendingKey={debounce.pendingKey}
                  onCancel={debounce.cancel}
                  variant="footer"
                />
              )}
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
            onCompositionStart={debounce.onCompositionStart}
            onCompositionEnd={(e) => onSourceCompositionEnd(e.currentTarget.value)}
            onKeyDown={onSourceKeyDown}
            placeholder={t('translate.sourcePlaceholder')}
            spellCheck={false}
            dir={srcBidi.dir}
            style={{ ...srcBidi.style, textAlign: 'start' }}
            className="field-sizing-content min-h-[88px] max-h-[88vh] resize-none bg-transparent px-6 pb-6 font-serif text-[19px] leading-[1.75]"
          />
        </section>
        <section className="flex flex-1 flex-col bg-[var(--bg-canvas)] px-6 py-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
              {t('translate.translation')}
            </span>
            {op.status !== 'idle' && <AutoTag isAuto={op.isAuto} />}
          </div>
          <TranslateResult
            accepted={op.status === 'done' && acceptedText === op.text}
            onAccept={onAccept}
            onRetry={runNow}
          />
        </section>
      </div>

      <AutoRunCostDialog open={auto.costGateOpen} onOpenChange={auto.cancelCost} onConfirm={auto.confirmCost} />
    </section>
  )
}
