import { useTranslation } from 'react-i18next'
import { LanguagePicker } from './LanguagePicker'

/**
 * Draft-to-polish card. "Translate original" streams a translation of the Original into the
 * draft (the draftTranslate op); while that streams, the draft is filled live and the action
 * is replaced by a "translating…" note. Editing the draft afterwards owns the field.
 */
export function DraftCard({
  value,
  onChange,
  lang,
  onLang,
  onTranslateOriginal,
  translating,
}: {
  value: string
  onChange: (v: string) => void
  lang: string
  onLang: (code: string) => void
  onTranslateOriginal: () => void
  translating: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[120px] flex-1 flex-col overflow-hidden rounded-[14px] border bg-[var(--bg-color)]">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {t('polish.draft')}
          </span>
          <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.draftHint')}</span>
        </div>
        <div className="flex items-center gap-2">
          {translating ? (
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{t('polish.translating')}</span>
          ) : (
            <button
              type="button"
              onClick={onTranslateOriginal}
              className="rounded-md border bg-[var(--bg-color)] px-2.5 py-[5px] text-[11.5px] font-medium text-[var(--accent-primary)] hover:bg-[var(--hover-bg)]"
            >
              ↻ {t('polish.translateOriginal')}
            </button>
          )}
          <LanguagePicker value={lang} onChange={onLang} label={`${t('polish.draft')} language`} />
        </div>
      </div>
      <textarea
        aria-label={t('polish.draft')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('polish.draftPlaceholder')}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-serif text-[18px] leading-[1.7]"
      />
    </div>
  )
}
