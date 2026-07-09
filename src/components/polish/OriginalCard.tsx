import { useTranslation } from 'react-i18next'
import { usePaneLookup } from '@/hooks/usePaneLookup'
import { EditableLookupOverlay } from '@/components/lookup/EditableLookupOverlay'
import { LookupToggle } from '@/components/lookup/LookupToggle'
import { EDITOR_CARD_MIN_H, EDITOR_FIELD_MIN_H } from '@/lib/editor/editorSizing'
import { LanguagePicker } from './LanguagePicker'

/**
 * Original (meaning reference) card — its text is sent to the model to preserve meaning. The optional
 * composition / keydown handlers (feature #11) carry IME and ⌘↵ events up to the panel's auto-run
 * wiring; when absent the textarea behaves exactly as before.
 *
 * Word lookup (feature #169, WI-4): the ⌕ header toggle arms a mirror overlay over the textarea so a
 * word can be clicked to look it up without breaking editing (owner `polishOriginal`). The Original
 * is in the SOURCE language, so its lookup goes src→tgt — `lang` is the word's language, `targetLang`
 * (the polish target, threaded from PolishPanel) the meaning language.
 */
export function OriginalCard({
  value,
  onChange,
  onClear,
  lang,
  onLang,
  targetLang,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  /** Wipe the Original + reset the dependent ops (feature #23) — a NON-arming action, not an edit. */
  onClear: () => void
  lang: string
  onLang: (code: string) => void
  /** The lookup meaning language (polish target lang, threaded from PolishPanel). */
  targetLang: string
  onCompositionStart?: () => void
  onCompositionEnd?: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useTranslation()
  const lookup = usePaneLookup({ text: value, owner: 'polishOriginal', sourceLang: lang, targetLang })
  // Clear (feature #23): wipe the input then return focus to the textarea (design-specified refocus).
  const handleClear = () => {
    onClear()
    lookup.textareaRef.current?.focus()
  }
  return (
    <div className={`flex ${EDITOR_CARD_MIN_H} shrink-0 flex-col overflow-hidden rounded-[14px] border bg-[var(--bg-color)]`}>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {t('polish.original')}
          </span>
          <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.originalHint')}</span>
        </div>
        <div className="flex items-center gap-2">
          {value.trim() !== '' && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-[4px] text-[12px] text-[var(--text-tertiary)] outline-none hover:text-[var(--text-color)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)]"
            >
              {t('polish.clear')}
            </button>
          )}
          <LookupToggle active={lookup.mode === 'latched'} disabled={!value.trim()} onToggle={lookup.toggle} />
          <LanguagePicker value={lang} onChange={onLang} label={`${t('polish.original')} language`} />
        </div>
      </div>
      <div className="relative">
        <textarea
          ref={lookup.textareaRef}
          aria-label={t('polish.original')}
          value={value}
          onChange={(e) => {
            lookup.onTextInput()
            onChange(e.target.value)
          }}
          onCompositionStart={() => {
            lookup.setComposing(true)
            onCompositionStart?.()
          }}
          onCompositionEnd={(e) => {
            lookup.setComposing(false)
            onCompositionEnd?.(e.currentTarget.value)
          }}
          onKeyDown={onKeyDown}
          placeholder={t('polish.originalPlaceholder')}
          spellCheck={false}
          dir="auto"
          style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
          className={`field-sizing-content ${EDITOR_FIELD_MIN_H} max-h-[88vh] resize-none bg-transparent px-4 py-3 font-serif text-[18px] leading-[1.7]`}
        />
        <EditableLookupOverlay
          textareaRef={lookup.textareaRef}
          text={value}
          owner="polishOriginal"
          sourceLang={lang}
          targetLang={targetLang}
          armed={lookup.armed}
        />
      </div>
    </div>
  )
}
