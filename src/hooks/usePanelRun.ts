import { useCallback } from 'react'
import { createProvider } from '@/providers'
import { ProviderException, type LLMRequest } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'
import { useProviderStore, activeTarget } from '@/stores/providerStore'
import { useOperationStore, type PanelId } from '@/stores/operationStore'

/**
 * Glue hook (feature #2, WI-7): builds the active LLMProvider from the provider config store
 * and drives a panel's run on the operationStore. The UI never touches a vendor directly
 * (rule 65 §1). The effective ProviderConfig comes from `activeTarget(state)` (#10 WI-2): an
 * active custom provider contributes its own key/model/baseUrl from customProviders[activeCustomId],
 * a built-in the denormalized mirror — so RUN and isReady() resolve the same target. A not-ready
 * config or a createProvider failure (missing key / unimplemented vendor) is mapped to the panel's
 * normalized error state via fail() rather than thrown. createProvider stays PURE; the store is
 * resolved at this call site. `getState()` is read inside the callbacks (no stale closure — AGENTS.md).
 */
export function usePanelRun(): {
  run: (panel: PanelId, request: LLMRequest, isAuto?: boolean) => void
  abort: (panel: PanelId) => void
} {
  const run = useCallback((panel: PanelId, request: LLMRequest, isAuto = false) => {
    const cfg = useProviderStore.getState()
    const ops = useOperationStore.getState()
    if (!cfg.isReady()) {
      ops.fail(panel, makeProviderError('invalidKey'))
      return
    }
    let provider
    try {
      // Resolve the EFFECTIVE config for the active target (#10 WI-2): an active custom contributes
      // ITS OWN key/model/baseUrl (from customProviders[activeCustomId]), a built-in the mirror. So
      // RUN and isReady() read the same model. baseUrl is required by the custom provider and
      // harmlessly ignored by the named vendors (their endpoints are fixed in the factory).
      provider = createProvider(cfg.vendor, activeTarget(cfg))
    } catch (err) {
      ops.fail(panel, err instanceof ProviderException ? err.providerError : makeProviderError('unknown'))
      return
    }
    void ops.run(panel, request, provider, isAuto)
  }, [])

  const abort = useCallback((panel: PanelId) => {
    useOperationStore.getState().abort(panel)
  }, [])

  return { run, abort }
}
