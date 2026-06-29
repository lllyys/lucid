import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SidebarEmpty } from './SidebarEmpty'
import { SessionsView } from './SessionsView'
import { GlossaryView } from './GlossaryView'
import { StarredView } from './StarredView'

export type SidebarTab = 'sessions' | 'glossary' | 'starred'

/** Layout variant: `inline` is the fixed-width desktop rail; `drawer` fills the off-canvas Sheet panel. */
export type SidebarVariant = 'inline' | 'drawer'

/**
 * Sessions / Glossary / Starred sidebar (feature #3 — designed surface #18; the Starred tab added
 * feature #22, WI-4 — designed Section C). A segmented tab control over the three views. Only the
 * FULL variant ships: the design's shell/hidden variants are reachable only via the prototype-only
 * "Design review" dock, and a product collapse control is undesigned (rule 51) — see the plan's
 * Gate-2 §"variant scope".
 *
 * The responsive reflow (feature #16) renders it `inline` on desktop and inside the SidebarDrawer
 * Sheet (`variant="drawer"`) on tablet/phone — drawer drops the fixed width + its own right border
 * so the Sheet panel owns the frame.
 */
export function Sidebar({ variant = 'inline' }: { variant?: SidebarVariant } = {}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SidebarTab>('sessions')

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md py-[5px] text-[12.5px] font-medium ${
      active ? 'bg-[var(--bg-color)] text-[var(--text-color)] shadow-[var(--shadow-tab)]' : 'text-[var(--text-tertiary)]'
    }`

  const frameClass =
    variant === 'drawer' ? 'w-full bg-[var(--bg-color)]' : 'w-[268px] shrink-0 border-r bg-[var(--bg-color)]'

  return (
    <aside className={`flex min-h-0 flex-col ${frameClass}`}>
      <div className="p-3">
        <div role="tablist" aria-label={t('sidebar.sessions')} className="flex gap-0.5 rounded-[9px] bg-[var(--bg-tertiary)] p-[3px]">
          <button type="button" role="tab" aria-selected={tab === 'sessions'} onClick={() => setTab('sessions')} className={tabClass(tab === 'sessions')}>
            {t('sidebar.sessions')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'glossary'} onClick={() => setTab('glossary')} className={tabClass(tab === 'glossary')}>
            {t('sidebar.glossary')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'starred'} onClick={() => setTab('starred')} className={tabClass(tab === 'starred')}>
            <span aria-hidden className="mr-1 text-[var(--accent-ink)]">★</span>
            {t('starred.tab')}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        {tab === 'sessions' ? <SessionsView /> : tab === 'glossary' ? <GlossaryView /> : <StarredView />}
      </div>
    </aside>
  )
}

export { SidebarEmpty }
