import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Domain-keywords card (feature #2). Keywords are sent to the model as data (rule 65 §7
 * injection mitigation). Add via Enter, remove via ×. The "＋ from glossary" / extract
 * affordances are feature #3 (they depend on the glossary sidebar) and are not rendered.
 */
export function KeywordsCard({
  keywords,
  onAdd,
  onRemove,
}: {
  keywords: readonly string[]
  onAdd: (term: string) => void
  onRemove: (term: string) => void
}) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const submit = () => {
    const term = input.trim()
    if (term) {
      onAdd(term)
      setInput('')
    }
  }
  return (
    <div className="flex flex-none flex-col overflow-hidden rounded-[14px] border bg-[var(--bg-color)]">
      <div className="flex items-center gap-2.5 px-4 pb-1.5 pt-2.5">
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          {t('polish.keywords')}
        </span>
        <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.keywordsHint')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-[7px] px-3.5 pb-3.5 pt-1">
        {keywords.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-bg)] px-2 py-[5px] text-[12.5px] font-medium text-[var(--accent-primary)]"
          >
            {k}
            <button type="button" aria-label={`remove ${k}`} onClick={() => onRemove(k)} className="text-[13px] leading-none">
              ×
            </button>
          </span>
        ))}
        <input
          aria-label="add keyword"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={t('polish.addKeyword')}
          className="min-w-[130px] flex-1 bg-transparent py-[5px] text-[13px]"
        />
      </div>
    </div>
  )
}
