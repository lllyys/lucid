import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionStore, searchSessions, type Task } from '@/stores/sessionStore'
import { SidebarEmpty } from './SidebarEmpty'

/**
 * Sessions tab (feature #3, WI-5). List view: New session + search + session rows; opening a row
 * shows its detail (rename + task list). Opening/creating a session also selects it (active →
 * receives new tasks via useRecordTask, WI-7). Pure store interactions — no provider/network.
 */
export function SessionsView() {
  const { t } = useTranslation()
  const sessions = useSessionStore((s) => s.sessions)
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [renameValue, setRenameValue] = useState<string | null>(null)

  const open = openId === null ? null : sessions.find((s) => s.id === openId) ?? null

  const create = () => {
    const id = useSessionStore.getState().newSession()
    setOpenId(id)
    setQuery('')
  }
  const openSession = (id: string) => {
    useSessionStore.getState().selectSession(id)
    setOpenId(id)
  }
  const commitRename = () => {
    if (open && renameValue !== null && renameValue.trim() !== '') {
      useSessionStore.getState().renameSession(open.id, renameValue.trim())
    }
    setRenameValue(null)
  }

  if (open) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-0 flex-col gap-2.5 px-3 pb-2.5">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="self-start text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-color)]"
          >
            ‹ {t('sidebar.allSessions')}
          </button>
          {renameValue !== null ? (
            <input
              aria-label={t('sidebar.rename')}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenameValue(null)
              }}
              className="w-full rounded-lg border border-[var(--accent-border)] bg-[var(--bg-color)] px-2.5 py-[7px] text-[14px] font-semibold text-[var(--text-color)] outline-none"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-[14.5px] font-semibold text-[var(--text-color)]">{open.name}</span>
              <button
                type="button"
                title={t('sidebar.rename')}
                aria-label={t('sidebar.rename')}
                onClick={() => setRenameValue(open.name)}
                className="p-0.5 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--accent-ink)]"
              >
                ✎
              </button>
            </div>
          )}
          <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
            {t('sidebar.taskCount', { count: open.tasks.length })}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-auto px-2 pb-3">
          {open.tasks.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] leading-[1.6] text-[var(--text-disabled)]">
              {t('sidebar.sessionsEmpty')}
            </p>
          ) : (
            [...open.tasks].reverse().map((task) => <TaskRow key={task.id} task={task} />)
          )}
        </div>
      </div>
    )
  }

  const visible = searchSessions(sessions, query)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-0 flex-col gap-2 px-3 pb-2.5">
        <button
          type="button"
          onClick={create}
          className="flex items-center justify-center gap-1.5 rounded-[9px] border border-dashed bg-[var(--bg-canvas)] py-2 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-color)]"
        >
          ＋ {t('sidebar.newSession')}
        </button>
        <div className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5">
          <span className="text-[12px] text-[var(--text-tertiary)]">⌕</span>
          <input
            aria-label={t('sidebar.searchSessions')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sidebar.searchSessions')}
            className="flex-1 border-none bg-transparent text-[12.5px] text-[var(--text-color)] outline-none"
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <SidebarEmpty body={t('sidebar.sessionsEmpty')} />
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-[var(--text-disabled)]">{t('sidebar.noResults')}</p>
        ) : (
          visible.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openSession(s.id)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--hover-bg)]"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-[12px] text-[var(--accent-ink)]">
                ❑
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold text-[var(--text-color)]">{s.name}</span>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  {t('sidebar.taskCount', { count: s.tasks.length })}
                </span>
              </span>
              <span className="shrink-0 text-[14px] text-[var(--text-disabled)]">›</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
        style={{
          background: task.kind === 'translate' ? 'var(--accent-bg)' : 'var(--success-bg)',
          color: task.kind === 'translate' ? 'var(--accent-ink)' : 'var(--success)',
        }}
      >
        {task.kind === 'translate' ? '中' : '✦'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12.5px] font-medium text-[var(--text-color)]">{task.title}</span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t(`${task.kind === 'translate' ? 'translate' : 'polish'}.label`)}</span>
      </span>
    </div>
  )
}
