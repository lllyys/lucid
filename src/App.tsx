import { ThemeProvider } from 'next-themes'
import { Workspace } from '@/components/workspace/Workspace'
import { ConfigSyncGate } from '@/components/configsync/ConfigSyncGate'

// Feature #2 app shell: render the Lucid Workspace (header + toolbar + Translate/Polish
// panels + footer). Feature #4 (WI-2) wraps it in next-themes' ThemeProvider so dark mode
// follows the OS (`system`) via the `.dark` class strategy (rule 34) — no manual toggle ships
// (that surface is undesigned). The sidebar is feature #3 (#19). Feature #15 (WI-6) wraps the
// workspace in the ConfigSyncGate: it owns the single config-sync controller, probes the server
// on mount, and shows the passphrase / unlock cards until the workspace is unlocked or local-only.
export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConfigSyncGate>
        <Workspace />
      </ConfigSyncGate>
    </ThemeProvider>
  )
}
