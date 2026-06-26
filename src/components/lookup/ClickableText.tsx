import { Fragment, useMemo } from 'react'
import { tokenize, sentenceAt } from '@/lib/lookup/segment'

/** What ClickableText emits when a word is activated (click / Enter / Space). */
export interface WordActivation {
  word: string
  sentence: string
  offset: number
  sourceLang?: string
  targetLang?: string
}

/**
 * Renders `text` with each word-like token a clickable lookup target (feature #20). Words are
 * interactive (`role="button"`, `tabIndex=0`, click + Enter/Space) ONLY when `interactive` is
 * true — the host pane passes `op.status==='done'`; while streaming the text renders plain so a
 * stale offset can never be clicked as the streamed text grows (plan M3). On activate it emits
 * {word, sentence, offset, sourceLang, targetLang}; the sentence is resolved via Intl.Segmenter
 * so CJK / RTL / mixed-script context lines are correct. `dir="auto"` + `unicode-bidi:plaintext`
 * keep bidi ordering intact. The active word (matched by word+offset) gets an accent chip +
 * underline (a non-colour indicator) while its popover is open.
 */
export function ClickableText({
  text,
  interactive,
  sourceLang,
  targetLang,
  locale,
  activeWord,
  onActivate,
}: {
  text: string
  interactive: boolean
  sourceLang?: string
  targetLang?: string
  locale?: string
  activeWord: { word: string; offset: number } | null
  onActivate: (activation: WordActivation) => void
}) {
  const segments = useMemo(() => tokenize(text, locale), [text, locale])

  const activate = (word: string, offset: number) => {
    onActivate({ word, sentence: sentenceAt(text, offset, locale), offset, sourceLang, targetLang })
  }

  return (
    <span dir="auto" style={{ unicodeBidi: 'plaintext' }}>
      {segments.map((seg) => {
        if (!interactive || !seg.isWord) {
          return <Fragment key={seg.offset}>{seg.value}</Fragment>
        }
        const isActive = activeWord !== null && activeWord.word === seg.value && activeWord.offset === seg.offset
        return (
          <span
            key={seg.offset}
            role="button"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => activate(seg.value, seg.offset)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                activate(seg.value, seg.offset)
              }
            }}
            className="cursor-pointer rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)]"
            style={
              isActive
                ? {
                    background: 'var(--accent-subtle)',
                    color: 'var(--accent-ink)',
                    boxShadow: 'inset 0 -1.5px 0 var(--accent-ink)',
                  }
                : undefined
            }
          >
            {seg.value}
          </span>
        )
      })}
    </span>
  )
}
