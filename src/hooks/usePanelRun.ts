import { useCallback } from 'react'
import { createProvider } from '@/providers'
import { ProviderException, type LLMRequest } from '@/providers/types'
import { makeProviderError } from '@/providers/errors'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore, type PanelId } from '@/stores/operationStore'

/**
 * Glue hook (feature #2, WI-7): builds the active LLMProvider from the provider config store
 * and drives a panel's run on the operationStore. The UI never touches a vendor directly
 * (rule 65 §1). A not-ready config or a createProvider failure (missing key / unimplemented
 * vendor) is mapped to the panel's normalized error state via fail() rather than thrown.
 * `getState()` is read inside the callbacks (no stale closure — AGENTS.md store convention).
 */
export function usePanelRun(): {
  run: (panel: PanelId, request: LLMRequest) => void
  abort: (panel: PanelId) => void
} {
  const run = useCallback((panel: PanelId, request: LLMRequest) => {
    const cfg = useProviderStore.getState()
    const ops = useOperationStore.getState()
    if (!cfg.isReady()) {
      ops.fail(panel, makeProviderError('invalidKey'))
      return
    }
    let provider
    try {
      provider = createProvider(cfg.vendor, { apiKey: cfg.apiKey, model: cfg.model })
    } catch (err) {
      ops.fail(panel, err instanceof ProviderException ? err.providerError : makeProviderError('unknown'))
      return
    }
    void ops.run(panel, request, provider)
  }, [])

  const abort = useCallback((panel: PanelId) => {
    useOperationStore.getState().abort(panel)
  }, [])

  return { run, abort }
}
