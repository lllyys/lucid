import { useEffect, useMemo, useRef, useState } from 'react'
import { sentenceAt } from '@/lib/lookup/segment'
import { wordSegments, type WordSegment } from '@/lib/lookup/overlaySegments'
import { useWordLookup } from '@/hooks/useWordLookup'
import { useLookupStore, type LookupOwner } from '@/stores/lookupStore'
import { openSettings } from '@/lib/workspace/openSettings'
import { LookupCardHost } from './LookupCardHost'
import { useMirrorSync } from './useMirrorSync'

/**
 * The editable-pane word-lookup overlay (feature #169, WI-3 — design bundle
 * `dev-docs/designs/lucid-word-lookup-editable/`). A mirror click-layer over a `<textarea>`: a
 * typography-cloned, scroll-synced copy of the field's text whose WORD glyphs are clickable lookup
 * targets while the real textarea stays editable underneath (caret stays sacred).
 *
 * USAGE (WI-4 wires this): the consumer renders the `<textarea>` and this overlay as SIBLINGS
 * inside a `position: relative` container — the overlay returns an `position: absolute; inset: 0`
 * mirror, so it lines up over the field. The mirror text is `color: transparent`; the textarea's
 * real glyphs are the visible layer and show through. The overlay paints only the hit-target +
 * the hover/active decoration.
 *
 * Pointer model (the caret-sacred guarantee): the mirror root is always `pointer-events: none`, so
 * a click in an inter-word gap falls through to the textarea and lands the caret. Only when `armed`
 * do the WORD spans become interactive (`pointer-events: auto`, `cursor: help`); a bare click in a
 * gap — or any click while disarmed — always reaches the field.
 *
 * Word states (design §C): idle (no decoration) · hover (dotted accent underline + faint tint) ·
 * active = the accent chip on the span whose lookup is open. The active highlight is the overlay
 * chip, NOT a real textarea selection (plan M5 — no caret/focus mutation); it is owner-gated on the
 * store so a same-text word in another host never paints a spurious chip here.
 *
 * The result surface is #20 reused verbatim: a click opens the shared owner-gated `LookupCardHost`
 * anchored to the clicked span.
 */
export function EditableLookupOverlay({
  textareaRef,
  text,
  owner,
  sourceLang,
  targetLang,
  armed,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  text: string
  owner: LookupOwner
  sourceLang: string
  targetLang: string
  armed: boolean
}) {
  const { lookup, close } = useWordLookup()
  const mirrorRef = useRef<HTMLDivElement>(null)
  // The popover anchor: the clicked span while a lookup is open, else the mirror root (so Radix
  // always has a measurable anchor). A ref — not state — so positioning reads it without a render.
  const anchorRef = useRef<HTMLElement | null>(null)
  const [activeStart, setActiveStart] = useState<number | null>(null)

  const storeOpen = useLookupStore((s) => s.open)
  const storeOwner = useLookupStore((s) => s.owner)
  const storeWord = useLookupStore((s) => s.word)

  useMirrorSync(textareaRef, mirrorRef, text)

  const segments = useMemo(() => wordSegments(text, sourceLang), [text, sourceLang])

  // When the active lookup closes, drop the local active span and reset the anchor to the field.
  useEffect(() => {
    if (!storeOpen) {
      setActiveStart(null)
      anchorRef.current = mirrorRef.current
    }
  }, [storeOpen])

  const onWordClick = (seg: WordSegment, el: HTMLElement) => {
    anchorRef.current = el
    setActiveStart(seg.start)
    lookup({
      word: seg.text,
      sentence: sentenceAt(text, seg.start, sourceLang),
      sourceLang,
      targetLang,
      owner,
    })
  }

  // Interleave word spans with the inter-word gap text (plain nodes → fall through to the field).
  const children: React.ReactNode[] = []
  let cursor = 0
  for (const seg of segments) {
    if (seg.start > cursor) children.push(text.slice(cursor, seg.start))
    const isActive =
      storeOpen &&
      storeOwner === owner &&
      storeWord === seg.text &&
      (activeStart === null || activeStart === seg.start)

    if (armed) {
      children.push(
        <span
          key={`w${seg.start}`}
          role="button"
          tabIndex={0}
          aria-current={isActive ? 'true' : undefined}
          onClick={(e) => onWordClick(seg, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onWordClick(seg, e.currentTarget)
            }
          }}
          className="cursor-help rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] hover:bg-[var(--accent-tint,var(--accent-subtle))] hover:[text-decoration-color:var(--accent-border)] hover:[text-decoration-line:underline] hover:[text-decoration-style:dotted]"
          // pointer-events is set inline (not via a Tailwind class) so the armed word captures
          // clicks even where compiled CSS is absent; the root stays none so gaps fall through.
          style={{
            pointerEvents: 'auto',
            ...(isActive
              ? { background: 'var(--accent-bg)', boxShadow: 'inset 0 -1.5px 0 var(--accent-ink)' }
              : {}),
          }}
        >
          {seg.text}
        </span>,
      )
    } else {
      children.push(
        <span key={`w${seg.start}`} aria-current={isActive ? 'true' : undefined}>
          {seg.text}
        </span>,
      )
    }
    cursor = seg.end
  }
  if (cursor < text.length) children.push(text.slice(cursor))

  return (
    <>
      <div
        ref={mirrorRef}
        data-testid="lookup-mirror"
        // Hide the transparent text duplicate from the a11y tree while disarmed (the textarea owns
        // a11y). When armed, the word spans are interactive controls (role=button, focusable) and
        // MUST be exposed, so the root is no longer hidden.
        aria-hidden={armed ? undefined : true}
        style={{
          position: 'absolute',
          inset: 0,
          margin: 0,
          overflow: 'hidden',
          background: 'transparent',
          color: 'transparent',
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {children}
      </div>
      <LookupCardHost
        anchorEl={anchorRef}
        owner={owner}
        fallbackTarget={targetLang}
        onProviders={() => {
          close()
          openSettings()
        }}
      />
    </>
  )
}
