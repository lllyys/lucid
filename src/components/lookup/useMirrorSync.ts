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
  // Box: size to the textarea's scrollbar-EXCLUDED client box and sit just inside its border, so
  // the mirror wraps at the exact width the textarea content wraps. A scrolling textarea reserves
  // a vertical scrollbar gutter, so its content is narrower than the border box — `inset:0` would
  // wrap wider and drift glyphs right of their spans on every wrapped line. The mirror carries no
  // border of its own (it lives inside the field's border); padding is cloned above.
  const borderTop = parseFloat(cs.borderTopWidth) || 0
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0
  mirror.style.boxSizing = 'border-box'
  mirror.style.borderStyle = 'none'
  mirror.style.borderWidth = '0'
  mirror.style.borderColor = 'transparent'
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.height = `${textarea.clientHeight}px`
  mirror.style.top = `${textarea.offsetTop + borderTop}px`
  mirror.style.left = `${textarea.offsetLeft + borderLeft}px`
  // Direction + bidi: clone the textarea's ACTUAL computed direction/unicode-bidi (default normal),
  // and reflect its dir attribute so RTL propagates even where jsdom's getComputedStyle does not
  // resolve inherited direction. NEVER force `plaintext` — it re-resolves base direction per
  // paragraph from the first strong char, ignoring `dir`, and would reorder a mixed-direction line.
  if (cs.direction) mirror.style.direction = cs.direction
  mirror.style.unicodeBidi = cs.unicodeBidi || 'normal'
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
