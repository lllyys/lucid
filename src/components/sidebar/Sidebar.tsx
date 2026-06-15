import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SidebarEmpty } from './SidebarEmpty'
import { SessionsView } from './SessionsView'
import { GlossaryView } from './GlossaryView'

export type SidebarTab = 'sessions' | 'glossary'

/**
 * Sessions & Glossary sidebar (feature #3 — designed surface #18, full variant). A segmented
 * Sessions/Glossary tab control over the two views. Only the FULL variant ships: the design's
 * shell/hidden variants are reachable only via the prototype-only "Design review" dock, and a
 * product collapse control is undesigned (rule 51) — see the plan's Gate-2 §"variant scope".
 */
export function Sidebar() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SidebarTab>('sessions')

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md py-[5px] text-[12.5px] font-medium ${
      active ? 'bg-[var(--bg-color)] text-[var(--text-color)] shadow-[var(--shadow-tab)]' : 'text-[var(--text-tertiary)]'
    }`

  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r bg-[var(--bg-color)]">
      <div className="p-3">
        <div role="tablist" aria-label={t('sidebar.sessions')} className="flex gap-0.5 rounded-[9px] bg-[var(--bg-tertiary)] p-[3px]">
          <button type="button" role="tab" aria-selected={tab === 'sessions'} onClick={() => setTab('sessions')} className={tabClass(tab === 'sessions')}>
            {t('sidebar.sessions')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'glossary'} onClick={() => setTab('glossary')} className={tabClass(tab === 'glossary')}>
            {t('sidebar.glossary')}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        {tab === 'sessions' ? <SessionsView /> : <GlossaryView />}
      </div>
    </aside>
  )
}

export { SidebarEmpty }
