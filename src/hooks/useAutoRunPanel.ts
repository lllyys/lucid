// Purpose: composes the per-panel auto-run UI state (feature #11, WI-2) for the Translate/Polish
// headers: the toggle value, whether the provider is ready (gates enabling), the hosted-provider cost
// gate, the "armed" flag (auto-fire permitted), and the "paused" state (enabled but unready). The
// debounce TIMER itself is useAutoRunDebounce — this hook owns the PREFERENCE + readiness + cost wiring
// around it so the panel stays thin. Off by default; a hosted provider's first enable routes through the
// cost gate (rule 65), local providers enable directly. The cost gate is re-checked on the LIVE path
// (not just at toggle time): if the active provider is switched to a different hosted vendor that was
// never acked, `armed` drops to false (auto-fire suppressed) and the gate re-opens for that vendor — so
// a vendor switch can never silently start paid auto-runs. `getState()` is read inside callbacks.

import { useEffect, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useAutoRunStore, type AutoRunPanelId } from '@/stores/autoRunStore'
import { presentationFor } from '@/lib/providers/providerPresentation'

export interface AutoRunPanelState {
  /** The panel's persisted toggle value. */
  enabled: boolean
  /** True iff the active provider is ready — the toggle is disabled when false. */
  canEnable: boolean
  /** Auto-fire is permitted: enabled AND the active provider's cost is acked (local needs no ack).
   *  The panel gates `scheduleRun` on this — NOT on `enabled` — so a switch to an unacked hosted vendor
   *  suppresses auto-fire until the cost is acknowledged (rule 65). */
  armed: boolean
  /** Enabled but the provider is no longer ready → show the paused warning (design Section D). */
  paused: boolean
  /** The hosted cost-gate dialog is open (design Section A). */
  costGateOpen: boolean
  /** Request a toggle change. On→hosted-unacked opens the cost gate; otherwise applies immediately. */
  requestToggle: (next: boolean) => void
  /** Accept the cost gate: ack the active vendor + enable. */
  confirmCost: () => void
  /** Decline the cost gate: turn auto-run off for this panel (covers both first-enable and a
   *  vendor-switch re-prompt) so the gate doesn't immediately re-open. */
  cancelCost: () => void
}

export function useAutoRunPanel(panel: AutoRunPanelId): AutoRunPanelState {
  const enabled = useAutoRunStore((s) => s.enabled[panel])
  // Reactive subscriptions so armed/paused/cost-gate react to vendor, key, and ack changes.
  const vendor = useProviderStore((s) => s.vendor)
  const canEnable = useProviderStore((s) => s.isReady())
  const acked = useAutoRunStore((s) => s.costAck[vendor])
  const hosted = !presentationFor(vendor).isLocal
  const [costGateOpen, setCostGateOpen] = useState(false)

  // Enabled + ready, but the active provider is a hosted vendor whose cost was never acked (e.g. the
  // active vendor was switched after auto-run was enabled on a local/acked one): re-prompt the cost gate.
  const needsCostAck = enabled && canEnable && hosted && !acked
  useEffect(() => {
    if (needsCostAck) setCostGateOpen(true)
  }, [needsCostAck])

  const requestToggle = (next: boolean) => {
    if (!next) {
      useAutoRunStore.getState().setEnabled(panel, false)
      setCostGateOpen(false)
      return
    }
    const v = useProviderStore.getState().vendor
    const isHosted = !presentationFor(v).isLocal
    if (isHosted && !useAutoRunStore.getState().costAck[v]) {
      setCostGateOpen(true) // gate the first hosted enable (rule 65)
      return
    }
    useAutoRunStore.getState().setEnabled(panel, true)
  }

  const confirmCost = () => {
    const v = useProviderStore.getState().vendor
    useAutoRunStore.getState().ackCost(v)
    useAutoRunStore.getState().setEnabled(panel, true)
    setCostGateOpen(false)
  }

  const cancelCost = () => {
    // Declining turns the panel off — both for the first-enable gate (was already off) and for a
    // vendor-switch re-prompt (was on); turning it off keeps `needsCostAck` from re-opening the gate.
    useAutoRunStore.getState().setEnabled(panel, false)
    setCostGateOpen(false)
  }

  return {
    enabled,
    canEnable,
    armed: enabled && (!hosted || acked),
    paused: enabled && !canEnable,
    costGateOpen,
    requestToggle,
    confirmCost,
    cancelCost,
  }
}
