import { Workspace } from '@/components/workspace/Workspace'

// Feature #2 app shell: render the Lucid Workspace (header + toolbar + Translate/Polish
// panels + footer). The translate/polish panels and footer mount in WI-8/WI-9; the
// sidebar is feature #3 (#19). Undesigned surfaces (key entry, error/dark/RTL states)
// are needs-design #13–#18 and intentionally not rendered (rule 51).
export default function App() {
  return <Workspace />
}
