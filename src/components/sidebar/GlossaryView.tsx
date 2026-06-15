import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'
import { extractTerms } from '@/lib/glossary/extractTerms'
import { SidebarEmpty } from './SidebarEmpty'

/**
 * Glossary tab (feature #3, WI-6). Saved domain terms: add (Enter), remove (×), and "use" — which
 * injects the term into the Polish keywords via polishKeywordsStore (no coupling to PolishPanel).
 * "Extract from current text" runs the local extractTerms heuristic over the ACTIVE session's task
 * texts and proposes terms to save. Pure store interactions — no provider/network.
 */
export function GlossaryView() {
  const { t } = useTranslation()
  const terms = useGlossaryStore((s) => s.terms)
  const [input, setInput] = useState('')
  const [suggested, setSuggested] = useState<string[]>([])

  const addTerm = (label: string) => useGlossaryStore.getState().addTerm(label)
  const onAddInput = () => {
    if (input.trim() === '') return
    addTerm(input)
    setInput('')
  }
  const extract = () => {
    const { sessions, activeSessionId } = useSessionStore.getState()
    const active = sessions.find((s) => s.id === activeSessionId)
    const text = active ? active.tasks.map((tk) => `${tk.sourceText} ${tk.resultText}`).join(' ') : ''
    setSuggested(extractTerms(text, terms.map((tm) => tm.label)))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-0 flex-col gap-2 px-3 pb-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          {t('glossary.termCount', { count: terms.length })}
        </span>
        <button
          type="button"
          onClick={extract}
          className="flex items-center justify-center gap-1.5 rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-bg)] py-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)]"
        >
          ✦ {t('glossary.extract')}
        </button>
        {suggested.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{t('glossary.suggested')}</span>
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    addTerm(s)
                    setSuggested((cur) => cur.filter((x) => x !== s))
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--accent-border)] bg-[var(--bg-color)] px-2 py-[5px] text-[12px] font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-bg)]"
                >
                  {s} ＋
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-auto px-2 pb-2">
        {terms.length === 0 ? (
          <SidebarEmpty body={t('sidebar.glossaryEmpty')} />
        ) : (
          terms.map((term) => (
            <div key={term.id} className="flex items-center gap-2 rounded-lg px-2 py-[7px] hover:bg-[var(--hover-bg)]">
              <span className="size-[5px] shrink-0 rounded-full bg-[var(--accent-border)]" />
              <span className="flex-1 truncate text-[13px] text-[var(--text-color)]">{term.label}</span>
              <button
                type="button"
                onClick={() => usePolishKeywordsStore.getState().addKeyword(term.label)}
                aria-label={t('glossary.useAria', { term: term.label })}
                className="font-mono text-[11px] text-[var(--accent-ink)] hover:underline"
              >
                {t('glossary.use')}
              </button>
              <button
                type="button"
                onClick={() => useGlossaryStore.getState().removeTerm(term.id)}
                aria-label={t('glossary.removeTerm', { term: term.label })}
                className="px-1 text-[14px] leading-none text-[var(--text-disabled)] hover:text-[var(--error-color)]"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex-0 border-t px-3 py-2.5">
        <input
          aria-label={t('glossary.addTerm')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAddInput()
          }}
          placeholder={t('glossary.addTerm')}
          className="w-full border-none bg-transparent text-[13px] text-[var(--text-color)] outline-none"
        />
      </div>
    </div>
  )
}
