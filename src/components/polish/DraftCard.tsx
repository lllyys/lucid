import { useTranslation } from 'react-i18next'
import { usePaneLookup } from '@/hooks/usePaneLookup'
import { EditableLookupOverlay } from '@/components/lookup/EditableLookupOverlay'
import { LookupToggle } from '@/components/lookup/LookupToggle'
import { EDITOR_CARD_MIN_H, EDITOR_FIELD_MIN_H } from '@/lib/editor/editorSizing'
import { LanguagePicker } from './LanguagePicker'

/**
 * Draft-to-polish card. "Translate original" streams a translation of the Original into the
 * draft (the draftTranslate op); while that streams, the draft is filled live and the action
 * is replaced by a "translating…" note. Editing the draft afterwards owns the field.
 *
 * Word lookup (feature #169, WI-4): the ⌕ header toggle arms a mirror overlay over the textarea
 * (owner `polishDraft`). The Draft is in the TARGET language, so its lookup is INVERTED — `lang`
 * (the draft/target lang) is the word's language and `targetLang` (the polish SOURCE lang, threaded
 * from PolishPanel) is the meaning language. The overlay is disarmed while the draft streams
 * (`translating`, plan M3) — offsets are unstable mid-stream; a manually-typed, never-translated
 * draft still arms (`!translating`).
 */
export function DraftCard({
  value,
  onChange,
  lang,
  onLang,
  targetLang,
  onTranslateOriginal,
  onStopTranslate,
  translating,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  lang: string
  onLang: (code: string) => void
  /** The lookup meaning language (polish SOURCE lang — the Draft lookup is inverted). */
  targetLang: string
  onTranslateOriginal: () => void
  onStopTranslate: () => void
  translating: boolean
  // Optional IME / ⌘↵ handlers for auto-run (feature #11); absent → unchanged behavior.
  onCompositionStart?: () => void
  onCompositionEnd?: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useTranslation()
  const lookup = usePaneLookup({
    text: value,
    owner: 'polishDraft',
    sourceLang: lang,
    targetLang,
    streaming: translating,
  })
  return (
    <div className={`flex ${EDITOR_CARD_MIN_H} shrink-0 flex-col overflow-hidden rounded-[14px] border bg-[var(--bg-color)]`}>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {t('polish.draft')}
          </span>
          <span className="text-[11.5px] text-[var(--text-disabled)]">{t('polish.draftHint')}</span>
        </div>
        <div className="flex items-center gap-2">
          {translating ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{t('polish.translating')}</span>
              <button
                type="button"
                onClick={onStopTranslate}
                className="rounded-md border bg-[var(--bg-color)] px-2 py-[3px] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
              >
                {t('polish.stopTranslate')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onTranslateOriginal}
              className="rounded-md border bg-[var(--bg-color)] px-2.5 py-[5px] text-[11.5px] font-medium text-[var(--accent-ink)] hover:bg-[var(--hover-bg)]"
            >
              ↻ {t('polish.translateOriginal')}
            </button>
          )}
          <LookupToggle
            active={lookup.mode === 'latched'}
            disabled={translating || !value.trim()}
            onToggle={lookup.toggle}
          />
          <LanguagePicker value={lang} onChange={onLang} label={`${t('polish.draft')} language`} />
        </div>
      </div>
      <div className="relative">
        <textarea
          ref={lookup.textareaRef}
          aria-label={t('polish.draft')}
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
          placeholder={t('polish.draftPlaceholder')}
          spellCheck={false}
          dir="auto"
          style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
          className={`field-sizing-content ${EDITOR_FIELD_MIN_H} max-h-[88vh] resize-none bg-transparent px-4 py-3 font-serif text-[18px] leading-[1.7]`}
        />
        <EditableLookupOverlay
          textareaRef={lookup.textareaRef}
          text={value}
          owner="polishDraft"
          sourceLang={lang}
          targetLang={targetLang}
          armed={lookup.armed}
        />
      </div>
    </div>
  )
}
