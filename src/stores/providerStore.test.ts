import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useProviderStore,
  partializeProvider,
  migrateProvider,
  mergeProvider,
  PERSIST_VERSION,
} from './providerStore'
import * as registry from '@/providers/modelRegistry'

beforeEach(() => {
  useProviderStore.getState().reset()
})

describe('providerStore', () => {
  it('initializes to Anthropic + its default model, no key, not ready', () => {
    const s = useProviderStore.getState()
    expect(s.vendor).toBe('anthropic')
    expect(s.model).toBe('claude-fable-5')
    expect(s.apiKey).toBe('')
    expect(s.isReady()).toBe(false)
  })

  it('becomes ready once an API key is set', () => {
    useProviderStore.getState().setApiKey('sk-test')
    expect(useProviderStore.getState().isReady()).toBe(true)
  })

  it('treats a whitespace-only API key as not ready', () => {
    useProviderStore.getState().setApiKey('   ')
    expect(useProviderStore.getState().isReady()).toBe(false)
  })

  it('setVendor restores the per-vendor model (switch away and back keeps the prior selection)', () => {
    // #5 WI-3: setVendor changed from reset-to-default → restore models[vendor].
    useProviderStore.getState().setModel('claude-opus-4-8') // anthropic's selection
    useProviderStore.getState().setVendor('custom') // away (custom has no model yet → '')
    expect(useProviderStore.getState().model).toBe('')
    useProviderStore.getState().setVendor('anthropic') // back → restored, not reset
    expect(useProviderStore.getState().model).toBe('claude-opus-4-8')
  })

  it('switches freely between all implemented vendors (#5 — openai/gemini/ollama now wired)', () => {
    const { setVendor } = useProviderStore.getState()
    for (const v of ['openai', 'gemini', 'ollama', 'custom', 'anthropic'] as const) {
      setVendor(v)
      expect(useProviderStore.getState().vendor).toBe(v)
    }
  })

  it('refuses setVendor for a vendor that is not implemented (defense-in-depth via the registry guard)', () => {
    const spy = vi.spyOn(registry, 'isVendorImplemented').mockReturnValue(false)
    useProviderStore.getState().setVendor('openai')
    expect(useProviderStore.getState().vendor).toBe('anthropic') // unchanged
    spy.mockRestore()
  })

  it('isReady() is false when the active vendor is not implemented (defense-in-depth)', () => {
    useProviderStore.getState().setApiKey('sk-test')
    const spy = vi.spyOn(registry, 'isVendorImplemented').mockReturnValue(false)
    expect(useProviderStore.getState().isReady()).toBe(false)
    spy.mockRestore()
  })

  it('ollama is ready with no key (local, on-device) once it has a model', () => {
    useProviderStore.getState().setVendor('ollama')
    const s = useProviderStore.getState()
    expect(s.apiKeys.ollama).toBe('') // no key
    expect(s.model).toBe('llama3.2') // default model present
    expect(s.isReady()).toBe(true)
  })

  it('setModel updates the model', () => {
    useProviderStore.getState().setModel('claude-sonnet-4-6')
    expect(useProviderStore.getState().model).toBe('claude-sonnet-4-6')
  })

  it('clearKey empties the key and makes the provider not ready', () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234')
    expect(useProviderStore.getState().isReady()).toBe(true)
    useProviderStore.getState().clearKey()
    expect(useProviderStore.getState().apiKey).toBe('')
    expect(useProviderStore.getState().isReady()).toBe(false)
  })

  it('clearKey leaves the vendor and model untouched', () => {
    useProviderStore.getState().setApiKey('sk-ant-api03-abcd1234')
    useProviderStore.getState().clearKey()
    const s = useProviderStore.getState()
    expect(s.vendor).toBe('anthropic')
    expect(s.model).toBe('claude-fable-5')
  })

  it('reset restores the initial state atomically (incl. baseUrl)', () => {
    useProviderStore.setState({ vendor: 'openai', model: 'x', apiKey: 'sk-test', baseUrl: 'https://x/v1' })
    useProviderStore.getState().reset()
    const s = useProviderStore.getState()
    expect(s).toMatchObject({ vendor: 'anthropic', model: 'claude-fable-5', apiKey: '', baseUrl: '' })
  })

  describe('per-vendor keys + models (#5 WI-3)', () => {
    it('keeps a separate key per vendor; the active apiKey mirrors apiKeys[vendor]', () => {
      const s = useProviderStore.getState()
      s.setApiKey('sk-ant-aaa') // anthropic active
      s.setVendor('custom')
      s.setApiKey('sk-custom-bbb') // custom's key
      expect(useProviderStore.getState().apiKeys.anthropic).toBe('sk-ant-aaa')
      expect(useProviderStore.getState().apiKeys.custom).toBe('sk-custom-bbb')
      expect(useProviderStore.getState().apiKey).toBe('sk-custom-bbb') // mirror = active vendor
      useProviderStore.getState().setVendor('anthropic')
      expect(useProviderStore.getState().apiKey).toBe('sk-ant-aaa') // restored on switch back
    })

    it('clearKey clears only the active vendor, leaving others intact', () => {
      const s = useProviderStore.getState()
      s.setApiKey('sk-ant-aaa')
      s.setVendor('custom')
      s.setApiKey('sk-custom-bbb')
      useProviderStore.getState().clearKey() // clears custom only
      expect(useProviderStore.getState().apiKeys.custom).toBe('')
      expect(useProviderStore.getState().apiKeys.anthropic).toBe('sk-ant-aaa')
      expect(useProviderStore.getState().apiKey).toBe('') // mirror cleared
    })

    it('setModel writes the active vendor model and mirrors it', () => {
      useProviderStore.getState().setModel('claude-opus-4-8')
      expect(useProviderStore.getState().model).toBe('claude-opus-4-8')
      expect(useProviderStore.getState().models.anthropic).toBe('claude-opus-4-8')
    })

    it('setApiKey/setModel/clearKey can TARGET a non-active vendor without switching (Settings edits the viewed provider)', () => {
      const s = useProviderStore.getState() // active = anthropic
      s.setApiKey('sk-openai', 'openai')
      s.setModel('gpt-5.4-mini', 'openai')
      const after = useProviderStore.getState()
      expect(after.apiKeys.openai).toBe('sk-openai')
      expect(after.models.openai).toBe('gpt-5.4-mini')
      expect(after.vendor).toBe('anthropic') // active unchanged by editing another vendor
      expect(after.apiKey).toBe('') // mirror still reflects the active vendor (anthropic), untouched
      expect(after.model).toBe('claude-fable-5')
      useProviderStore.getState().clearKey('openai')
      expect(useProviderStore.getState().apiKeys.openai).toBe('')
    })

    it('initializes per-vendor records (keys empty, models at each vendor default)', () => {
      const s = useProviderStore.getState()
      expect(s.apiKeys).toEqual({ anthropic: '', openai: '', gemini: '', ollama: '', custom: '' })
      expect(s.models.anthropic).toBe('claude-fable-5')
      expect(s.models.openai).toBe('gpt-5.5')
      expect(s.models.custom).toBe('')
    })
  })

  describe('test-connection results (#6 — WI-6b)', () => {
    it('initializes every vendor to an idle test result', () => {
      const r = useProviderStore.getState().testResults
      for (const v of ['anthropic', 'openai', 'gemini', 'ollama', 'custom'] as const) {
        expect(r[v]).toEqual({ status: 'idle' })
      }
    })
    it('setTestResult records a per-vendor result (does not touch other vendors)', () => {
      useProviderStore.getState().setTestResult('openai', { status: 'ok', latencyMs: 142 })
      expect(useProviderStore.getState().testResults.openai).toEqual({ status: 'ok', latencyMs: 142 })
      expect(useProviderStore.getState().testResults.anthropic).toEqual({ status: 'idle' })
    })
    it('reset clears test results back to idle', () => {
      useProviderStore.getState().setTestResult('openai', { status: 'fail', msgKey: 'error.invalidKey' })
      useProviderStore.getState().reset()
      expect(useProviderStore.getState().testResults.openai).toEqual({ status: 'idle' })
    })
  })

  describe('custom provider (#7)', () => {
    it('setVendor accepts custom (implemented) and resets the model to its empty default', () => {
      useProviderStore.getState().setVendor('custom')
      expect(useProviderStore.getState().vendor).toBe('custom')
      expect(useProviderStore.getState().model).toBe('')
    })
    it('setBaseUrl stores the endpoint', () => {
      useProviderStore.getState().setBaseUrl('https://api.example.com/v1')
      expect(useProviderStore.getState().baseUrl).toBe('https://api.example.com/v1')
    })
    it('isReady for custom needs baseUrl + model — the key is OPTIONAL (keyless self-hosted OR keyed proxy)', () => {
      const s = useProviderStore.getState()
      s.setVendor('custom')
      expect(useProviderStore.getState().isReady()).toBe(false) // nothing set
      useProviderStore.getState().setBaseUrl('https://x/v1')
      expect(useProviderStore.getState().isReady()).toBe(false) // no model yet
      useProviderStore.getState().setModel('my-model')
      expect(useProviderStore.getState().isReady()).toBe(true) // ready WITHOUT a key
    })
  })

  // feature #12 — persistence of the NON-SECRET config (vendor/models/baseUrl); keys stay in-memory.
  describe('persist', () => {
    const current = () => useProviderStore.getState() // initial state + actions (reset in beforeEach)

    it('partializeProvider persists ONLY vendor/models/baseUrl — never keys/model/testResults (§5)', () => {
      useProviderStore.getState().setApiKey('sk-secret-key')
      const p = partializeProvider(useProviderStore.getState())
      expect(Object.keys(p).sort()).toEqual(['baseUrl', 'models', 'vendor'])
      expect(JSON.stringify(p)).not.toContain('sk-secret-key')
    })

    it('round-trips vendor/baseUrl/models and re-derives the model mirror', () => {
      useProviderStore.getState().setVendor('custom')
      useProviderStore.getState().setBaseUrl('https://api.example.com/v1')
      useProviderStore.getState().setModel('gpt-4o-mini', 'custom')
      const persisted = partializeProvider(useProviderStore.getState())
      useProviderStore.getState().reset()
      const merged = mergeProvider(persisted, current())
      expect(merged.vendor).toBe('custom')
      expect(merged.baseUrl).toBe('https://api.example.com/v1')
      expect(merged.models.custom).toBe('gpt-4o-mini')
      expect(merged.model).toBe('gpt-4o-mini') // mirror re-derived = models[vendor]
    })

    it('preserves the store actions through merge (the ...current spread)', () => {
      const merged = mergeProvider({ vendor: 'openai', models: {}, baseUrl: '' }, current())
      expect(typeof merged.setVendor).toBe('function')
      expect(typeof merged.reset).toBe('function')
      expect(typeof merged.isReady).toBe('function')
    })

    it('NEVER rehydrates API keys, even if a persisted blob contains them (§5)', () => {
      const blob = {
        vendor: 'custom',
        models: { custom: 'm' },
        baseUrl: 'u',
        apiKey: 'leak',
        apiKeys: { anthropic: 'leak2', custom: 'leak3' },
      }
      const merged = mergeProvider(blob, current())
      expect(merged.apiKey).toBe('')
      expect(merged.apiKeys.custom).toBe('')
      expect(merged.apiKeys.anthropic).toBe('')
    })

    it('falls back to the default vendor when the persisted vendor is unknown/invalid', () => {
      const merged = mergeProvider({ vendor: 'mistral', models: {}, baseUrl: '' }, current())
      expect(merged.vendor).toBe('anthropic')
      expect(merged.model).toBe(merged.models.anthropic)
    })

    it('falls back when the persisted vendor is a non-string', () => {
      const merged = mergeProvider({ vendor: 42, models: {}, baseUrl: '' }, current())
      expect(merged.vendor).toBe('anthropic')
    })

    it('keeps default models when the persisted models field is not a record', () => {
      const c = current()
      const merged = mergeProvider({ vendor: 'custom', models: null, baseUrl: 'u' }, c)
      expect(merged.models).toEqual(c.models)
      expect(merged.baseUrl).toBe('u')
    })

    it('keyless implemented vendor rehydrates to not-ready (panel needs a key)', () => {
      useProviderStore.setState(
        mergeProvider({ vendor: 'openai', models: { openai: 'gpt-4o' }, baseUrl: '' }, current()),
      )
      const s = useProviderStore.getState()
      expect(s.vendor).toBe('openai')
      expect(s.model).toBe('gpt-4o')
      expect(s.apiKey).toBe('')
      expect(s.isReady()).toBe(false)
    })

    it('overlays a partial persisted models onto complete defaults (missing vendors keep defaults)', () => {
      const c = current()
      const merged = mergeProvider({ vendor: 'anthropic', models: { custom: 'my-model' }, baseUrl: '' }, c)
      expect(merged.models.custom).toBe('my-model')
      expect(merged.models.gemini).toBe(c.models.gemini) // default kept
    })

    it('restores baseUrl regardless of the active vendor (intentional — keeps it for switching back)', () => {
      const merged = mergeProvider({ vendor: 'anthropic', models: {}, baseUrl: 'https://saved.example/v1' }, current())
      expect(merged.vendor).toBe('anthropic')
      expect(merged.baseUrl).toBe('https://saved.example/v1')
    })

    it.each([null, undefined, 'a string', 42, []])(
      'returns defaults for a non-object persisted blob: %j',
      (blob) => {
        const merged = mergeProvider(blob, current())
        expect(merged.vendor).toBe('anthropic')
        expect(merged.baseUrl).toBe('')
      },
    )

    it('skips non-string and empty model entries and a non-string baseUrl (no throw)', () => {
      const c = current()
      const merged = mergeProvider(
        { vendor: 'custom', models: { custom: 123, openai: 'ok', gemini: '' }, baseUrl: 99 },
        c,
      )
      expect(merged.models.custom).toBe(c.models.custom) // numeric entry skipped → default kept
      expect(merged.models.gemini).toBe(c.models.gemini) // empty string skipped → default kept
      expect(merged.models.openai).toBe('ok') // non-empty string → kept
      expect(merged.baseUrl).toBe('') // non-string → default
    })

    it('migrateProvider passes through the current version and drops any other', () => {
      expect(migrateProvider({ vendor: 'custom' }, PERSIST_VERSION)).toEqual({ vendor: 'custom' })
      expect(migrateProvider({ vendor: 'custom' }, 99)).toBeUndefined()
    })
  })
})
