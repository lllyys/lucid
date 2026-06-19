import { useTranslation } from 'react-i18next'
import { LanguagePicker } from './LanguagePicker'

/**
 * Original (meaning reference) card — its text is sent to the model to preserve meaning. The optional
 * composition / keydown handlers (feature #11) carry IME and ⌘↵ events up to the panel's auto-run
 * wiring; when absent the textarea behaves exactly as before.
 */
export function OriginalCard({
  value,
  onChange,
  lang,
  onLang,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  lang: string
  onLang: (code: string) => void
  onCompositionStart?: () => void
  onCompositionEnd?: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[130px] shrink-0 flex-col overflow-hidden rounded-[14px] border bg-[var(--bg-color)]">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {t('polish.original')}
          </span>
          <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.originalHint')}</span>
        </div>
        <LanguagePicker value={lang} onChange={onLang} label={`${t('polish.original')} language`} />
      </div>
      <textarea
        aria-label={t('polish.original')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={(e) => onCompositionEnd?.(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder={t('polish.originalPlaceholder')}
        spellCheck={false}
        dir="auto"
        style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
        className="field-sizing-content min-h-[88px] max-h-[88vh] resize-none bg-transparent px-4 py-3 font-serif text-[18px] leading-[1.7]"
      />
    </div>
  )
}
