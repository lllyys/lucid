import { useEffect, useRef, useState } from 'react'
import { detectDirection, directionLabels } from '@/lib/translation/detectDirection'
import { useWordLookup } from '@/hooks/useWordLookup'
import { useLookupStore, type LookupOwner } from '@/stores/lookupStore'
import { openSettings } from '@/lib/workspace/openSettings'
import { ClickableText, type WordActivation } from './ClickableText'
import { LookupCardHost } from './LookupCardHost'

/**
 * Word-lookup host for a rendered result pane (feature #20, WI-6/7; refactored to a thin wrapper
 * over the shared LookupCardHost in feature #169, WI-1). Renders the pane's text via ClickableText
 * — words clickable only at `done` (plan M3) so a stale offset can never be clicked while the text
 * still grows — threads the pane's 中↔EN direction + the pane's `owner` into the activation
 * payload, and delegates the popover/sheet surface to LookupCardHost anchored to the whole
 * rendered block (preserving today's anchor position).
 *
 * Owner-gated: the active-word chip only paints when this host owns the active lookup, so a lookup
 * from another host (e.g. the editable-pane overlay) whose word text happens to match a rendered
 * word never paints a spurious chip here.
 */
export function WordLookupPopover({
  text,
  done,
  owner,
}: {
  text: string
  done: boolean
  owner: LookupOwner
}) {
  const { lookup, close } = useWordLookup()

  const open = useLookupStore((s) => s.open)
  const storeOwner = useLookupStore((s) => s.owner)
  const storeWord = useLookupStore((s) => s.word)

  // Track the exact clicked token (word + offset) so only that instance highlights — the same
  // word can repeat. Cleared when the store's lookup closes.
  const [active, setActive] = useState<{ word: string; offset: number } | null>(null)
  const labels = directionLabels(detectDirection(text))
  const anchorRef = useRef<HTMLSpanElement>(null)

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
      owner,
    })
  }

  // Owner-gate the chip: a lookup owned by a DIFFERENT host (even one whose word text matches a
  // rendered word) must not paint a spurious active chip here.
  const activeWord =
    open && storeOwner === owner && active && active.word === storeWord ? active : null

  return (
    <>
      <span ref={anchorRef}>
        <ClickableText
          text={text}
          interactive={done}
          sourceLang={labels.srcCode}
          targetLang={labels.tgtCode}
          locale={labels.srcCode}
          activeWord={activeWord}
          onActivate={onActivate}
        />
      </span>
      <LookupCardHost
        anchorEl={anchorRef}
        owner={owner}
        fallbackTarget={labels.tgtCode}
        onProviders={() => {
          close()
          openSettings()
        }}
      />
    </>
  )
}
