import { useEffect, useState } from 'react'
import { detectDirection, directionLabels } from '@/lib/translation/detectDirection'
import { useWordLookup } from '@/hooks/useWordLookup'
import { useLookupStore } from '@/stores/lookupStore'
import { ClickableText, type WordActivation } from './ClickableText'

/**
 * Word-lookup host for a rendered result pane (feature #20, WI-6/7). Renders the pane's text via
 * ClickableText — words clickable only when the host pane is `done` (plan M3) — threads the pane's
 * 中↔EN direction (`directionLabels(detectDirection(text))`, as TranslatePanel does) into the
 * activation payload, drives useWordLookup on activate, and highlights the active token while its
 * lookup is open. WI-7 anchors the designed popover/sheet to the active word.
 */
export function WordLookupPopover({ text, done }: { text: string; done: boolean }) {
  const { lookup } = useWordLookup()
  const open = useLookupStore((s) => s.open)
  const storeWord = useLookupStore((s) => s.word)
  // Track the exact clicked token (word + offset) so only that instance highlights — the same word
  // can repeat. Cleared when the store's lookup closes.
  const [active, setActive] = useState<{ word: string; offset: number } | null>(null)

  // The displayed text's language drives both the segmentation locale and the lookup direction:
  // a Chinese result → look the word up into English, and vice-versa.
  const labels = directionLabels(detectDirection(text))

  useEffect(() => {
    if (!open) setActive(null)
  }, [open])

  const onActivate = (a: WordActivation) => {
    setActive({ word: a.word, offset: a.offset })
    lookup({
      word: a.word,
      sentence: a.sentence,
      sourceLang: a.sourceLang,
      targetLang: a.targetLang ?? labels.tgtCode,
    })
  }

  // Keep the highlight only while the store's active word matches the locally-tracked token.
  const activeWord = open && active && active.word === storeWord ? active : null

  return (
    <ClickableText
      text={text}
      interactive={done}
      sourceLang={labels.srcCode}
      targetLang={labels.tgtCode}
      locale={labels.srcCode}
      activeWord={activeWord}
      onActivate={onActivate}
    />
  )
}
