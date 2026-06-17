import { useEffect, useMemo, useState } from 'react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { ProviderSwitcher } from './ProviderSwitcher'
import { FooterPrivacy } from './FooterPrivacy'
import { WorkspaceToast } from './WorkspaceToast'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { TranslatePanel } from '@/components/translate/TranslatePanel'
import { PolishPanel } from '@/components/polish/PolishPanel'
import { SyncErrorBanner } from '@/components/sync/SyncErrorBanner'
import { createSyncController } from '@/lib/sync/syncController'

/**
 * Top-level workspace layout (feature #2; sidebar added feature #3; sync wired in feature #9, WI-9d) —
 * header on top, then a row of the Sessions/Glossary sidebar + the main column (toolbar with the
 * provider switcher, an inline sync error banner, the Translate panel over the Polish panel), with a
 * provider-aware footer + toast host. The shell owns the single sync controller, the Settings · Sync
 * open state (so the auth/conflict banners can open it), and re-attaches a persisted connection on mount.
 */
export function Workspace() {
  const controller = useMemo(() => createSyncController(), [])
  const [syncSettingsOpen, setSyncSettingsOpen] = useState(false)

  useEffect(() => {
    controller.resume() // re-attach a persisted connection after a reload (no-op when local-only)
  }, [controller])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-color)]">
      <WorkspaceHeader
        controller={controller}
        syncSettingsOpen={syncSettingsOpen}
        onSyncSettingsChange={setSyncSettingsOpen}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col">
          <WorkspaceToolbar>
            <ProviderSwitcher />
          </WorkspaceToolbar>
          <SyncErrorBanner
            onRetry={() => controller.syncNow()}
            onOpenSettings={() => setSyncSettingsOpen(true)}
          />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto">
            <TranslatePanel />
            <PolishPanel />
          </main>
        </div>
      </div>
      <FooterPrivacy />
      <WorkspaceToast />
    </div>
  )
}
