// Purpose: the credential-change coordinator (feature #4, WI-1 — #13, plan v4 §2). Changing or
// clearing the API key must not leave a request running on a stale credential, and a new key must
// clear any panel left rejected with `invalidKey`. This is the ONE place that couples the config
// store (the key) to the operation store (the panels) — providerStore itself stays operation-free
// (rule 65 §1). Reads both stores via getState() so there is no captured/stale state (v4 note).

import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore, type PanelId } from '@/stores/operationStore'

const PANELS: readonly PanelId[] = ['translate', 'polish', 'draftTranslate']

/**
 * Apply a credential change. If `nextKey` differs from the stored key: abort any panel mid-stream
 * (so no stream continues on the old credential) and reset any panel sitting in an `invalidKey`
 * error (so the rejected state clears), THEN write the key (`clearKey` for empty, else `setApiKey`).
 * An unchanged key is a no-op — idle/done panels are never disturbed.
 */
export function applyKeyChange(nextKey: string): void {
  const provider = useProviderStore.getState()
  if (provider.apiKey === nextKey) return // unchanged → touch nothing

  const ops = useOperationStore.getState()
  for (const panel of PANELS) {
    const op = ops[panel]
    if (op.status === 'streaming') ops.abort(panel)
    else if (op.status === 'error' && op.error.kind === 'invalidKey') ops.reset(panel)
  }

  if (nextKey === '') provider.clearKey()
  else provider.setApiKey(nextKey)
}
