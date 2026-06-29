import { useEffect, useMemo, useState } from 'react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { ProviderSwitcher } from './ProviderSwitcher'
import { PaneSwitcher, type WorkspacePane } from './PaneSwitcher'
import { FooterPrivacy } from './FooterPrivacy'
import { WorkspaceToast } from './WorkspaceToast'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SidebarDrawer } from '@/components/sidebar/SidebarDrawer'
import { TranslatePanel } from '@/components/translate/TranslatePanel'
import { PolishPanel } from '@/components/polish/PolishPanel'
import { SyncErrorBanner } from '@/components/sync/SyncErrorBanner'
import { AutoSyncConsentPrompt } from '@/components/sync/AutoSyncConsentPrompt'
import { createSyncController } from '@/lib/sync/syncController'
import { onLoadSource } from '@/lib/workspace/loadSource'
import { useViewportTier } from '@/hooks/useViewportTier'

/**
 * Top-level workspace layout (feature #2; sidebar added feature #3; sync wired in feature #9, WI-9d;
 * responsive reflow feature #16) — the reflow orchestrator. Reads `useViewportTier()` (desktop /
 * tablet / phone) and adapts:
 *  - desktop (≥960): unchanged — inline Sidebar + the Translate panel stacked over the Polish panel.
 *  - tablet/phone (<960): the Sidebar moves into an off-canvas SidebarDrawer (Sheet); the ☰ hamburger
 *    lives in the compact header.
 *  - phone (<600): the toolbar (subtitle + ProviderSwitcher, both reachable via Settings) is replaced
 *    by a PaneSwitcher that selects which single pane is VISIBLE. BOTH panels stay MOUNTED and are
 *    toggled with a `hidden` wrapper (never unmounted), so each panel's component-local state (typed
 *    source/draft, language picks, the per-hunk reject set, the draftTranslate mirror, a pending
 *    auto-run) survives a Translate↔Polish switch (audit C1).
 * The shell owns the single sync controller, the Settings · Sync open state (so the auth/conflict
 * banners can open it), the drawer-open + active-pane state, and re-attaches a persisted connection.
 * It also listens for a starred "Open in workspace" load (feature #24) to close the drawer + switch
 * to the translate pane (TranslatePanel owns loading the text).
 */
export function Workspace() {
  const controller = useMemo(() => createSyncController(), [])
  const [syncSettingsOpen, setSyncSettingsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activePane, setActivePane] = useState<WorkspacePane>('translate')
  const tier = useViewportTier()
  const isDesktop = tier === 'desktop'
  const isPhone = tier === 'phone'

  useEffect(() => {
    controller.resume() // re-attach a persisted connection after a reload (no-op when local-only)
    // #21 auto-on: probe the served origin for a token-free single-origin server and, if eligible+unseen,
    // raise the one-time consent prompt (never a silent connect). The AbortController aborts the in-flight
    // probe on unmount so a late resolve raises nothing stale.
    const probeAbort = new AbortController()
    void controller.maybeAutoConnect(probeAbort.signal)
    return () => probeAbort.abort()
  }, [controller])

  // "Open in workspace" from a starred item (feature #24): TranslatePanel owns the text; the shell
  // owns the chrome — close the off-canvas drawer and surface the translate pane on phone. Stable
  // setters → no stale closure; the listener unsubscribes on unmount.
  useEffect(
    () =>
      onLoadSource(() => {
        setDrawerOpen(false)
        setActivePane('translate')
      }),
    [],
  )

  const drawer = !isDesktop ? <SidebarDrawer open={drawerOpen} onOpenChange={setDrawerOpen} /> : null

  // Phone: hide a pane by wrapping it in a `hidden` div (still mounted → state preserved). Desktop and
  // tablet render the panels as bare flex children (no wrapper) so their layout is byte-for-byte intact.
  const translatePane = isPhone ? (
    <div className={activePane === 'translate' ? 'contents' : 'hidden'}>
      <TranslatePanel />
    </div>
  ) : (
    <TranslatePanel />
  )
  const polishPane = isPhone ? (
    <div className={activePane === 'polish' ? 'contents' : 'hidden'}>
      <PolishPanel />
    </div>
  ) : (
    <PolishPanel />
  )

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
          {isPhone ? (
            <PaneSwitcher value={activePane} onChange={setActivePane} />
          ) : (
            <WorkspaceToolbar>
              <ProviderSwitcher />
            </WorkspaceToolbar>
          )}
          <SyncErrorBanner
            onRetry={() => controller.syncNow()}
            onOpenSettings={() => setSyncSettingsOpen(true)}
          />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto">
            {translatePane}
            {polishPane}
          </main>
        </div>
      </div>
      <FooterPrivacy />
      <WorkspaceToast />
      <AutoSyncConsentPrompt controller={controller} />
    </div>
  )
}
