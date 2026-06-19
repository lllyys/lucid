import { describe, it, expect } from 'vitest'
import {
  PROVIDER_PRESENTATION,
  presentationFor,
  implementedPresentations,
  configurablePresentations,
  activePresentation,
  type PresentationState,
} from './providerPresentation'
import type { Vendor } from '@/providers/types'

// A minimal state slice matching the presentation functions' structural input (#10 WI-2).
function makeState(over: Partial<PresentationState> = {}): PresentationState {
  return { vendor: 'anthropic', activeCustomId: null, customProviders: {}, ...over }
}
function customEntry(over: Partial<PresentationState['customProviders'][string]> = {}) {
  return {
    id: 'c1',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter/v1',
    model: 'gpt-4o',
    key: '',
    testResult: { status: 'idle' as const },
    ...over,
  }
}

describe('providerPresentation', () => {
  it('has an entry for every Vendor, keyed by a valid vendor', () => {
    const vendors: Vendor[] = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']
    for (const v of vendors) expect(presentationFor(v).vendor).toBe(v)
    expect(PROVIDER_PRESENTATION).toHaveLength(vendors.length)
  })

  it('excludes custom from the switcher list until its config UI ships (#29), though it has a presentation entry', () => {
    expect(presentationFor('custom').vendor).toBe('custom')
    expect(implementedPresentations().map((p) => p.vendor)).not.toContain('custom')
  })

  it('maps the design "google" to the gemini vendor (there is no google vendor)', () => {
    expect(PROVIDER_PRESENTATION.some((p) => p.vendor === 'gemini')).toBe(true)
    expect(PROVIDER_PRESENTATION.some((p) => (p.vendor as string) === 'google')).toBe(false)
  })

  it('marks only ollama as the local (private) provider', () => {
    for (const p of PROVIDER_PRESENTATION) expect(p.isLocal).toBe(p.vendor === 'ollama')
  })

  it('uses i18n label keys, not literal labels (rule 66 §5)', () => {
    for (const p of PROVIDER_PRESENTATION) expect(p.labelKey).toMatch(/^provider\./)
  })

  it('uses a CSS-var dot token (no hardcoded hex — rule 30)', () => {
    for (const p of PROVIDER_PRESENTATION) expect(p.dotToken).toMatch(/^--/)
  })

  it('implementedPresentations returns the four named vendors (custom excluded — switcher list)', () => {
    expect(implementedPresentations().map((p) => p.vendor)).toEqual(['anthropic', 'openai', 'gemini', 'ollama'])
  })

  it('configurablePresentations() with no state keeps the legacy static rail (incl. the custom placeholder)', () => {
    expect(configurablePresentations().map((p) => p.vendor)).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'custom',
    ])
  })

  describe('state-aware configurablePresentations(state) (#10 WI-2)', () => {
    it('enumerates the built-ins (no static custom placeholder) + one presentation per custom provider', () => {
      const state = makeState({
        customProviders: {
          c1: customEntry({ id: 'c1', label: 'OpenRouter', model: 'gpt-4o' }),
          c2: customEntry({ id: 'c2', label: 'Together', model: 'mixtral' }),
        },
      })
      const rows = configurablePresentations(state)
      const builtins = rows.filter((p) => p.customId === undefined).map((p) => p.vendor)
      expect(builtins).toEqual(['anthropic', 'openai', 'gemini', 'ollama']) // static 'custom' dropped
      const customs = rows.filter((p) => p.customId !== undefined)
      expect(customs.map((p) => p.customId)).toEqual(['c1', 'c2'])
      expect(customs.map((p) => p.label)).toEqual(['OpenRouter', 'Together'])
      expect(customs.map((p) => p.model)).toEqual(['gpt-4o', 'mixtral'])
      for (const c of customs) expect(c.vendor).toBe('custom')
    })

    it('derives the custom dot token from its testResult status (ok→success, fail→warn/needs-key, testing→accent, idle→neutral)', () => {
      const state = makeState({
        customProviders: {
          c1: customEntry({ id: 'c1', testResult: { status: 'ok', latencyMs: 5 } }),
          c2: customEntry({ id: 'c2', testResult: { status: 'fail', msgKey: 'error.invalidKey' } }),
          c3: customEntry({ id: 'c3', testResult: { status: 'testing' } }),
          c4: customEntry({ id: 'c4', testResult: { status: 'idle' } }),
        },
      })
      const byId = new Map(configurablePresentations(state).filter((p) => p.customId).map((p) => [p.customId, p.dotToken]))
      expect(byId.get('c1')).toBe('--success')
      expect(byId.get('c2')).toBe('--warning') // fail → "needs key"/401 → the design's --warn dot
      expect(byId.get('c3')).toBe('--accent-primary') // testing → the design's accent
      expect(byId.get('c4')).toBe('--text-tertiary')
    })

    it('emits no custom rows when there are no custom providers', () => {
      const rows = configurablePresentations(makeState())
      expect(rows.every((p) => p.customId === undefined)).toBe(true)
      expect(rows.map((p) => p.vendor)).toEqual(['anthropic', 'openai', 'gemini', 'ollama'])
    })
  })

  describe('activePresentation(state) (#10 WI-2)', () => {
    it('returns the static BY_VENDOR presentation for an active built-in vendor', () => {
      expect(activePresentation(makeState({ vendor: 'openai' }))).toEqual(presentationFor('openai'))
    })

    it('returns the ACTIVE custom\'s own label/model/dot/customId — not the static custom presentation', () => {
      const state = makeState({
        vendor: 'custom',
        activeCustomId: 'c1',
        customProviders: { c1: customEntry({ id: 'c1', label: 'OpenRouter', model: 'gpt-4o', testResult: { status: 'ok' } }) },
      })
      const p = activePresentation(state)
      expect(p.customId).toBe('c1')
      expect(p.label).toBe('OpenRouter')
      expect(p.model).toBe('gpt-4o')
      expect(p.dotToken).toBe('--success')
      expect(p.vendor).toBe('custom')
      expect(p).not.toEqual(presentationFor('custom')) // NOT the static placeholder
    })

    it('falls back to the static custom presentation when vendor=custom but the active id is dangling', () => {
      expect(activePresentation(makeState({ vendor: 'custom', activeCustomId: 'ghost' }))).toEqual(
        presentationFor('custom'),
      )
      expect(activePresentation(makeState({ vendor: 'custom', activeCustomId: null }))).toEqual(
        presentationFor('custom'),
      )
    })
  })
})
