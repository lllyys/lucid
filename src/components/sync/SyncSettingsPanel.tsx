// Purpose: the Settings · Sync panel composition (#9, WI-9c; #19 WI-3 simplification). Composes the toggle
// card, the connected panel, the disconnect dialog, and the conflict card; reads the syncStore via selectors
// (AGENTS.md — never destructure) and drives the injected SyncController. Local-only → SyncToggleCard: the
// on/off switch calls controller.connectSingleOrigin() (token-free, this origin), and its Advanced disclosure
// reveals the EXISTING ConnectForm whose submit calls controller.connect() (remote/cross-origin path).
// Connected → ConnectedPanel wired to syncNow/retry → controller; the ON toggle + the "Turn off" buttons open
// the dialog whose confirm awaits controller.disconnect({ erase }); a failed erase surfaces the EXISTING
// Sonner toast (no invented surface — rule 51). Conflict "Details" reveals the ConflictCard; Edit / Update
// token re-show the ConnectForm prefilled with the current config (remote only) so a new token can be pasted
// and re-connected. Every string via t() (rule 66 §5).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSyncStore, type SyncConfig } from '@/stores/syncStore'
import type { SyncController } from '@/lib/sync/syncController'
import { ConnectForm } from './ConnectForm'
import { SyncToggleCard } from './SyncToggleCard'
import { ConnectedPanel } from './ConnectedPanel'
import { DisconnectDialog } from './DisconnectDialog'
import { ConflictCard } from './ConflictCard'

/** The served origin the single-origin switch targets (matches store.connectSingleOrigin). */
const servedOrigin = (): string => (typeof window !== 'undefined' ? window.location.origin : '')

export interface SyncSettingsPanelProps {
  controller: SyncController
}

export function SyncSettingsPanel({ controller }: SyncSettingsPanelProps) {
  const { t } = useTranslation()
  const status = useSyncStore((s) => s.status)
  const config = useSyncStore((s) => s.config)
  const counts = useSyncStore((s) => s.counts)
  const queuedCount = useSyncStore((s) => s.queuedCount)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const lastConflict = useSyncStore((s) => s.lastConflict)

  // `editing` forces the ConnectForm back into view on a connected session (Edit / Update token) so the
  // user can paste a new token and re-connect. `showConflict` reveals the ConflictCard.
  const [editing, setEditing] = useState<SyncConfig | null>(null)
  const [showConflict, setShowConflict] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [eraseIntent, setEraseIntent] = useState(false) // which zone button opened the dialog → pre-selection

  const isLocalOnly = config === null

  const onConnect = (next: SyncConfig) => {
    setEditing(null)
    controller.connect(next)
  }

  // An explicit Edit/Update-token re-entry (remote only) → the connect form prefilled with the current
  // config so a new token can be pasted and re-connected.
  if (editing) {
    return <ConnectForm onConnect={onConnect} onStayLocal={() => setEditing(null)} initialConfig={editing} />
  }

  // Local-only (sync off) → the simplified on/off toggle card. The switch turns sync ON token-free against
  // this origin; the Advanced disclosure reveals the ConnectForm for a cross-origin remote server.
  if (isLocalOnly) {
    return <SyncToggleCard origin={servedOrigin()} onTurnOn={() => controller.connectSingleOrigin()} onConnect={onConnect} />
  }

  // Connecting → the connect flow's progress card (design surface B), shown after connect() sets the
  // config + 'connecting' status and before the first cycle flips to syncing/idle. Cancel reverts to
  // local-only WITHOUT erasing (nothing has synced yet, so there is nothing to purge).
  if (status === 'connecting') {
    return (
      <ConnectForm
        connecting
        serverUrl={config.serverUrl}
        onConnect={onConnect}
        onCancel={() => void controller.disconnect({ erase: false })}
      />
    )
  }

  const onConfirmDisconnect = async (erase: boolean) => {
    setDisconnectOpen(false)
    const ok = await controller.disconnect({ erase })
    if (erase && !ok) toast.error(t('sync.disconnect.eraseFailed'))
  }

  const onShowConflict = () => setShowConflict(true)

  return (
    <div className="flex flex-col gap-4">
      <ConnectedPanel
        config={config}
        counts={counts}
        status={status}
        lastSyncedAt={lastSyncedAt}
        queuedCount={queuedCount}
        onSyncNow={() => controller.syncNow()}
        onRetry={() => controller.syncNow()}
        onShowConflict={onShowConflict}
        onUpdateToken={() => setEditing(config)}
        onEdit={() => setEditing(config)}
        onTurnOff={() => {
          setEraseIntent(false) // toggling off defaults to "keep server data"
          setDisconnectOpen(true)
        }}
        onDisconnect={(erase) => {
          setEraseIntent(erase)
          setDisconnectOpen(true)
        }}
      />

      {/* Surface-C reassurance notes (kept beside the panel in the design; stack below in the dialog). */}
      <div className="flex flex-col gap-[9px]">
        <div className="flex items-start gap-[9px] rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-color)] p-[13px_15px]">
          <span aria-hidden className="mt-px shrink-0 text-[13px] text-[var(--success)]">🔒</span>
          <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">{t('sync.panel.localKeptNote')}</span>
        </div>
        <div className="flex items-start gap-[9px] rounded-[12px] border border-dashed border-[var(--border-dashed)] bg-[var(--bg-canvas)] p-[13px_15px]">
          <span aria-hidden className="mt-px shrink-0 font-mono text-[11px] text-[var(--accent-ink)]">i</span>
          <span className="font-mono text-[10px] leading-[1.65] text-[var(--text-tertiary)]">{t('sync.panel.revAuthorityNote')}</span>
        </div>
      </div>

      {showConflict && lastConflict && (
        <ConflictCard
          conflict={lastConflict}
          onDismiss={() => {
            useSyncStore.getState().recordConflict(null)
            setShowConflict(false)
          }}
        />
      )}

      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        serverUrl={config.serverUrl}
        initialErase={eraseIntent}
        onConfirm={(erase) => void onConfirmDisconnect(erase)}
      />
    </div>
  )
}
