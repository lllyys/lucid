import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'

/**
 * Top-level workspace layout (feature #2, WI-3) — the designed shell: header + toolbar +
 * a main region that the Translate (WI-8) and Polish (WI-9) panels mount into, plus a
 * footer (FooterPrivacy, WI-8) and toast host (WorkspaceToast, WI-9) added by later WIs.
 *
 * No sidebar: the committed design's Sessions/Glossary sidebar — and its data — are
 * feature #3 (#19); its layout is needs-design #18 (Gate-2 closure). The main region is
 * full-width until that lands.
 */
export function Workspace() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-color)]">
      <WorkspaceHeader />
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceToolbar />
        <main className="flex min-h-0 flex-1 flex-col" />
      </div>
    </div>
  )
}
