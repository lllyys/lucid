import { useEffect, useMemo, useRef, useState } from 'react'
import { sentenceAt } from '@/lib/lookup/segment'
import { wordSegments, type WordSegment } from '@/lib/lookup/overlaySegments'
import { useWordLookup } from '@/hooks/useWordLookup'
import { useLookupStore, type LookupOwner } from '@/stores/lookupStore'
import { openSettings } from '@/lib/workspace/openSettings'
import { LookupCardHost } from './LookupCardHost'
import { useMirrorSync } from './useMirrorSync'

/** Touch long-press threshold (design §F) — a press held this long opens the lookup. */
const LONG_PRESS_MS = 450

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

  // Touch long-press (design §F): a ~450 ms press on an armed word span opens the lookup; a short
  // tap falls through to the field (caret). One press at a time, so a single timer + a "fired" flag
  // suffice; the flag suppresses the synthetic click the browser fires after a long-press.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const startLongPress = (seg: WordSegment, el: HTMLElement) => {
    longPressFired.current = false
    clearLongPress()
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressFired.current = true
      onWordClick(seg, el)
    }, LONG_PRESS_MS)
  }
  useEffect(() => clearLongPress, []) // clear any pending press on unmount

  // Interleave word spans with the inter-word gap text (plain nodes → fall through to the field).
  const children: React.ReactNode[] = []
  let cursor = 0
  for (const seg of segments) {
    if (seg.start > cursor) children.push(text.slice(cursor, seg.start))
    // Active only on the EXACT clicked instance (offset match — parity with #20's active.offset),
    // so a repeated word never lights up every occurrence while one is open.
    const isActive =
      storeOpen && storeOwner === owner && storeWord === seg.text && activeStart === seg.start

    if (armed) {
      children.push(
        <span
          key={`w${seg.start}`}
          role="button"
          tabIndex={0}
          aria-current={isActive ? 'true' : undefined}
          onClick={(e) => {
            // A long-press already fired this lookup — swallow the browser's follow-up click so the
            // word isn't looked up twice.
            if (longPressFired.current) {
              longPressFired.current = false
              return
            }
            onWordClick(seg, e.currentTarget)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onWordClick(seg, e.currentTarget)
            }
          }}
          // Touch (design §F): a held press opens the lookup; a finger move (scroll/select) cancels.
          onTouchStart={(e) => startLongPress(seg, e.currentTarget)}
          onTouchMove={clearLongPress}
          onTouchEnd={(e) => {
            if (longPressFired.current) e.preventDefault() // suppress native long-press selection
            clearLongPress()
          }}
          onTouchCancel={clearLongPress}
          // Hover (design §C): faint tint + dotted accent underline + accent-ink GLYPH (so the
          // transparent mirror text paints visibly over its own chip — matches #20's ClickableText).
          className="cursor-help rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-ink)] hover:[text-decoration-color:var(--accent-border)] hover:[text-decoration-line:underline] hover:[text-decoration-style:dotted]"
          // pointer-events is set inline (not via a Tailwind class) so the armed word captures
          // clicks even where compiled CSS is absent; the root stays none so gaps fall through.
          // userSelect:none suppresses the native long-press selection / OS magnifier over armed
          // word spans (design §F). Active chip matches #20 exactly: --accent-subtle fill +
          // --accent-ink glyph + underline (color set so the glyph paints over the otherwise-
          // transparent mirror — it stays legible).
          style={{
            pointerEvents: 'auto',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            ...(isActive
              ? {
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent-ink)',
                  boxShadow: 'inset 0 -1.5px 0 var(--accent-ink)',
                }
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
        // position only — useMirrorSync owns the box geometry (top/left/width/height sized to the
        // textarea's scrollbar-excluded client box) so glyphs never drift on wrapped lines.
        style={{
          position: 'absolute',
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
