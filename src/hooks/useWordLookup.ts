import { useCallback } from 'react'
import { createProvider } from '@/providers'
import { ProviderException } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'
import { useProviderStore, activeTarget } from '@/stores/providerStore'
import { useLookupStore, type LookupPayload } from '@/stores/lookupStore'

/**
 * Glue hook (feature #20): builds the active LLMProvider from the provider config store and
 * drives the single word-lookup on the lookupStore. Modeled on usePanelRun — the UI never
 * touches a vendor directly (rule 65 §1). A not-ready config or a createProvider failure is
 * mapped to the lookup's error state (the popover shows the localized error) rather than thrown.
 * createProvider stays PURE; the store is resolved at this call site; getState() is read inside
 * the callback (no stale closure — AGENTS.md). The lookupStore owns the run loop (streamOp,
 * runId stale-guard, done-unparseable→error mapping).
 */
export function useWordLookup(): {
  lookup: (payload: LookupPayload) => void
  close: () => void
} {
  const lookup = useCallback((payload: LookupPayload) => {
    const cfg = useProviderStore.getState()
    const store = useLookupStore.getState()
    if (!cfg.isReady()) {
      store.close()
      useLookupStore.setState({
        status: 'error',
        error: makeProviderError('invalidKey'),
        open: true,
        owner: payload.owner, // stamp the clicked host so the error opens there, not a stale owner
      })
      return
    }
    let provider
    try {
      provider = createProvider(cfg.vendor, activeTarget(cfg))
    } catch (err) {
      store.close()
      useLookupStore.setState({
        status: 'error',
        error: err instanceof ProviderException ? err.providerError : makeProviderError('unknown'),
        open: true,
        owner: payload.owner, // stamp the clicked host (gating keys on open && owner === id)
      })
      return
    }
    void store.lookup(payload, provider)
  }, [])

  const close = useCallback(() => {
    useLookupStore.getState().close()
  }, [])

  return { lookup, close }
}
