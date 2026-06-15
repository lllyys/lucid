import { useTranslation } from 'react-i18next'
import { SidebarEmpty } from './SidebarEmpty'

/**
 * Sessions tab (feature #3, WI-4 shell → WI-5 list/detail). WI-4 renders the empty state; WI-5
 * adds the new-session / search / list and the session-detail (rename + task list) views.
 */
export function SessionsView() {
  const { t } = useTranslation()
  return <SidebarEmpty body={t('sidebar.sessionsEmpty')} />
}
