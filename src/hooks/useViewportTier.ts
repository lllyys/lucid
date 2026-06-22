import { useSyncExternalStore } from 'react'

/**
 * Responsive viewport tier (feature #16) — the single source of truth for the workspace reflow.
 * Three tiers keyed off the design's custom breakpoints (NOT Tailwind defaults): phone `< 600`,
 * tablet `600 ≤ w < 960`, desktop `≥ 960`.
 *
 * The tier is computed SYNCHRONOUSLY during render (useSyncExternalStore's getSnapshot reads
 * matchMedia) so the first paint already matches the real viewport — no desktop→phone flash. It
 * DEFAULTS to `desktop` whenever matchMedia is unavailable or reports no match (the jsdom test
 * default) — load-bearing for no-regression: existing desktop-only tests stay green under jsdom.
 */
export type ViewportTier = 'desktop' | 'tablet' | 'phone'

const TABLET_QUERY = '(min-width: 600px)'
const DESKTOP_QUERY = '(min-width: 960px)'
// `(min-width: 0px)` is a tautology — a working matchMedia ALWAYS matches it. The jsdom global stub
// returns matches:false for every query (a no-op), so a false here means matchMedia can't drive the
// tier; we then default to desktop (no-regression: existing desktop-only tests stay green under jsdom).
const PROBE_QUERY = '(min-width: 0px)'

function tierFromMatchMedia(): ViewportTier {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  if (!window.matchMedia(PROBE_QUERY).matches) return 'desktop'
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'phone'
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const lists = [window.matchMedia(TABLET_QUERY), window.matchMedia(DESKTOP_QUERY)]
  for (const list of lists) list.addEventListener('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
  }
}

export function useViewportTier(): ViewportTier {
  // getServerSnapshot mirrors getSnapshot — both default to desktop when matchMedia is absent.
  return useSyncExternalStore(subscribe, tierFromMatchMedia, tierFromMatchMedia)
}
