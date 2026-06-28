// Purpose: per-pane glue (feature #169, WI-4) that wires the editable-pane word-lookup into the
// translate source / polish Original / polish Draft textareas. It calls useEditableLookup for the
// arm/toggle/typing-debounce machine, owns the pane's textarea ref, and applies close-on-edit
// (plan M6): a change to the field's text VALUE closes this owner's open lookup — keyed on the
// value (not onChange), because programmatic writes (draft stream, swap, clear, accept) bypass
// onChange and would otherwise leave the popover anchored to a now-stale offset. The store is read
// via getState() inside the effect so a lookup OPENING (open false→true) never re-fires the effect
// and closes itself (AGENTS.md getState-in-callbacks).

import { useEffect, useRef } from 'react'
import { useEditableLookup, type EditableLookup } from './useEditableLookup'
import { useWordLookup } from './useWordLookup'
import { useLookupStore, type LookupOwner } from '@/stores/lookupStore'

export interface PaneLookup extends EditableLookup {
  /** The pane textarea's ref — attach to BOTH the textarea and the EditableLookupOverlay. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

export interface UsePaneLookupOptions {
  /** The field's live text (the WI-3 mirror tracks this; drives empty-gating + close-on-edit). */
  text: string
  /** Which lookup host this pane is (gates the shared store/surface). */
  owner: LookupOwner
  /** The word's own language (source side of the lookup). */
  sourceLang: string
  /** The meaning language (always supplied). */
  targetLang: string
  /** True while the field is machine-written (Draft streaming) — disarms the overlay (plan M3). */
  streaming?: boolean
}

export function usePaneLookup(opts: UsePaneLookupOptions): PaneLookup {
  const { text, owner, streaming } = opts
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lookup = useEditableLookup({ textNonEmpty: text.trim().length > 0, streaming })
  const { close } = useWordLookup()

  useEffect(() => {
    const s = useLookupStore.getState()
    if (s.open && s.owner === owner) close()
    // Keyed ONLY on the text value (+ the constant owner). Reading open/owner via getState avoids
    // re-firing when a lookup merely opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, owner])

  return { ...lookup, textareaRef }
}
