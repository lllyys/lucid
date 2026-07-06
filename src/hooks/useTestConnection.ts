// Purpose: drives the Settings "Test connection" affordance (feature #6 — #28). For the VIEWED vendor
// it pre-checks config (remote needs a key, custom needs a base URL), builds the provider via the
// single factory, runs the headless `probeProvider`, and records the per-vendor outcome in
// providerStore.testResults. A `customId` (#10 WI-2) probes ONE specific custom provider by its
// resolved {key, model, baseUrl} from customProviders[id] and records the result ON that custom's
// record (an unknown id is a quiet no-op). createProvider/probeProvider stay PURE — the store is
// resolved here at the call site. Reads config via getState() at call time (no stale closure —
// AGENTS.md). The probe makes a real authenticated call in the app; the key is never logged (§5).

import { useCallback } from 'react'
import { createProvider } from '@/providers'
import { ProviderException, type ProviderConfig, type Vendor } from '@/providers/types'
import { probeProvider } from '@/lib/providers/testConnection'
import { resolveProxyConfig } from '@/lib/providers/proxyRoute'
import { getProxyAllowlist } from '@/lib/providers/proxyAllowlist'
import { useProviderStore, type TestResult } from '@/stores/providerStore'
import { useSyncStore } from '@/stores/syncStore'

export function useTestConnection(): { test: (vendor: Vendor, customId?: string) => Promise<void> } {
  const test = useCallback(async (vendor: Vendor, customId?: string) => {
    const cfg = useProviderStore.getState()
    // The single sink for this run's outcome: a custom-id probe writes onto that custom's record,
    // a built-in probe onto the per-Vendor testResults map.
    const record = (r: TestResult) => useProviderStore.getState().setTestResult(vendor, r, customId)

    let config: ProviderConfig
    if (customId !== undefined) {
      const c = cfg.customProviders[customId]
      if (c === undefined) return // unknown/dangling id — quiet no-op (never crashes, #10)
      if (c.baseUrl.trim() === '') {
        record({ status: 'fail', msgKey: 'settings.testNeedUrl' })
        return
      }
      config = { apiKey: c.key, model: c.model, baseUrl: c.baseUrl }
    } else {
      const key = cfg.apiKeys[vendor]
      // Pre-checks (mirror the design): a remote vendor needs a key; the legacy custom slot a base URL.
      if (vendor !== 'ollama' && vendor !== 'custom' && key.trim() === '') {
        record({ status: 'fail', msgKey: 'settings.testNeedKey' })
        return
      }
      if (vendor === 'custom' && cfg.baseUrl.trim() === '') {
        record({ status: 'fail', msgKey: 'settings.testNeedUrl' })
        return
      }
      config = { apiKey: key, model: cfg.models[vendor], baseUrl: cfg.baseUrl }
    }

    record({ status: 'testing' })
    // #28: Test-connection uses the SAME proxy decision as an actual run (usePanelRun) so a passing
    // test guarantees the run path — relay a token-free single-origin, allow-listed custom provider
    // through the same-origin server, else probe it directly.
    const proxy = resolveProxyConfig({
      vendor,
      baseUrl: config.baseUrl,
      origin: window.location.origin,
      syncConfig: useSyncStore.getState().config,
      allowed: getProxyAllowlist(),
    })
    let provider
    try {
      provider = createProvider(vendor, proxy ? { ...config, proxy } : config)
    } catch (err) {
      const kind = err instanceof ProviderException ? err.providerError.kind : 'unknown'
      record({ status: 'fail', msgKey: `error.${kind}` })
      return
    }
    const res = await probeProvider(provider)
    record(res.ok ? { status: 'ok', latencyMs: res.latencyMs } : { status: 'fail', msgKey: `error.${res.kind}` })
  }, [])
  return { test }
}
