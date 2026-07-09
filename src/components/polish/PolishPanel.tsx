import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'
import { usePanelRun } from '@/hooks/usePanelRun'
import { useAutoRunDebounce } from '@/hooks/useAutoRunDebounce'
import { useAutoRunPanel } from '@/hooks/useAutoRunPanel'
import { notify } from '@/components/workspace/notify'
import { cleanPolishOutput } from '@/lib/polish/cleanPolishOutput'
import { isRunNowShortcut } from '@/lib/workspace/runNowShortcut'
import { isMacPlatform } from '@/lib/workspace/platform'
import type { LLMRequest, PolishGoal } from '@/providers/types'
import { useAutoRecordTask } from '@/hooks/useAutoRecordTask'
import { AutoRunToggle } from '@/components/autorun/AutoRunToggle'
import { AutoRunPendingChip } from '@/components/autorun/AutoRunPendingChip'
import { AutoRunCostDialog } from '@/components/autorun/AutoRunCostDialog'
import { AutoRunPausedBanner } from '@/components/autorun/AutoRunPausedBanner'
import { AutoTag } from '@/components/autorun/AutoTag'
import { OriginalCard } from './OriginalCard'
import { DraftCard } from './DraftCard'
import { KeywordsCard } from './KeywordsCard'
import { PolishResult } from './PolishResult'
import { GoalChips } from './GoalChips'

const AUTORUN_DEBOUNCE_MS = 1500

/**
 * Polish panel (feature #2, WI-9) — refine a draft against its original meaning + domain
 * keywords. "Translate original" streams a translation of the Original into the Draft (the
 * draftTranslate op, mirrored into the draft field); Polish is blocked while that runs.
 * Polish streams the result; Accept commits the whole result to the draft (rule 66 §2). Any
 * input edit resets the polish op so a stale stream can't overwrite newer input. Auto-run
 * (feature #11, opt-in toggle) debounces a re-polish after draft/original/keyword/target-lang edits
 * settle — but NEVER arms off the draftTranslate mirror's machine-writes (the `translating` guard);
 * it is IME-safe, cost-gated on hosted providers, and paused when the provider is unready.
 */
export function PolishPanel() {
  const { t } = useTranslation()
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('en')
  const [original, setOriginal] = useState('')
  const [draft, setDraft] = useState('')
  const [goal, setGoal] = useState<PolishGoal>('clarity')
  // Keywords live in a store (feature #3) so the sidebar Glossary's "use" can inject a term. The
  // store holds Keyword entities (#9 sync envelope); the card + the polish request want bare values.
  const keywords = usePolishKeywordsStore((s) => s.keywords)
  const keywordValues = keywords.map((k) => k.value)
  const polishOp = useOperationStore((s) => s.polish)
  const dt = useOperationStore((s) => s.draftTranslate)
  const { run, abort } = usePanelRun()
  const auto = useAutoRunPanel('polish')
  const debounce = useAutoRunDebounce('polish', { debounceMs: AUTORUN_DEBOUNCE_MS })
  // feature #14 — auto-save each completed polish run; store the CLEANED result (feature #96), not prose.
  // feature #25 — carry the "keywords kept" the run was told to preserve onto the task for the read view.
  useAutoRecordTask('polish', 'polish', draft, cleanPolishOutput, { keywords: keywordValues })

  const translating = dt.status === 'streaming'
  const isPolishing = polishOp.status === 'streaming'
  const dtText = dt.status === 'idle' ? '' : dt.text

  // Build the polish request from the latest field values (auto-run + manual share one builder). The
  // overrides let an onChange handler use the value it JUST received before React state has committed.
  const buildPolishRequest = (over: {
    draft?: string
    original?: string
    lang?: string
    keywords?: readonly string[]
    goal?: PolishGoal
  } = {}): LLMRequest => {
    const d = over.draft ?? draft
    const o = (over.original ?? original).trim()
    const kw = over.keywords ?? keywordValues
    return {
      kind: 'polish',
      text: d,
      goal: over.goal ?? goal,
      lang: over.lang ?? tgtLang,
      original: o || undefined,
      keywords: kw.length ? kw : undefined,
    }
  }
  // Arm auto-polish on a user edit — but NEVER while "Translate original" is streaming (it
  // machine-writes the draft via the mirror; arming on that would fire on text the user didn't type).
  const armPolish = (req: LLMRequest) => {
    if (auto.armed && !translating) debounce.scheduleRun(req)
  }
  // Composition commit must ALWAYS clear the hook's composing flag (else future schedules stay blocked);
  // onCompositionEnd does that + re-arms. If we mustn't arm (not armed, or translating), cancel it.
  const onSourceCompositionEnd = (req: LLMRequest) => {
    debounce.onCompositionEnd(req)
    if (!auto.armed || translating) debounce.cancel()
  }

  // Mirror the draftTranslate stream into the editable draft (then local edits own it).
  useEffect(() => {
    if (dt.status === 'streaming' || dt.status === 'done') setDraft(dtText)
  }, [dt.status, dtText])

  const resetPolish = () => useOperationStore.getState().reset('polish')
  // A keyword change (KeywordsCard or the Glossary "use") invalidates a showing polish result — reset +
  // re-polish. Compare keyword VALUES (a JSON key), NOT the array reference (bug #11): the sync reconcile
  // re-applies keywords each cycle with a fresh array of identical content — a ref compare falsely wiped it.
  const keywordsKey = JSON.stringify(keywordValues)
  const prevKeywordsKey = useRef(keywordsKey)
  useEffect(() => {
    if (prevKeywordsKey.current !== keywordsKey) {
      prevKeywordsKey.current = keywordsKey
      resetPolish()
      // A keyword change feeds the polish request — arm auto-polish with the new keyword set.
      armPolish(buildPolishRequest({ keywords: keywordValues }))
    }
    // armPolish/buildPolishRequest read fresh values via closure each render; the value key is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordsKey])
  // Original / draft / language edits invalidate BOTH the polish result AND any in-flight or stale
  // "Translate original" output (which mirrors into the draft) — reset both so a superseded
  // draftTranslate stream can never overwrite newer user input.
  const resetForInput = () => {
    const ops = useOperationStore.getState()
    ops.reset('polish')
    ops.reset('draftTranslate')
  }
  const onStopTranslate = () => abort('draftTranslate')

  // Clear (feature #23): wipe the Original + reset the dependent ops — a dedicated NON-arming handler.
  // It deliberately does NOT route through onOriginal/armPolish: that would schedule a debounced LLM
  // re-polish on Clear under auto-run (the draft is still present). Mirrors the translate source clear()
  // (which never arms). Cancel any pending auto-run so its chip dismisses immediately (runId guard
  // already neutralizes the stale timer; this is the cosmetic dismissal).
  const clearOriginal = () => {
    setOriginal('')
    resetForInput()
    debounce.cancel()
  }

  // Clear (feature #27): the DRAFT sibling of clearOriginal — wipe the draft + reset the dependent
  // polish/draftTranslate ops, a dedicated NON-arming handler. Routing through onDraft/armPolish would
  // schedule a debounced auto-polish of the (now-empty) draft under auto-run (#23's trap); this never
  // arms and cancels any pending auto-run so its chip dismisses immediately. Visibility (`!translating`)
  // is owned by DraftCard, so Clear stays live while the polish op streams (clearing resets it).
  const clearDraft = () => {
    setDraft('')
    resetForInput()
    debounce.cancel()
  }

  const onTranslateOriginal = () => {
    if (!original.trim()) return
    // A fresh translation produces a new draft, so any polish result on screen is now stale —
    // drop it (and its Accept) so it can't be accepted into a draft this stream is about to own.
    resetPolish()
    run('draftTranslate', { kind: 'translate', text: original, sourceLang: srcLang, targetLang: tgtLang })
  }
  const onPolish = () => {
    if (isPolishing) {
      abort('polish')
      return
    }
    if (translating || !draft.trim()) return
    debounce.cancel() // a manual run short-circuits any pending auto-run
    run('polish', buildPolishRequest()) // isAuto=false → no AUTO tag
  }
  const onSourceKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isRunNowShortcut(e.nativeEvent, isMacPlatform())) {
      e.preventDefault()
      onPolish()
    }
  }
  const onOriginal = (v: string) => {
    setOriginal(v)
    resetForInput()
    armPolish(buildPolishRequest({ original: v }))
  }
  const onDraft = (v: string) => {
    setDraft(v)
    resetForInput()
    armPolish(buildPolishRequest({ draft: v }))
  }
  const onSrcLang = (c: string) => {
    setSrcLang(c)
    resetForInput()
    // Source language drives "Translate original", not the polish request — no auto-polish arm here.
  }
  const onTgtLang = (c: string) => {
    setTgtLang(c)
    resetForInput()
    armPolish(buildPolishRequest({ lang: c }))
  }
  // A goal change invalidates a showing polish result (it was computed under the OLD goal) — reset it
  // (mirrors the keywords-change effect) + arm auto-polish with the just-selected goal (the fresh value,
  // not the not-yet-committed state). Routed through armPolish so it inherits the !translating guard.
  const onChangeGoal = (g: PolishGoal) => {
    setGoal(g)
    resetPolish()
    armPolish(buildPolishRequest({ goal: g }))
  }
  // The keywords-change effect above resets the polish op; these just mutate the store.
  const addKeyword = (k: string) => usePolishKeywordsStore.getState().addKeyword(k)
  const removeKeyword = (k: string) => usePolishKeywordsStore.getState().removeKeyword(k)
  const onAccept = (text: string) => {
    // Commit the (possibly per-hunk-edited) polish to the draft. History is auto-saved on the run's
    // completion (feature #14) with the FULL cleaned result, so Accept no longer records here.
    setDraft(text)
    // Commit the polished text AND stop any in-flight "Translate original" — otherwise its next
    // mirrored chunk would clobber the text we just accepted.
    resetForInput()
    notify(t('toast.polishAccepted'))
  }
  const onReject = () => {
    // Discard the polish result entirely; the draft is left exactly as-is (rule 66 §2).
    resetPolish()
    notify(t('toast.polishRejected'))
  }

  return (
    <section className="flex min-h-[420px] flex-1 flex-col">
      <div className="flex items-center justify-between px-[22px] pb-1 pt-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--accent-ink)]">
            {t('polish.label')}
          </span>
          {debounce.isPending ? (
            <span className="inline-flex items-center rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-2.5 py-1.5">
              <AutoRunPendingChip
                debounceMs={AUTORUN_DEBOUNCE_MS}
                pendingKey={debounce.pendingKey}
                onCancel={debounce.cancel}
                variant="footer"
              />
            </span>
          ) : (
            <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.subtitle')}</span>
          )}
        </div>
        <div className="flex items-center gap-3.5">
          <AutoRunToggle enabled={auto.enabled} canEnable={auto.canEnable} onToggle={auto.requestToggle} />
          <button
            type="button"
            onClick={onPolish}
            disabled={translating}
            className={`rounded-[10px] px-[17px] py-[9px] text-[13.5px] font-semibold disabled:opacity-40 ${
              isPolishing || auto.enabled
                ? 'border bg-[var(--bg-color)] text-[var(--text-color)] hover:bg-[var(--hover-bg)]'
                : 'bg-[var(--accent-primary)] text-[var(--on-accent)]'
            }`}
          >
            {isPolishing ? t('polish.stop') : auto.enabled ? t('autorun.runNow') : t('polish.run')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-[22px] pb-1.5">
        <span aria-hidden className="font-mono text-[10px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
          {t('polish.goal.label')}
        </span>
        <GoalChips value={goal} onChange={onChangeGoal} disabled={isPolishing} />
      </div>

      {auto.paused && (
        <div className="px-[22px] pb-2">
          <AutoRunPausedBanner />
        </div>
      )}

      <div className="flex min-h-0 flex-1 max-[599px]:flex-col">
        {/* Phone (#17 H7): drop the input column's own overflow so `<main>` is the single scroll
            region — no nested scroll. Desktop/tablet keep the independent overflow-auto. */}
        <div className="flex flex-1 flex-col gap-3.5 p-4 min-[600px]:overflow-auto">
          <OriginalCard
            value={original}
            onChange={onOriginal}
            onClear={clearOriginal}
            lang={srcLang}
            onLang={onSrcLang}
            // The Original is in the source language → look words up src→tgt.
            targetLang={tgtLang}
            onCompositionStart={debounce.onCompositionStart}
            onCompositionEnd={(v) => onSourceCompositionEnd(buildPolishRequest({ original: v }))}
            onKeyDown={onSourceKeyDown}
          />
          <DraftCard
            value={draft}
            onChange={onDraft}
            onClear={clearDraft}
            lang={tgtLang}
            onLang={onTgtLang}
            // The Draft is in the target language → its lookup is INVERTED (meaning lang = srcLang).
            targetLang={srcLang}
            onTranslateOriginal={onTranslateOriginal}
            onStopTranslate={onStopTranslate}
            translating={translating}
            onCompositionStart={debounce.onCompositionStart}
            onCompositionEnd={(v) => onSourceCompositionEnd(buildPolishRequest({ draft: v }))}
            onKeyDown={onSourceKeyDown}
          />
          <KeywordsCard keywords={keywordValues} onAdd={addKeyword} onRemove={removeKeyword} />
        </div>
        <section className="flex flex-1 flex-col border-l bg-[var(--bg-color)] px-6 py-4 max-[599px]:border-l-0 max-[599px]:border-t">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
              {t('polish.polished')}
            </span>
            {polishOp.status !== 'idle' && <AutoTag isAuto={polishOp.isAuto} />}
          </div>
          <PolishResult draft={draft} onAccept={onAccept} onRegenerate={onPolish} onReject={onReject} lang={tgtLang} />
        </section>
      </div>

      <AutoRunCostDialog open={auto.costGateOpen} onOpenChange={auto.cancelCost} onConfirm={auto.confirmCost} />
    </section>
  )
}
