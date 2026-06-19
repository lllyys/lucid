// Purpose: the E2E config-sync startup gate (#15 WI-6, the FINAL WI; design Sections A–D). Owns ONE
// ConfigSyncController instance, calls init() on mount + dispose() on unmount, and renders the right
// blocking card over a dimmed workspace per `useConfigSyncStore.status` (read via a selector — AGENTS.md,
// never destructure). `unlocked` | `localOnly` → render the children (the live workspace); `checking` →
// quiet (nothing yet). Each control maps to a controller action (set → setPassphrase; unlock → unlock;
// noConfig Set/Local → reveal set-card / workLocalOnly; transport error Retry → retry()). SECURITY
// (rule 65 §5): the passphrase is owned by the card's local state and handed to the controller verbatim;
// the gate never logs/persists it. Tokens + t() only (rules 30/31/66 §5; rule 51 — design-faithful).

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createConfigSyncController, useConfigSyncStore, type ConfigSyncController } from '@/lib/config/configSyncController'
import { UnlockCard } from './UnlockCard'
import { SetPassphraseCard } from './SetPassphraseCard'
import { InsecureContextCard } from './InsecureContextCard'
import { NoConfigCard } from './NoConfigCard'
import { ConfigSyncBanner } from './ConfigSyncBanner'

export interface ConfigSyncGateProps {
  children: ReactNode
  /** Injectable for tests; defaults to the real same-origin controller. */
  controller?: ConfigSyncController
}

/** A scrim + centered card over a dimmed, not-yet-hydrated workspace (design Section A framing). The
 *  scrim is derived from the warm-ink text token (matching the design's ink-derived shadow scrim) so it
 *  dims correctly in both themes without a hardcoded color (rule 30/34). */
function GateOverlay({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto p-6 backdrop-blur-[2px]"
      style={{ background: 'color-mix(in srgb, var(--text-color) 18%, transparent)' }}
    >
      {children}
    </div>
  )
}

export function ConfigSyncGate({ children, controller: injected }: ConfigSyncGateProps) {
  const controller = useMemo(() => injected ?? createConfigSyncController(), [injected])
  const status = useConfigSyncStore((s) => s.status)
  const error = useConfigSyncStore((s) => s.error)
  // noConfig has a sub-state: the user clicked "Set a passphrase" → show the set-passphrase card.
  const [settingPassphrase, setSettingPassphrase] = useState(false)

  useEffect(() => {
    void controller.init()
    return () => controller.dispose()
  }, [controller])

  // The workspace is live once unlocked or explicitly local-only. The Section-E banner sits above it,
  // driven by the NON-blocking `syncError` (a background save failure); its retry re-runs the save.
  if (status === 'unlocked' || status === 'localOnly') {
    return (
      <>
        <ConfigSyncBanner onRetry={() => void controller.retrySync()} />
        {children}
      </>
    )
  }

  // While probing, show nothing (a quiet loading state — the workspace is not yet adopted).
  if (status === 'checking') return null

  let card: ReactNode
  if (status === 'insecure') {
    card = <InsecureContextCard />
  } else if (status === 'noConfig') {
    card = settingPassphrase ? (
      <SetPassphraseCard controller={controller} />
    ) : (
      <NoConfigCard controller={controller} onSetPassphrase={() => setSettingPassphrase(true)} />
    )
  } else {
    // locked | error → the unlock card, which renders its own Section-C error variants from `error`.
    card = <UnlockCard controller={controller} error={error} />
  }

  return <GateOverlay>{card}</GateOverlay>
}
