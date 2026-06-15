import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { ProviderSwitcher } from './ProviderSwitcher'
import { FooterPrivacy } from './FooterPrivacy'
import { WorkspaceToast } from './WorkspaceToast'
import { TranslatePanel } from '@/components/translate/TranslatePanel'
import { PolishPanel } from '@/components/polish/PolishPanel'

/**
 * Top-level workspace layout (feature #2) — header + toolbar (with the provider switcher) +
 * the Translate panel (WI-8) over the Polish panel (WI-9) + provider-aware footer + toast
 * host.
 *
 * No sidebar: the committed design's Sessions/Glossary sidebar — and its data — are feature
 * #3 (#19); its layout is needs-design #18. The main region is full-width until that lands.
 */
export function Workspace() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-color)]">
      <WorkspaceHeader />
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceToolbar>
          <ProviderSwitcher />
        </WorkspaceToolbar>
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <TranslatePanel />
          <PolishPanel />
        </main>
      </div>
      <FooterPrivacy />
      <WorkspaceToast />
    </div>
  )
}
