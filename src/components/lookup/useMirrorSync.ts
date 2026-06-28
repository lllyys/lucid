// Purpose: imperative typography clone + scroll/dir sync for the editable-lookup mirror
// (feature #169, WI-3). Copies the textarea's wrap-affecting computed style onto the mirror div
// (font, line-height, letter-spacing, padding, border geometry, box-sizing, text-align,
// white-space:pre-wrap, overflow-wrap, tab-size, direction, unicode-bidi — plan L7) so the
// mirror wraps glyph-for-glyph, and keeps the mirror's scroll position glued to the textarea.
// Re-measures on text change, on a ResizeObserver, and on document.fonts.ready. Mutates ONLY
// the box/typography style keys (disjoint from the structural keys React owns on the mirror), so
// React reconciliation never clobbers the clone and the clone never fights React.

import { useLayoutEffect } from 'react'

/** Computed-style keys cloned from the textarea onto the mirror to reproduce its wrapping. */
const CLONE_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'textIndent',
  'textAlign',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
  'tabSize',
] as const

function applyClone(textarea: HTMLTextAreaElement, mirror: HTMLDivElement): void {
  const cs = getComputedStyle(textarea)
  for (const prop of CLONE_PROPS) {
    const value = cs[prop as keyof CSSStyleDeclaration]
    if (typeof value === 'string' && value !== '') {
      mirror.style[prop as never] = value as never
    }
  }
  // Wrapping must always match a textarea's hard/soft wraps regardless of computed-style gaps.
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.wordBreak = cs.wordBreak || 'normal'
  // The mirror's border is geometry-only (transparent) so it never double-paints the field's border.
  mirror.style.borderStyle = 'solid'
  mirror.style.borderColor = 'transparent'
  // Direction + bidi: clone the computed value, and reflect the textarea's dir attribute so RTL
  // propagates even where jsdom's getComputedStyle does not resolve inherited direction.
  if (cs.direction) mirror.style.direction = cs.direction
  mirror.style.unicodeBidi = cs.unicodeBidi && cs.unicodeBidi !== 'normal' ? cs.unicodeBidi : 'plaintext'
  mirror.dir = textarea.dir
}

function applyScroll(textarea: HTMLTextAreaElement, mirror: HTMLDivElement): void {
  mirror.scrollTop = textarea.scrollTop
  mirror.scrollLeft = textarea.scrollLeft
}

/**
 * Keep `mirror` typographically cloned from `textarea` and scroll-synced to it. `text` is a
 * re-measure trigger (a re-wrap can change scroll geometry). Returns nothing — pure side effects.
 */
export function useMirrorSync(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  mirrorRef: React.RefObject<HTMLDivElement | null>,
  text: string,
): void {
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return

    const sync = () => {
      applyClone(textarea, mirror)
      applyScroll(textarea, mirror)
    }
    sync()

    const onScroll = () => applyScroll(textarea, mirror)
    textarea.addEventListener('scroll', onScroll)

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync)
      ro.observe(textarea)
    }

    // Web fonts can change metrics after first paint — re-clone once they settle.
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    let cancelled = false
    void fonts?.ready?.then(() => {
      if (!cancelled) sync()
    })

    return () => {
      cancelled = true
      textarea.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [textareaRef, mirrorRef, text])
}
