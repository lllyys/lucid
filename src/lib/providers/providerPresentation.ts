// Purpose: the single source for the provider switcher's display metadata (feature #2,
// WI-7). Maps the Vendor type → an i18n label key, a dot CSS-var token, and the local flag,
// so the switcher neither hardcodes a parallel provider list (rule 65 §2) nor edits the
// out-of-scope model registry. The model string is derived live from resolveModel(vendor)
// in the component (not stored here — one source of truth for model IDs). The design's
// "Google" / "Local" labels resolve to the gemini / ollama vendors.
// The N user-defined custom providers (#10) each get their OWN presentation: a literal `label`,
// a `dotToken` derived from their connection-test status, their `model`, and a `customId`.
// `configurablePresentations(state)` enumerates the built-ins + the customs; `activePresentation`
// resolves the presentation for the active target (an active custom carries its own label/dot/model).

import type { Vendor } from '@/providers/types'
import { isVendorImplemented } from '@/providers/modelRegistry'

export interface ProviderPresentation {
  vendor: Vendor
  /** i18n key (rule 66 §5), never a literal label. Built-ins carry this; customs use `label`. */
  labelKey: string
  /** CSS custom-property name for the menu dot color (rule 30 — no hex). */
  dotToken: string
  /** Drives the "private" badge; the local/Ollama privacy path (rule 65 §6). */
  isLocal: boolean
  /** Set for a custom provider (#10): names which custom this presentation describes. */
  customId?: string
  /** A custom provider's user-chosen literal label (#10); built-ins use `labelKey` via t(). */
  label?: string
  /** A custom provider's selected model (#10); shown as its sub-label in the rail/switcher. */
  model?: string
}

/** The connection-test status of one custom provider (#10) — mirrors providerStore's TestResult. */
export type CustomTestStatus = 'idle' | 'testing' | 'ok' | 'fail'

/**
 * The minimal state slice the presentation resolvers read (#10 WI-2). A structural shape, not an
 * import of the store, so `src/lib/providers` stays decoupled from `src/stores` (no cycle). The
 * `testResult` shape is structurally compatible with providerStore's `TestResult` (extra
 * `latencyMs`/`msgKey` are allowed but unused here — only `status` drives the dot).
 */
export interface PresentationState {
  vendor: Vendor
  activeCustomId: string | null
  customProviders: Record<
    string,
    {
      id: string
      label: string
      model: string
      testResult: { status: CustomTestStatus; latencyMs?: number; msgKey?: string }
    }
  >
}

/** A custom provider's connection-test status → the dot CSS-var token (rule 30 — no hex). */
const CUSTOM_DOT_TOKEN: Record<CustomTestStatus, string> = {
  ok: '--success',
  fail: '--warning', // the design's needs-key/401 dot — `fail` resolves to the "needs key" label (warn-colored)
  testing: '--accent-primary',
  idle: '--text-tertiary',
}

/** The dot CSS-var token for a custom provider's connection-test status — the SINGLE source the switcher
 *  (via the presentation's `dotToken`) and the Settings rail both consume, so they can't drift apart. */
export function customDotToken(status: CustomTestStatus): string {
  return CUSTOM_DOT_TOKEN[status]
}

/** Build the presentation for ONE custom provider from its store entry (#10). */
function customPresentation(c: PresentationState['customProviders'][string]): ProviderPresentation {
  return {
    vendor: 'custom',
    labelKey: 'provider.custom',
    dotToken: CUSTOM_DOT_TOKEN[c.testResult.status],
    isLocal: false,
    customId: c.id,
    label: c.label,
    model: c.model,
  }
}

// Record<Vendor, …> is total by construction — presentationFor never misses a vendor.
const BY_VENDOR: Record<Vendor, ProviderPresentation> = {
  anthropic: { vendor: 'anthropic', labelKey: 'provider.anthropic', dotToken: '--warning', isLocal: false },
  openai: { vendor: 'openai', labelKey: 'provider.openai', dotToken: '--warning', isLocal: false },
  gemini: { vendor: 'gemini', labelKey: 'provider.gemini', dotToken: '--warning', isLocal: false },
  ollama: { vendor: 'ollama', labelKey: 'provider.ollama', dotToken: '--success', isLocal: true },
  custom: { vendor: 'custom', labelKey: 'provider.custom', dotToken: '--accent-ink', isLocal: false },
}

export const PROVIDER_PRESENTATION: readonly ProviderPresentation[] = Object.values(BY_VENDOR)

export function presentationFor(vendor: Vendor): ProviderPresentation {
  return BY_VENDOR[vendor]
}

/**
 * Vendors the toolbar SWITCHER offers (rule 51 — no silent no-op rows). `custom` (#7) is implemented
 * but excluded here: it has no fixed model and needs a base URL, so it is configured in Settings, not
 * picked from the toolbar. Use `configurablePresentations()` for the Settings rail.
 */
export function implementedPresentations(): readonly ProviderPresentation[] {
  return PROVIDER_PRESENTATION.filter((p) => isVendorImplemented(p.vendor) && p.vendor !== 'custom')
}

/**
 * The Settings provider rail's rows. Two modes:
 * - **No state (legacy):** every IMPLEMENTED vendor, INCLUDING the static `custom` placeholder
 *   (#5/#7/#29). Kept for the not-yet-rewired Settings rail (#10 WI-3 replaces this call).
 * - **State-aware (#10 WI-2):** the implemented BUILT-INS (the static `custom` placeholder is
 *   dropped) followed by ONE presentation per user-defined custom provider, each carrying its own
 *   label/dot/model/customId. The switcher list comes from `implementedPresentations()` (no custom).
 */
export function configurablePresentations(state?: PresentationState): readonly ProviderPresentation[] {
  if (state === undefined) return PROVIDER_PRESENTATION.filter((p) => isVendorImplemented(p.vendor))
  const builtins = PROVIDER_PRESENTATION.filter((p) => isVendorImplemented(p.vendor) && p.vendor !== 'custom')
  const customs = Object.values(state.customProviders).map(customPresentation)
  return [...builtins, ...customs]
}

/**
 * The presentation for the ACTIVE target (#10 WI-2). For an active custom it is THAT custom's own
 * label/dot/model/customId (NOT the static `BY_VENDOR.custom`), so the switcher trigger + settings
 * header show the right provider. A built-in (or a dangling/absent active custom) → the static
 * `presentationFor(vendor)`. `presentationFor` itself stays total over `Vendor` (unchanged).
 */
export function activePresentation(state: PresentationState): ProviderPresentation {
  if (state.vendor === 'custom') {
    const c = state.activeCustomId ? state.customProviders[state.activeCustomId] : undefined
    if (c !== undefined) return customPresentation(c)
  }
  return presentationFor(state.vendor)
}
