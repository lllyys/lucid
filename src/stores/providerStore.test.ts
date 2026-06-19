import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  useProviderStore,
  partializeProvider,
  migrateProvider,
  mergeProvider,
  activeTarget,
  PERSIST_VERSION,
} from './providerStore'
import { __resetCustomIds, __useRandomCustomIds, MAX_CUSTOM_PROVIDERS } from './providerStoreMigrate'
import * as registry from '@/providers/modelRegistry'

beforeEach(() => {
  __resetCustomIds() // deterministic c1, c2, … ids for stable assertions
  useProviderStore.getState().reset()
})

afterAll(() => {
  __useRandomCustomIds() // restore production uuid generator
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
    it('isReady for an active custom needs its baseUrl + model — the key is OPTIONAL (#10)', () => {
      // #10: a bare vendor='custom' (no active id) is NOT ready; readiness reads the active custom.
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: '', model: '' })
      useProviderStore.getState().setVendor({ type: 'custom', id })
      expect(useProviderStore.getState().isReady()).toBe(false) // nothing set
      useProviderStore.getState().setBaseUrl('https://x/v1', id)
      expect(useProviderStore.getState().isReady()).toBe(false) // no model yet
      useProviderStore.getState().setModel('my-model', undefined, id)
      expect(useProviderStore.getState().isReady()).toBe(true) // ready WITHOUT a key
    })
  })

  // feature #12 — persistence of the NON-SECRET config (vendor/models/baseUrl); keys stay in-memory.
  describe('persist', () => {
    const current = () => useProviderStore.getState() // initial state + actions (reset in beforeEach)

    it('partializeProvider persists vendor/models/baseUrl/customProviders/activeCustomId — never keys/model/testResults (§5)', () => {
      useProviderStore.getState().setApiKey('sk-secret-key')
      const p = partializeProvider(useProviderStore.getState())
      expect(Object.keys(p).sort()).toEqual(['activeCustomId', 'baseUrl', 'customProviders', 'models', 'vendor'])
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

    it('migrateProvider passes a v2 (current) blob through and drops an unknown version', () => {
      const v2 = { vendor: 'custom', models: {}, baseUrl: '', customProviders: {}, activeCustomId: null }
      expect(migrateProvider(v2, PERSIST_VERSION)).toBe(v2)
      expect(migrateProvider({ vendor: 'custom' }, 99)).toBeUndefined()
    })

    it('migrateProvider (v1→v2) carries a v1 single-custom config into ONE active custom entry', () => {
      const v1 = { vendor: 'custom', models: { custom: 'm' }, baseUrl: 'https://x/v1' }
      const out = migrateProvider(v1, 1) as {
        customProviders: Record<string, { id: string; label: string; baseUrl: string; model: string }>
        activeCustomId: string | null
      }
      const ids = Object.keys(out.customProviders)
      expect(ids).toHaveLength(1)
      expect(out.customProviders[ids[0]]).toMatchObject({ label: 'Custom', baseUrl: 'https://x/v1', model: 'm' })
      expect(out.activeCustomId).toBe(ids[0])
    })
  })

  describe('multiple custom providers (#10 WI-1)', () => {
    it('initializes empty: no custom providers, no active custom', () => {
      const s = useProviderStore.getState()
      expect(s.customProviders).toEqual({})
      expect(s.activeCustomId).toBeNull()
    })

    it('addCustomProvider mints an id, stores the entry, and returns the id', () => {
      const id = useProviderStore.getState().addCustomProvider({
        label: 'My proxy',
        baseUrl: 'https://proxy/v1',
        model: 'gpt-x',
        key: 'sk-secret',
      })
      expect(id).toBe('c1')
      const c = useProviderStore.getState().customProviders[id]
      expect(c).toMatchObject({ id: 'c1', label: 'My proxy', baseUrl: 'https://proxy/v1', model: 'gpt-x', key: 'sk-secret' })
      expect(c.testResult).toEqual({ status: 'idle' })
    })

    it('addCustomProvider defaults an absent key to ""', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      expect(useProviderStore.getState().customProviders[id].key).toBe('')
    })

    it('updateCustomProvider patches only the named fields', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().updateCustomProvider(id, { model: 'm2', baseUrl: 'u2' })
      const c = useProviderStore.getState().customProviders[id]
      expect(c).toMatchObject({ label: 'L', baseUrl: 'u2', model: 'm2' })
    })

    it('updateCustomProvider on an unknown id is a no-op (does not throw or create)', () => {
      useProviderStore.getState().updateCustomProvider('ghost', { model: 'x' })
      expect(useProviderStore.getState().customProviders).toEqual({})
    })

    it('setVendor({type:"custom",id}) sets vendor="custom" + activeCustomId when the id exists', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().setVendor({ type: 'custom', id })
      const s = useProviderStore.getState()
      expect(s.vendor).toBe('custom')
      expect(s.activeCustomId).toBe(id)
    })

    it('setVendor({type:"custom",id}) for an unknown id is refused (state unchanged)', () => {
      useProviderStore.getState().setVendor({ type: 'custom', id: 'ghost' })
      const s = useProviderStore.getState()
      expect(s.vendor).toBe('anthropic')
      expect(s.activeCustomId).toBeNull()
    })

    it('setVendor to a built-in vendor clears activeCustomId', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().setVendor({ type: 'custom', id })
      useProviderStore.getState().setVendor('anthropic')
      expect(useProviderStore.getState().activeCustomId).toBeNull()
    })

    it('isReady for an active custom requires its baseUrl + model (key optional)', () => {
      const empty = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: '', model: '' })
      useProviderStore.getState().setVendor({ type: 'custom', id: empty })
      expect(useProviderStore.getState().isReady()).toBe(false)
      useProviderStore.getState().updateCustomProvider(empty, { baseUrl: 'https://x/v1' })
      expect(useProviderStore.getState().isReady()).toBe(false) // no model
      useProviderStore.getState().updateCustomProvider(empty, { model: 'm' })
      expect(useProviderStore.getState().isReady()).toBe(true) // ready WITHOUT a key
    })

    it('isReady is false (never crashes) when vendor=custom but activeCustomId is null/dangling', () => {
      useProviderStore.setState({ vendor: 'custom', activeCustomId: null })
      expect(useProviderStore.getState().isReady()).toBe(false)
      useProviderStore.setState({ vendor: 'custom', activeCustomId: 'ghost' })
      expect(useProviderStore.getState().isReady()).toBe(false)
    })

    it('removeCustomProvider on an unknown id is a no-op (does not throw)', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().removeCustomProvider('ghost')
      expect(Object.keys(useProviderStore.getState().customProviders)).toEqual([id])
    })

    it('a custom-targeted setter with an unknown id is a no-op (patchCustom guard)', () => {
      useProviderStore.getState().setBaseUrl('https://x/v1', 'ghost')
      expect(useProviderStore.getState().customProviders).toEqual({})
    })

    it('removeCustomProvider quietly deletes a NON-active custom (active target untouched)', () => {
      const keep = useProviderStore.getState().addCustomProvider({ label: 'Keep', baseUrl: 'u', model: 'm' })
      const drop = useProviderStore.getState().addCustomProvider({ label: 'Drop', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().setVendor({ type: 'custom', id: keep })
      useProviderStore.getState().removeCustomProvider(drop)
      const s = useProviderStore.getState()
      expect(s.customProviders[drop]).toBeUndefined()
      expect(s.activeCustomId).toBe(keep) // active untouched
      expect(s.vendor).toBe('custom')
    })

    it('removing the ACTIVE custom falls back deterministically to the anthropic built-in', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().setVendor({ type: 'custom', id })
      useProviderStore.getState().removeCustomProvider(id)
      const s = useProviderStore.getState()
      expect(s.customProviders[id]).toBeUndefined()
      expect(s.activeCustomId).toBeNull()
      expect(s.vendor).toBe('anthropic')
      expect(s.model).toBe(s.models.anthropic) // mirror re-derived
    })

    it('removing the custom named by activeCustomId clears it even when vendor is a built-in (Gate-4 Medium)', () => {
      // Defensive: if activeCustomId still points at a custom while a built-in is active, removing that
      // custom must NOT leave a dangling activeCustomId. The fallback only fires when vendor==='custom'.
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.setState({ vendor: 'openai', activeCustomId: id }) // built-in active + dangling-to-be
      useProviderStore.getState().removeCustomProvider(id)
      const s = useProviderStore.getState()
      expect(s.customProviders[id]).toBeUndefined()
      expect(s.activeCustomId).toBeNull() // cleared regardless of vendor
      expect(s.vendor).toBe('openai') // a built-in is already active → no anthropic fallback
    })

    describe('per-custom field setters (optional id targets the active custom)', () => {
      it('setBaseUrl/setModel/setApiKey/setTestResult target the named custom by id', () => {
        const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: '', model: '' })
        useProviderStore.getState().setBaseUrl('https://x/v1', id) // setBaseUrl(baseUrl, customId)
        useProviderStore.getState().setModel('m', undefined, id) // setModel(model, vendor, customId)
        useProviderStore.getState().setApiKey('sk-c', undefined, id) // setApiKey(key, vendor, customId)
        useProviderStore.getState().setTestResult('custom', { status: 'ok', latencyMs: 9 }, id)
        const c = useProviderStore.getState().customProviders[id]
        expect(c).toMatchObject({ baseUrl: 'https://x/v1', model: 'm', key: 'sk-c' })
        expect(c.testResult).toEqual({ status: 'ok', latencyMs: 9 })
      })

      it('clearKey(id) empties only that custom provider key', () => {
        const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm', key: 'sk-c' })
        useProviderStore.getState().clearKey('custom', id)
        expect(useProviderStore.getState().customProviders[id].key).toBe('')
      })
    })

    describe('uniqueLabel predicate (#10 — shared by form + store)', () => {
      it('rejects a duplicate label (trim + case-insensitive); allows a distinct one', () => {
        useProviderStore.getState().addCustomProvider({ label: 'OpenRouter', baseUrl: 'u', model: 'm' })
        const s = useProviderStore.getState()
        expect(s.uniqueLabel('  openrouter  ')).toBe(false) // collision
        expect(s.uniqueLabel('Together')).toBe(true) // distinct
        expect(s.uniqueLabel('   ')).toBe(false) // empty after trim
      })

      it('exceptId lets an entry keep its own label while editing', () => {
        const id = useProviderStore.getState().addCustomProvider({ label: 'OpenRouter', baseUrl: 'u', model: 'm' })
        expect(useProviderStore.getState().uniqueLabel('OpenRouter', id)).toBe(true) // editing itself
        expect(useProviderStore.getState().uniqueLabel('OpenRouter')).toBe(false) // a NEW one collides
      })
    })

    describe('activeTarget selector (#10 WI-2 — effective config for the active target)', () => {
      it('resolves a built-in vendor to its mirror config {apiKey, model, baseUrl}', () => {
        useProviderStore.getState().setApiKey('sk-ant')
        useProviderStore.getState().setModel('claude-opus-4-8')
        expect(activeTarget(useProviderStore.getState())).toEqual({
          apiKey: 'sk-ant',
          model: 'claude-opus-4-8',
          baseUrl: '',
        })
      })

      it('resolves an active custom to ITS OWN key/model/baseUrl (not the legacy top-level mirror)', () => {
        const id = useProviderStore
          .getState()
          .addCustomProvider({ label: 'L', baseUrl: 'https://c/v1', model: 'cm', key: 'sk-c' })
        useProviderStore.getState().setVendor({ type: 'custom', id })
        // a stray legacy top-level baseUrl must NOT leak into the resolved custom config
        useProviderStore.getState().setBaseUrl('https://stale-legacy/v1')
        expect(activeTarget(useProviderStore.getState())).toEqual({
          apiKey: 'sk-c',
          model: 'cm',
          baseUrl: 'https://c/v1',
        })
      })

      it('falls back to the built-in mirror config when vendor=custom but activeCustomId is dangling', () => {
        useProviderStore.setState({ vendor: 'custom', activeCustomId: 'ghost', apiKey: 'sk-x', model: 'mx', baseUrl: 'u' })
        expect(activeTarget(useProviderStore.getState())).toEqual({ apiKey: 'sk-x', model: 'mx', baseUrl: 'u' })
      })

      it('falls back to the mirror config when vendor=custom but activeCustomId is null', () => {
        useProviderStore.setState({ vendor: 'custom', activeCustomId: null, apiKey: 'sk-y', model: 'my', baseUrl: 'u2' })
        expect(activeTarget(useProviderStore.getState())).toEqual({ apiKey: 'sk-y', model: 'my', baseUrl: 'u2' })
      })
    })

    it('reset clears custom providers + the active custom', () => {
      const id = useProviderStore.getState().addCustomProvider({ label: 'L', baseUrl: 'u', model: 'm' })
      useProviderStore.getState().setVendor({ type: 'custom', id })
      useProviderStore.getState().reset()
      const s = useProviderStore.getState()
      expect(s.customProviders).toEqual({})
      expect(s.activeCustomId).toBeNull()
      expect(s.vendor).toBe('anthropic')
    })
  })

  describe('persist — custom providers (#10 WI-1)', () => {
    const current = () => useProviderStore.getState()

    it('partializeProvider persists customProviders STRIPPED to {id,label,baseUrl,model} + activeCustomId', () => {
      const id = useProviderStore.getState().addCustomProvider({
        label: 'L',
        baseUrl: 'https://x/v1',
        model: 'm',
        key: 'sk-secret',
      })
      useProviderStore.getState().setTestResult('custom', { status: 'ok', latencyMs: 7 }, id)
      useProviderStore.getState().setVendor({ type: 'custom', id })
      const p = partializeProvider(useProviderStore.getState())
      expect(Object.keys(p).sort()).toEqual(['activeCustomId', 'baseUrl', 'customProviders', 'models', 'vendor'])
      expect(p.customProviders[id]).toEqual({ id, label: 'L', baseUrl: 'https://x/v1', model: 'm' })
      expect(p.activeCustomId).toBe(id)
      // §5: NEITHER the key NOR the transient ok-result reaches the persisted blob
      expect(JSON.stringify(p)).not.toContain('sk-secret')
      expect(JSON.stringify(p)).not.toContain('"ok"')
    })

    it('merge rehydrates persisted customProviders with key="" + idle testResult (§5)', () => {
      const blob = {
        vendor: 'custom',
        models: {},
        baseUrl: '',
        activeCustomId: 'a',
        customProviders: { a: { id: 'a', label: 'A', baseUrl: 'https://a/v1', model: 'm' } },
      }
      const merged = mergeProvider(blob, current())
      expect(merged.customProviders.a).toEqual({ id: 'a', label: 'A', baseUrl: 'https://a/v1', model: 'm', key: '', testResult: { status: 'idle' } })
      expect(merged.activeCustomId).toBe('a')
      expect(merged.vendor).toBe('custom')
    })

    it('merge drops a hostile blob: __proto__/constructor keys, id mismatch, non-string fields, oversize', () => {
      const customProviders: Record<string, unknown> = {
        good: { id: 'good', label: 'G', baseUrl: 'u', model: 'm', key: 'sk-leak', testResult: { status: 'ok' } },
        mismatch: { id: 'other', label: 'M', baseUrl: 'u', model: 'm' },
        badField: { id: 'badField', label: 99, baseUrl: 'u', model: 'm' },
      }
      for (let i = 0; i < MAX_CUSTOM_PROVIDERS + 10; i++) {
        customProviders[`x${i}`] = { id: `x${i}`, label: 'X', baseUrl: 'u', model: 'm' }
      }
      const merged = mergeProvider({ vendor: 'custom', models: {}, baseUrl: '', activeCustomId: null, customProviders }, current())
      expect(merged.customProviders.mismatch).toBeUndefined()
      expect(merged.customProviders.badField).toBeUndefined()
      expect(merged.customProviders.good).toMatchObject({ key: '', testResult: { status: 'idle' } })
      expect(Object.keys(merged.customProviders).length).toBeLessThanOrEqual(MAX_CUSTOM_PROVIDERS)
      expect(JSON.stringify(merged.customProviders)).not.toContain('sk-leak')
    })

    it('merge nulls a dangling activeCustomId (points at a removed entry)', () => {
      const merged = mergeProvider(
        { vendor: 'custom', models: {}, baseUrl: '', activeCustomId: 'ghost', customProviders: {} },
        current(),
      )
      expect(merged.activeCustomId).toBeNull()
    })

    it('merge defaults customProviders to {} when the persisted field is not an object', () => {
      const merged = mergeProvider({ vendor: 'anthropic', models: {}, baseUrl: '', customProviders: 'nope' }, current())
      expect(merged.customProviders).toEqual({})
      expect(merged.activeCustomId).toBeNull()
    })
  })
})
