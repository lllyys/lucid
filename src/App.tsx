import { ThemeProvider } from 'next-themes'
import { Workspace } from '@/components/workspace/Workspace'

// Feature #2 app shell: render the Lucid Workspace (header + toolbar + Translate/Polish
// panels + footer). Feature #4 (WI-2) wraps it in next-themes' ThemeProvider so dark mode
// follows the OS (`system`) via the `.dark` class strategy (rule 34) — no manual toggle ships
// (that surface is undesigned). The sidebar is feature #3 (#19).
export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Workspace />
    </ThemeProvider>
  )
}
