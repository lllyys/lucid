import { describe, it, expect, beforeEach } from 'vitest'
import { useProviderStore } from './providerStore'

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

  it('setVendor atomically resets the model to the vendor default', () => {
    useProviderStore.getState().setModel('claude-opus-4-8')
    expect(useProviderStore.getState().model).toBe('claude-opus-4-8')
    useProviderStore.getState().setVendor('anthropic')
    expect(useProviderStore.getState().model).toBe('claude-fable-5')
  })

  it('refuses to switch to an unimplemented vendor (state unchanged)', () => {
    useProviderStore.getState().setApiKey('sk-test')
    for (const vendor of ['openai', 'gemini', 'ollama'] as const) {
      useProviderStore.getState().setVendor(vendor)
      expect(useProviderStore.getState().vendor).toBe('anthropic')
      expect(useProviderStore.getState().model).toBe('claude-fable-5')
    }
  })

  it('rapid repeated switching converges (refused switches are no-ops)', () => {
    const { setVendor } = useProviderStore.getState()
    setVendor('openai')
    setVendor('gemini')
    setVendor('anthropic')
    setVendor('ollama')
    expect(useProviderStore.getState().vendor).toBe('anthropic')
  })

  it('isReady() is false if the active vendor is somehow not implemented', () => {
    // Defense-in-depth: even if state is forced to an unimplemented vendor.
    useProviderStore.setState({ vendor: 'openai', apiKey: 'sk-test' })
    expect(useProviderStore.getState().isReady()).toBe(false)
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
    it('isReady for custom needs key + baseUrl + model', () => {
      const s = useProviderStore.getState()
      s.setVendor('custom')
      s.setApiKey('sk-test')
      expect(useProviderStore.getState().isReady()).toBe(false) // no baseUrl/model
      useProviderStore.getState().setBaseUrl('https://x/v1')
      expect(useProviderStore.getState().isReady()).toBe(false) // still no model
      useProviderStore.getState().setModel('my-model')
      expect(useProviderStore.getState().isReady()).toBe(true)
    })
  })
})
