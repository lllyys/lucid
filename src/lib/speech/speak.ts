// Purpose: a thin, injectable wrapper over the browser SpeechSynthesis API for the word-lookup
// popover's play button (feature #20). It cancels any prior utterance before speaking, sets the
// BCP-47 lang, picks a voice by language prefix from getVoices(), and tracks speaking state via
// onstart/onend/onerror. Voices can load asynchronously, so it exposes a `voiceschanged`
// subscription + a `voicesReady` flag so the popover distinguishes "voices not loaded yet"
// (transient) from "loaded, none match" (the no-voice state). Every method is a safe no-op when
// SpeechSynthesis is unavailable (jsdom / unsupported), so callers never guard the global.

/** The slice of the SpeechSynthesis API this wrapper uses (injectable for tests). */
export interface SpeechSynthesisLike {
  getVoices(): ReadonlyArray<{ lang: string; name: string }>
  speak(utterance: SpeechSynthesisUtterance): void
  cancel(): void
  addEventListener(type: 'voiceschanged', listener: () => void): void
  removeEventListener(type: 'voiceschanged', listener: () => void): void
}

export interface CreateSpeechOptions {
  /** Inject a fake synth in tests; defaults to window.speechSynthesis. */
  synth?: SpeechSynthesisLike
  /** Inject an utterance factory in tests; defaults to `new SpeechSynthesisUtterance(text)`. */
  makeUtterance?: (text: string) => SpeechSynthesisUtterance
}

export interface Speech {
  /** Speak `text` in `lang` (BCP-47). Cancels any prior utterance. Returns the utterance (or null). */
  speak(text: string, lang: string): SpeechSynthesisUtterance | null
  /** Stop any in-flight speech. Safe no-op when unsupported. */
  cancel(): void
  /** Whether an utterance is currently speaking. */
  isSpeaking(): boolean
  /** Whether a voice whose lang starts with `lang`'s primary subtag is available. */
  hasVoiceFor(lang: string): boolean
  /** True once the voice list is non-empty (voices may load asynchronously). */
  readonly voicesReady: boolean
  /** Subscribe to voices-loaded + speaking-state changes; returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void
}

function resolveSynth(opt: CreateSpeechOptions): SpeechSynthesisLike | undefined {
  if (opt.synth) return opt.synth
  if (typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined') {
    return window.speechSynthesis as unknown as SpeechSynthesisLike
  }
  return undefined
}

/** Primary language subtag, lowercased (e.g. 'en-US' → 'en'). */
function primary(lang: string): string {
  return lang.split('-')[0].toLowerCase()
}

export function createSpeech(options: CreateSpeechOptions = {}): Speech {
  const synth = resolveSynth(options)
  const makeUtterance =
    options.makeUtterance ?? ((text: string) => new SpeechSynthesisUtterance(text))

  let speaking = false
  let voicesReady = synth ? synth.getVoices().length > 0 : false
  const subscribers = new Set<() => void>()
  const notify = () => {
    for (const cb of subscribers) cb()
  }

  // Voices often load after first paint; flip voicesReady and re-notify so consumers re-derive
  // hasVoiceFor. Registered once for the lifetime of this Speech instance.
  if (synth) {
    synth.addEventListener('voiceschanged', () => {
      voicesReady = synth.getVoices().length > 0
      notify()
    })
  }

  const setSpeaking = (next: boolean) => {
    speaking = next
    notify()
  }

  return {
    get voicesReady() {
      return voicesReady
    },

    speak(text, lang) {
      if (!synth) return null
      synth.cancel() // cancel any prior utterance before starting a new one
      const utt = makeUtterance(text)
      utt.lang = lang
      const want = primary(lang)
      const match = synth.getVoices().find((v) => primary(v.lang) === want)
      if (match) utt.voice = match as unknown as SpeechSynthesisVoice
      utt.onstart = () => setSpeaking(true)
      utt.onend = () => setSpeaking(false)
      utt.onerror = () => setSpeaking(false)
      synth.speak(utt)
      return utt
    },

    cancel() {
      if (!synth) return
      synth.cancel()
      setSpeaking(false)
    },

    isSpeaking() {
      return speaking
    },

    hasVoiceFor(lang) {
      if (!synth) return false
      const want = primary(lang)
      return synth.getVoices().some((v) => primary(v.lang) === want)
    },

    subscribe(cb) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
  }
}
