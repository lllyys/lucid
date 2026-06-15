import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationStore } from '@/stores/operationStore'
import { usePanelRun } from '@/hooks/usePanelRun'
import { notify } from '@/components/workspace/notify'
import { OriginalCard } from './OriginalCard'
import { DraftCard } from './DraftCard'
import { KeywordsCard } from './KeywordsCard'
import { PolishResult } from './PolishResult'

/**
 * Polish panel (feature #2, WI-9) — refine a draft against its original meaning + domain
 * keywords. "Translate original" streams a translation of the Original into the Draft (the
 * draftTranslate op, mirrored into the draft field); Polish is blocked while that runs.
 * Polish streams the result; Accept commits the whole result to the draft (rule 66 §2). Any
 * input edit resets the polish op so a stale stream can't overwrite newer input.
 */
export function PolishPanel() {
  const { t } = useTranslation()
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('en')
  const [original, setOriginal] = useState('')
  const [draft, setDraft] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const polishOp = useOperationStore((s) => s.polish)
  const dt = useOperationStore((s) => s.draftTranslate)
  const { run, abort } = usePanelRun()

  const translating = dt.status === 'streaming'
  const isPolishing = polishOp.status === 'streaming'
  const dtText = dt.status === 'idle' ? '' : dt.text

  // Mirror the draftTranslate stream into the editable draft (then local edits own it).
  useEffect(() => {
    if (dt.status === 'streaming' || dt.status === 'done') setDraft(dtText)
  }, [dt.status, dtText])

  const resetPolish = () => useOperationStore.getState().reset('polish')
  // Original / draft / language edits invalidate BOTH the polish result AND any in-flight or stale
  // "Translate original" output (which mirrors into the draft) — reset both so a superseded
  // draftTranslate stream can never overwrite newer user input.
  const resetForInput = () => {
    const ops = useOperationStore.getState()
    ops.reset('polish')
    ops.reset('draftTranslate')
  }
  const onStopTranslate = () => abort('draftTranslate')

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
    run('polish', {
      kind: 'polish',
      text: draft,
      goal: 'clarity',
      lang: tgtLang,
      original: original.trim() || undefined,
      keywords: keywords.length ? keywords : undefined,
    })
  }
  const onOriginal = (v: string) => {
    setOriginal(v)
    resetForInput()
  }
  const onDraft = (v: string) => {
    setDraft(v)
    resetForInput()
  }
  const onSrcLang = (c: string) => {
    setSrcLang(c)
    resetForInput()
  }
  const onTgtLang = (c: string) => {
    setTgtLang(c)
    resetForInput()
  }
  const addKeyword = (k: string) => {
    setKeywords((ks) => (ks.includes(k) ? ks : [...ks, k]))
    resetPolish()
  }
  const removeKeyword = (k: string) => {
    setKeywords((ks) => ks.filter((x) => x !== k))
    resetPolish()
  }
  const onAccept = (text: string) => {
    setDraft(text)
    // Commit the polished text AND stop any in-flight "Translate original" — otherwise its next
    // mirrored chunk would clobber the text we just accepted.
    resetForInput()
    notify(t('toast.polishAccepted'))
  }

  return (
    <section className="flex min-h-[420px] flex-1 flex-col">
      <div className="flex items-center justify-between px-[22px] pb-1 pt-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--accent-ink)]">
            {t('polish.label')}
          </span>
          <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.subtitle')}</span>
        </div>
        <button
          type="button"
          onClick={onPolish}
          disabled={translating}
          className="rounded-[10px] px-[17px] py-[9px] text-[13.5px] font-semibold text-[var(--on-accent)] disabled:opacity-40"
          style={{ background: isPolishing ? 'var(--text-secondary)' : 'var(--accent-primary)' }}
        >
          {isPolishing ? t('polish.stop') : t('polish.run')}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col gap-3.5 overflow-auto p-4">
          <OriginalCard value={original} onChange={onOriginal} lang={srcLang} onLang={onSrcLang} />
          <DraftCard
            value={draft}
            onChange={onDraft}
            lang={tgtLang}
            onLang={onTgtLang}
            onTranslateOriginal={onTranslateOriginal}
            onStopTranslate={onStopTranslate}
            translating={translating}
          />
          <KeywordsCard keywords={keywords} onAdd={addKeyword} onRemove={removeKeyword} />
        </div>
        <section className="flex flex-1 flex-col border-l bg-[var(--bg-color)] px-6 py-4">
          <span className="mb-2 font-mono text-[11px] uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
            {t('polish.polished')}
          </span>
          <PolishResult draft={draft} onAccept={onAccept} onRegenerate={onPolish} />
        </section>
      </div>
    </section>
  )
}
