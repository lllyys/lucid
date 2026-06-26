import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectDirection, directionLabels } from '@/lib/translation/detectDirection'
import { useWordLookup } from '@/hooks/useWordLookup'
import { useLookupStore } from '@/stores/lookupStore'
import { useViewportTier } from '@/hooks/useViewportTier'
import { createSpeech } from '@/lib/speech/speak'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ClickableText, type WordActivation } from './ClickableText'
import { LookupCard, type LookupCardData, type PlayState } from './LookupCard'

/** RTL source languages — drives the card's `dir` + logical layout (rule 66 §3). */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur'])

/**
 * Word-lookup host for a rendered result pane (feature #20, WI-6/7). Renders the pane's text via
 * ClickableText — words clickable only at `done` (plan M3) — threads the pane's 中↔EN direction
 * into the activation payload, drives useWordLookup, and shows the designed popover (desktop /
 * tablet) or bottom-sheet (phone < 600) anchored to the clicked word.
 *
 * Audio: one createSpeech() instance per host. The play button subscribes to its voiceschanged
 * signal (Gate-2 H4) and re-derives hasVoiceFor, so it is transiently disabled while voices load
 * and permanently no-voice only once voicesReady && !hasVoiceFor. A cleanup effect cancels any
 * in-flight speech on unmount AND on word change (Gate-2 M4) — a no-op when SpeechSynthesis is
 * absent (jsdom). Esc / outside-click / Close dismiss via the store; Radix returns focus to the
 * clicked word. The meaning is an aria-live=polite region (announced once settled).
 */
export function WordLookupPopover({ text, done }: { text: string; done: boolean }) {
  const { t } = useTranslation()
  const { lookup, close } = useWordLookup()
  const tier = useViewportTier()
  const isPhone = tier === 'phone'

  const speech = useMemo(() => createSpeech(), [])
  // Bump on every voiceschanged / speaking-state change so the play button re-derives.
  const [, forceTick] = useState(0)
  useEffect(() => speech.subscribe(() => forceTick((n) => n + 1)), [speech])

  const open = useLookupStore((s) => s.open)
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

  // Track the exact clicked token (word + offset) so only that instance highlights — the same
  // word can repeat. Cleared when the store's lookup closes.
  const [active, setActive] = useState<{ word: string; offset: number } | null>(null)
  const labels = directionLabels(detectDirection(text))

  useEffect(() => {
    if (!open) setActive(null)
  }, [open])

  // Cancel in-flight speech on unmount AND whenever the active word changes (M4). storeWord is the
  // change key; cancel() is a safe no-op when SpeechSynthesis is unavailable.
  useEffect(() => {
    return () => speech.cancel()
  }, [speech, storeWord])

  const onActivate = (a: WordActivation) => {
    setActive({ word: a.word, offset: a.offset })
    lookup({
      word: a.word,
      sentence: a.sentence,
      sourceLang: a.sourceLang,
      targetLang: a.targetLang ?? labels.tgtCode,
    })
  }

  const activeWord = open && active && active.word === storeWord ? active : null
  const clickable = (
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

  const onRetry = () =>
    lookup({ word: storeWord, sentence, sourceLang, targetLang: targetLang ?? labels.tgtCode })

  const dir = sourceLang && RTL_LANGS.has(sourceLang) ? 'rtl' : undefined
  const label = t('lookup.dialogLabel', { word: storeWord })

  const card = (showContext: boolean) => (
    <LookupCard
      data={data}
      play={play}
      onClose={close}
      onRetry={onRetry}
      onProviders={close}
      showContext={showContext}
      voicesReady={voicesReady}
      hasVoice={hasVoice}
    />
  )

  const onOpenChange = (next: boolean) => {
    if (!next) close()
  }

  // Phone (< 600): a bottom sheet docked full-width (design Section D). The grab handle + larger
  // targets come from the sheet chrome; the context line is omitted on the narrow surface.
  if (isPhone) {
    return (
      <>
        {clickable}
        <Sheet open={open} onOpenChange={onOpenChange}>
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
      </>
    )
  }

  // Desktop / tablet (≥ 600): anchored popover with Radix flip/shift placement.
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span>{clickable}</span>
      </PopoverAnchor>
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
