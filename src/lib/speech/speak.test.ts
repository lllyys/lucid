import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSpeech, type SpeechSynthesisLike } from './speak'

// A minimal fake SpeechSynthesis + utterance shapes for deterministic tests.
interface FakeVoice {
  lang: string
  name: string
}

function makeFakeSynth(voices: FakeVoice[] = []) {
  const listeners: Record<string, Array<() => void>> = {}
  type Handlers = {
    onstart?: ((ev?: unknown) => void) | null
    onend?: ((ev?: unknown) => void) | null
    onerror?: ((ev?: unknown) => void) | null
  }
  let current: Handlers | null = null
  const synth: SpeechSynthesisLike & {
    __voices: FakeVoice[]
    __fireVoicesChanged: () => void
    __finish: () => void
    __error: () => void
    speakCalls: number
    cancelCalls: number
  } = {
    speakCalls: 0,
    cancelCalls: 0,
    __voices: voices,
    getVoices: () => synth.__voices,
    speak(utt: SpeechSynthesisUtterance) {
      synth.speakCalls++
      current = utt as unknown as Handlers
      current.onstart?.()
    },
    cancel() {
      synth.cancelCalls++
    },
    addEventListener(type: string, cb: () => void) {
      ;(listeners[type] ??= []).push(cb)
    },
    removeEventListener(type: string, cb: () => void) {
      listeners[type] = (listeners[type] ?? []).filter((c) => c !== cb)
    },
    __fireVoicesChanged() {
      for (const cb of listeners['voiceschanged'] ?? []) cb()
    },
    __finish() {
      current?.onend?.()
    },
    __error() {
      current?.onerror?.()
    },
  } as never
  return synth
}

// A fake utterance constructor (jsdom lacks SpeechSynthesisUtterance under our injection).
class FakeUtterance {
  text: string
  lang = ''
  voice: unknown = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

const makeUtterance = (text: string) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance

/** Simulate an environment with no SpeechSynthesis (jsdom default already lacks it). */
function removeSpeechSynthesis() {
  Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true, writable: true })
}

describe('createSpeech', () => {
  it('speak() sets the utterance lang and picks a voice matching the language prefix', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }, { lang: 'zh-CN', name: 'Mei' }])
    const s = createSpeech({ synth, makeUtterance })
    const utt = s.speak('hello', 'en') as unknown as FakeUtterance
    expect(synth.speakCalls).toBe(1)
    expect(utt.lang).toBe('en')
    expect((utt.voice as FakeVoice).lang).toBe('en-US')
  })

  it('re-speak cancels the prior utterance first', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    s.speak('one', 'en')
    s.speak('two', 'en')
    expect(synth.cancelCalls).toBeGreaterThanOrEqual(1)
    expect(synth.speakCalls).toBe(2)
  })

  it('hasVoiceFor is true for an available language, false otherwise', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    expect(s.hasVoiceFor('en')).toBe(true)
    expect(s.hasVoiceFor('zh')).toBe(false)
  })

  it('hasVoiceFor flips false → true after a voiceschanged event (async voice load)', () => {
    const synth = makeFakeSynth([]) // voices not loaded yet
    const s = createSpeech({ synth, makeUtterance })
    expect(s.hasVoiceFor('en')).toBe(false)
    expect(s.voicesReady).toBe(false)
    // voices arrive asynchronously
    synth.__voices = [{ lang: 'en-GB', name: 'Daniel' }]
    synth.__fireVoicesChanged()
    expect(s.hasVoiceFor('en')).toBe(true)
    expect(s.voicesReady).toBe(true)
  })

  it('voicesReady is true immediately when getVoices() is already populated', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    expect(s.voicesReady).toBe(true)
  })

  it('subscribe notifies on voiceschanged and unsubscribes cleanly', () => {
    const synth = makeFakeSynth([])
    const s = createSpeech({ synth, makeUtterance })
    const cb = vi.fn()
    const off = s.subscribe(cb)
    synth.__fireVoicesChanged()
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    synth.__fireVoicesChanged()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('isSpeaking tracks idle → speaking → idle across start and end', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    expect(s.isSpeaking()).toBe(false)
    s.speak('hi', 'en')
    expect(s.isSpeaking()).toBe(true)
    synth.__finish()
    expect(s.isSpeaking()).toBe(false)
  })

  it('onerror returns to idle', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    s.speak('hi', 'en')
    expect(s.isSpeaking()).toBe(true)
    synth.__error()
    expect(s.isSpeaking()).toBe(false)
  })

  it('speak with no matching voice still speaks (utterance lang set, voice left null)', () => {
    const synth = makeFakeSynth([{ lang: 'fr-FR', name: 'Thomas' }])
    const s = createSpeech({ synth, makeUtterance })
    const utt = s.speak('hi', 'en') as unknown as FakeUtterance
    expect(synth.speakCalls).toBe(1)
    expect(utt.lang).toBe('en')
    expect(utt.voice).toBeNull()
  })

  it('notifies subscribers when speaking state changes (for re-render)', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    const cb = vi.fn()
    s.subscribe(cb)
    s.speak('hi', 'en')
    synth.__finish()
    expect(cb).toHaveBeenCalled()
  })

  it('cancel() with a synth calls synth.cancel() and returns to idle', () => {
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth, makeUtterance })
    s.speak('hi', 'en')
    expect(s.isSpeaking()).toBe(true)
    s.cancel()
    expect(synth.cancelCalls).toBeGreaterThanOrEqual(1)
    expect(s.isSpeaking()).toBe(false)
  })
})

describe('createSpeech — falls back to window.speechSynthesis', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'speechSynthesis')
  afterEach(() => {
    if (original) Object.defineProperty(window, 'speechSynthesis', original)
    else removeSpeechSynthesis()
  })

  it('resolves the real window.speechSynthesis when no synth is injected', () => {
    const fake = {
      getVoices: () => [{ lang: 'en-US', name: 'Alex' }],
      speak: vi.fn(),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true, writable: true })
    const s = createSpeech({ makeUtterance })
    expect(s.hasVoiceFor('en')).toBe(true)
    expect(s.voicesReady).toBe(true)
  })
})

describe('createSpeech — default utterance factory', () => {
  const originalCtor = (globalThis as Record<string, unknown>).SpeechSynthesisUtterance
  afterEach(() => {
    ;(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = originalCtor
  })

  it('uses `new SpeechSynthesisUtterance(text)` when no factory is injected', () => {
    // jsdom lacks the constructor; stub it so the default arm of makeUtterance is exercised.
    const ctor = vi.fn(function (this: Record<string, unknown>, text: string) {
      this.text = text
    })
    ;(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = ctor
    const synth = makeFakeSynth([{ lang: 'en-US', name: 'Alex' }])
    const s = createSpeech({ synth }) // no makeUtterance → default factory
    s.speak('hi', 'en')
    expect(ctor).toHaveBeenCalledWith('hi')
    expect(synth.speakCalls).toBe(1)
  })
})

describe('createSpeech — no SpeechSynthesis (jsdom / unsupported)', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'speechSynthesis')

  afterEach(() => {
    if (original) Object.defineProperty(window, 'speechSynthesis', original)
  })

  it('cancel() no-ops safely when speechSynthesis is undefined', () => {
    // No injected synth and no window.speechSynthesis → cancel must not throw.
    removeSpeechSynthesis()
    const s = createSpeech({ makeUtterance })
    expect(() => s.cancel()).not.toThrow()
    expect(s.isSpeaking()).toBe(false)
    expect(s.hasVoiceFor('en')).toBe(false)
    expect(s.voicesReady).toBe(false)
  })

  it('speak() no-ops safely when there is no synth', () => {
    removeSpeechSynthesis()
    const s = createSpeech({ makeUtterance })
    expect(() => s.speak('hi', 'en')).not.toThrow()
    expect(s.isSpeaking()).toBe(false)
  })

  it('subscribe() returns a no-op unsubscribe when there is no synth', () => {
    removeSpeechSynthesis()
    const s = createSpeech({ makeUtterance })
    const off = s.subscribe(() => {})
    expect(() => off()).not.toThrow()
  })
})
