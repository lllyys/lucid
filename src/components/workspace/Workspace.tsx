import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { ProviderSwitcher } from './ProviderSwitcher'
import { FooterPrivacy } from './FooterPrivacy'
import { WorkspaceToast } from './WorkspaceToast'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { TranslatePanel } from '@/components/translate/TranslatePanel'
import { PolishPanel } from '@/components/polish/PolishPanel'

/**
 * Top-level workspace layout (feature #2; sidebar added feature #3) — header on top, then a row
 * of the Sessions/Glossary sidebar + the main column (toolbar with the provider switcher, the
 * Translate panel over the Polish panel), with a provider-aware footer + toast host.
 */
export function Workspace() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-color)]">
      <WorkspaceHeader />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col">
          <WorkspaceToolbar>
            <ProviderSwitcher />
          </WorkspaceToolbar>
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
