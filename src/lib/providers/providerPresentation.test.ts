import { describe, it, expect } from 'vitest'
import {
  PROVIDER_PRESENTATION,
  presentationFor,
  implementedPresentations,
  configurablePresentations,
} from './providerPresentation'
import type { Vendor } from '@/providers/types'

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

  it('configurablePresentations includes custom (Settings rail — custom is configured there, #5/#7/#29)', () => {
    expect(configurablePresentations().map((p) => p.vendor)).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'custom',
    ])
  })
})
