// Purpose: the single source for the provider switcher's display metadata (feature #2,
// WI-7). Maps the Vendor type → an i18n label key, a dot CSS-var token, and the local flag,
// so the switcher neither hardcodes a parallel provider list (rule 65 §2) nor edits the
// out-of-scope model registry. The model string is derived live from resolveModel(vendor)
// in the component (not stored here — one source of truth for model IDs). The design's
// "Google" / "Local" labels resolve to the gemini / ollama vendors.

import type { Vendor } from '@/providers/types'
import { isVendorImplemented } from '@/providers/modelRegistry'

export interface ProviderPresentation {
  vendor: Vendor
  /** i18n key (rule 66 §5), never a literal label. */
  labelKey: string
  /** CSS custom-property name for the menu dot color (rule 30 — no hex). */
  dotToken: string
  /** Drives the "private" badge; the local/Ollama privacy path (rule 65 §6). */
  isLocal: boolean
}

// Record<Vendor, …> is total by construction — presentationFor never misses a vendor.
const BY_VENDOR: Record<Vendor, ProviderPresentation> = {
  anthropic: { vendor: 'anthropic', labelKey: 'provider.anthropic', dotToken: '--warning', isLocal: false },
  openai: { vendor: 'openai', labelKey: 'provider.openai', dotToken: '--warning', isLocal: false },
  gemini: { vendor: 'gemini', labelKey: 'provider.gemini', dotToken: '--warning', isLocal: false },
  ollama: { vendor: 'ollama', labelKey: 'provider.ollama', dotToken: '--success', isLocal: true },
}

export const PROVIDER_PRESENTATION: readonly ProviderPresentation[] = Object.values(BY_VENDOR)

export function presentationFor(vendor: Vendor): ProviderPresentation {
  return BY_VENDOR[vendor]
}

/** Only the vendors the provider layer actually implements (rule 51 — no silent no-op rows). */
export function implementedPresentations(): readonly ProviderPresentation[] {
  return PROVIDER_PRESENTATION.filter((p) => isVendorImplemented(p.vendor))
}
