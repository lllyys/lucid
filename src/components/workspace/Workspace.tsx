import { useEffect, useMemo, useState } from 'react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { ProviderSwitcher } from './ProviderSwitcher'
import { FooterPrivacy } from './FooterPrivacy'
import { WorkspaceToast } from './WorkspaceToast'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SidebarDrawer } from '@/components/sidebar/SidebarDrawer'
import { TranslatePanel } from '@/components/translate/TranslatePanel'
import { PolishPanel } from '@/components/polish/PolishPanel'
import { SyncErrorBanner } from '@/components/sync/SyncErrorBanner'
import { createSyncController } from '@/lib/sync/syncController'
import { useViewportTier } from '@/hooks/useViewportTier'

/**
 * Top-level workspace layout (feature #2; sidebar added feature #3; sync wired in feature #9, WI-9d;
 * responsive reflow feature #16) — the reflow orchestrator. Reads `useViewportTier()` (desktop /
 * tablet / phone) and adapts:
 *  - desktop (≥960): unchanged — inline Sidebar + the Translate panel stacked over the Polish panel.
 *  - tablet/phone (<960): the Sidebar moves into an off-canvas SidebarDrawer (Sheet); the ☰ hamburger
 *    lives in the compact header.
 * The shell owns the single sync controller, the Settings · Sync open state (so the auth/conflict
 * banners can open it), the drawer-open state, and re-attaches a persisted connection on mount.
 */
export function Workspace() {
  const controller = useMemo(() => createSyncController(), [])
  const [syncSettingsOpen, setSyncSettingsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const tier = useViewportTier()
  const isDesktop = tier === 'desktop'

  useEffect(() => {
    controller.resume() // re-attach a persisted connection after a reload (no-op when local-only)
  }, [controller])

  const drawer = !isDesktop ? <SidebarDrawer open={drawerOpen} onOpenChange={setDrawerOpen} /> : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-color)]">
      <WorkspaceHeader
        controller={controller}
        syncSettingsOpen={syncSettingsOpen}
        onSyncSettingsChange={setSyncSettingsOpen}
        compact={!isDesktop}
        drawerTrigger={drawer}
      />
      <div className="flex min-h-0 flex-1">
        {isDesktop && <Sidebar />}
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
