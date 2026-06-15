import { useTranslation } from 'react-i18next'
import { SidebarEmpty } from './SidebarEmpty'

/**
 * Glossary tab (feature #3, WI-4 shell → WI-6 add/list/use/extract). WI-4 renders the empty
 * state; WI-6 adds the add-term input, the term list (remove + "use" → Polish keywords), and
 * extract-from-current-text.
 */
export function GlossaryView() {
  const { t } = useTranslation()
  return <SidebarEmpty body={t('sidebar.glossaryEmpty')} />
}
