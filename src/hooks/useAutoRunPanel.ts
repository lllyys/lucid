// Purpose: composes the per-panel auto-run UI state (feature #11, WI-2) for the Translate/Polish
// headers: the toggle value, whether the provider is ready (gates enabling), the hosted-provider cost
// gate, and the "paused" state (enabled but the provider went unready). The debounce TIMER itself is
// useAutoRunDebounce — this hook owns the PREFERENCE + readiness wiring around it so the panel stays
// thin. Off by default; a hosted provider's first enable routes through the cost gate (rule 65),
// local providers enable directly. `getState()` is read inside callbacks (no stale closure).

import { useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useAutoRunStore, type AutoRunPanelId } from '@/stores/autoRunStore'
import { presentationFor } from '@/lib/providers/providerPresentation'

export interface AutoRunPanelState {
  /** The panel's persisted toggle value. */
  enabled: boolean
  /** True iff the active provider is ready — the toggle is disabled when false. */
  canEnable: boolean
  /** Enabled but the provider is no longer ready → show the paused warning (design Section D). */
  paused: boolean
  /** The hosted cost-gate dialog is open (design Section A). */
  costGateOpen: boolean
  /** Request a toggle change. On→hosted-unacked opens the cost gate; otherwise applies immediately. */
  requestToggle: (next: boolean) => void
  /** Accept the cost gate: ack the vendor + enable. */
  confirmCost: () => void
  /** Dismiss the cost gate without enabling. */
  cancelCost: () => void
}

export function useAutoRunPanel(panel: AutoRunPanelId): AutoRunPanelState {
  const enabled = useAutoRunStore((s) => s.enabled[panel])
  // Selector recomputes on every provider-store change, so readiness reacts to key/vendor edits.
  const canEnable = useProviderStore((s) => s.isReady())
  const [costGateOpen, setCostGateOpen] = useState(false)

  const requestToggle = (next: boolean) => {
    if (!next) {
      useAutoRunStore.getState().setEnabled(panel, false)
      setCostGateOpen(false)
      return
    }
    const { vendor } = useProviderStore.getState()
    const hosted = !presentationFor(vendor).isLocal
    const acked = useAutoRunStore.getState().costAck[vendor]
    if (hosted && !acked) {
      setCostGateOpen(true) // gate the first hosted enable (rule 65)
      return
    }
    useAutoRunStore.getState().setEnabled(panel, true)
  }

  const confirmCost = () => {
    const { vendor } = useProviderStore.getState()
    useAutoRunStore.getState().ackCost(vendor)
    useAutoRunStore.getState().setEnabled(panel, true)
    setCostGateOpen(false)
  }

  const cancelCost = () => setCostGateOpen(false)

  return {
    enabled,
    canEnable,
    paused: enabled && !canEnable,
    costGateOpen,
    requestToggle,
    confirmCost,
    cancelCost,
  }
}
