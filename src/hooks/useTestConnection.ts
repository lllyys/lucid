// Purpose: drives the Settings "Test connection" affordance (feature #6 — #28). For the VIEWED vendor
// it pre-checks config (remote needs a key, custom needs a base URL), builds the provider via the
// single factory, runs the headless `probeProvider`, and records the per-vendor outcome in
// providerStore.testResults. Reads config via getState() at call time (no stale closure — AGENTS.md).
// The probe makes a real authenticated call in the app; the key is never logged (rule 65 §5).

import { useCallback } from 'react'
import { createProvider } from '@/providers'
import { ProviderException, type Vendor } from '@/providers/types'
import { probeProvider } from '@/lib/providers/testConnection'
import { useProviderStore } from '@/stores/providerStore'

export function useTestConnection(): { test: (vendor: Vendor) => Promise<void> } {
  const test = useCallback(async (vendor: Vendor) => {
    const cfg = useProviderStore.getState()
    const key = cfg.apiKeys[vendor]
    // Pre-checks (mirror the design): a remote vendor needs a key; custom needs a base URL.
    if (vendor !== 'ollama' && vendor !== 'custom' && key.trim() === '') {
      cfg.setTestResult(vendor, { status: 'fail', msgKey: 'settings.testNeedKey' })
      return
    }
    if (vendor === 'custom' && cfg.baseUrl.trim() === '') {
      cfg.setTestResult(vendor, { status: 'fail', msgKey: 'settings.testNeedUrl' })
      return
    }
    cfg.setTestResult(vendor, { status: 'testing' })
    let provider
    try {
      provider = createProvider(vendor, { apiKey: key, model: cfg.models[vendor], baseUrl: cfg.baseUrl })
    } catch (err) {
      const kind = err instanceof ProviderException ? err.providerError.kind : 'unknown'
      useProviderStore.getState().setTestResult(vendor, { status: 'fail', msgKey: `error.${kind}` })
      return
    }
    const res = await probeProvider(provider)
    useProviderStore
      .getState()
      .setTestResult(
        vendor,
        res.ok ? { status: 'ok', latencyMs: res.latencyMs } : { status: 'fail', msgKey: `error.${res.kind}` },
      )
  }, [])
  return { test }
}
