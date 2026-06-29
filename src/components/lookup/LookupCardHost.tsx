import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWordLookup } from '@/hooks/useWordLookup'
import { useLookupStore, type LookupOwner } from '@/stores/lookupStore'
import { useViewportTier } from '@/hooks/useViewportTier'
import { createSpeech } from '@/lib/speech/speak'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { StarButton } from '@/components/starred/StarButton'
import type { StarredInput } from '@/stores/starredStore'
import { LookupCard, type LookupCardData, type PlayState } from './LookupCard'

/** RTL source languages — drives the card's `dir` + logical layout (rule 66 §3). */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur'])

/** Radix `virtualRef` shape — any element with `getBoundingClientRect` can anchor the popover. */
type Measurable = { getBoundingClientRect(): DOMRect }

/**
 * The shared lookup-card host (feature #169, WI-1 — extracted from WordLookupPopover). Owns
 * everything that is NOT the host's own clickable text: the per-host `createSpeech()` instance +
 * its play/stop/voice-race state, the `dir`, the `data`/`onRetry`/`onClose` wiring of LookupCard,
 * and the desktop-`Popover` / phone-`Sheet` tier switch.
 *
 * It is owner-gated: with several hosts mounted at once (both result panes + the editable-pane
 * overlays), only the host whose `owner` matches the store's active `owner` shows the surface —
 * `open={open && storeOwner === owner}`. The popover anchors to an EXTERNAL element via
 * `anchorEl` (a ref the host owns — the rendered block today, a per-word span in the overlay),
 * not a wrapped `PopoverAnchor asChild`, so the same host works for both render modes.
 *
 * Audio: one createSpeech() instance. The play button subscribes to its voiceschanged signal and
 * re-derives hasVoiceFor, so it is transiently disabled while voices load and permanently
 * no-voice only once voicesReady && !hasVoiceFor. A cleanup effect cancels any in-flight speech on
 * unmount AND on word change (a no-op when SpeechSynthesis is absent — jsdom). Esc / outside-click
 * / Close dismiss via the store; the meaning is an aria-live=polite region.
 */
export function LookupCardHost({
  anchorEl,
  owner,
  onProviders,
  fallbackTarget,
}: {
  anchorEl: React.RefObject<HTMLElement | null>
  owner: LookupOwner
  onProviders: () => void
  /** Target lang to retry with when the error state cleared the store's targetLang (config-error paths). */
  fallbackTarget?: string
}) {
  const { t } = useTranslation()
  const { lookup, close } = useWordLookup()
  const tier = useViewportTier()
  const isPhone = tier === 'phone'

  const speech = useMemo(() => createSpeech(), [])
  // Bump on every voiceschanged / speaking-state change so the play button re-derives.
  const [, forceTick] = useState(0)
  useEffect(() => speech.subscribe(() => forceTick((n) => n + 1)), [speech])

  const open = useLookupStore((s) => s.open)
  const storeOwner = useLookupStore((s) => s.owner)
  const storeWord = useLookupStore((s) => s.word)
  const ipa = useLookupStore((s) => s.ipa)
  const partOfSpeech = useLookupStore((s) => s.partOfSpeech)
  const translations = useLookupStore((s) => s.translations)
  const meaning = useLookupStore((s) => s.meaning)
  const senses = useLookupStore((s) => s.senses)
  const status = useLookupStore((s) => s.status)
  const error = useLookupStore((s) => s.error)
  const sentence = useLookupStore((s) => s.sentence)
  const sourceLang = useLookupStore((s) => s.sourceLang)
  const targetLang = useLookupStore((s) => s.targetLang)

  // This host only shows the surface when it owns the active lookup (closes the cross-host bleed).
  const isOpen = open && storeOwner === owner

  // Cancel in-flight speech on unmount AND whenever the active word changes. storeWord is the
  // change key; cancel() is a safe no-op when SpeechSynthesis is unavailable.
  useEffect(() => {
    return () => speech.cancel()
  }, [speech, storeWord])

  const data: LookupCardData = {
    word: storeWord,
    ipa,
    partOfSpeech,
    translations,
    meaning,
    senses,
    status,
    error,
    sentence,
    sourceLang,
    targetLang,
  }

  // Voice availability for the word's OWN language (the source side of the lookup).
  const voicesReady = speech.voicesReady
  const hasVoice = sourceLang ? speech.hasVoiceFor(sourceLang) : false
  const speaking = speech.isSpeaking()

  const playKind: PlayState['kind'] =
    status === 'error'
      ? 'hidden'
      : speaking
        ? 'stop'
        : status === 'streaming' || !voicesReady
          ? 'loading'
          : hasVoice
            ? 'play'
            : 'novoice'

  const onTogglePlay = () => {
    if (speech.isSpeaking()) speech.cancel()
    else if (sourceLang) speech.speak(storeWord, sourceLang)
  }

  const play: PlayState = { kind: playKind, onToggle: onTogglePlay }

  const onRetry = () => {
    // The config-error paths in useWordLookup (invalidKey / createProvider throw) clear the store via
    // close()+setState WITHOUT a targetLang, so the error card can render with targetLang undefined.
    // Fall back to the pane's target (the pre-refactor onRetry used `targetLang ?? labels.tgtCode`).
    const target = targetLang ?? fallbackTarget
    if (target === undefined) return
    lookup({ word: storeWord, sentence, sourceLang, targetLang: target, owner })
  }

  const dir = sourceLang && RTL_LANGS.has(sourceLang) ? 'rtl' : undefined
  const label = t('lookup.dialogLabel', { word: storeWord })

  // Star the WORD (feature #22, WI-3) — only once the lookup is `done` with data, so a star is
  // never built from a half-streamed or errored card. The same input feeds the desktop popover
  // and the phone sheet (shared `card`). Both this host's consumers (the rendered-pane
  // WordLookupPopover AND the editable-pane EditableLookupOverlay) inherit the control.
  const wordStar: StarredInput | null =
    status === 'done'
      ? {
          kind: 'word',
          source: storeWord,
          translation: translations.join(' · '),
          ipa: ipa || undefined,
          meaning: meaning || undefined,
          sourceLang: sourceLang ?? '',
          targetLang: targetLang ?? '',
          context: sentence || undefined,
        }
      : null

  const card = (showContext: boolean) => (
    <LookupCard
      data={data}
      play={play}
      onClose={close}
      onRetry={onRetry}
      onProviders={onProviders}
      showContext={showContext}
      voicesReady={voicesReady}
      hasVoice={hasVoice}
      star={wordStar ? <StarButton variant="icon" input={wordStar} /> : undefined}
    />
  )

  const onOpenChange = (next: boolean) => {
    if (!next) close()
  }

  // Phone (< 600): a bottom sheet docked full-width (design Section D). The grab handle + larger
  // targets come from the sheet chrome; the context line is omitted on the narrow surface.
  if (isPhone) {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          dir={dir}
          aria-label={label}
          showCloseButton={false}
          className="rounded-t-[22px] border-[var(--border-strong)] bg-[var(--bg-color)] p-0 [box-shadow:var(--shadow-menu)]"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <div className="flex justify-center pb-1 pt-2.5">
            <span aria-hidden className="h-1 w-[38px] rounded-[3px] bg-[var(--border-dashed)]" />
          </div>
          {card(false)}
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop / tablet (≥ 600): anchored popover with Radix flip/shift placement. The anchor is an
  // external element (`anchorEl`) — Radix accepts it as a `virtualRef` (Measurable); the cast
  // drops the nullable `current`, which Radix tolerates (it positions only once present).
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchorEl as React.RefObject<Measurable>} />
      <PopoverContent
        side="bottom"
        align="start"
        dir={dir}
        role="dialog"
        aria-label={label}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[300px] overflow-hidden rounded-[16px] border-[var(--border-strong)] bg-[var(--bg-color)] p-0 text-[var(--text-color)] [box-shadow:var(--shadow-menu)]"
      >
        {card(true)}
      </PopoverContent>
    </Popover>
  )
}
