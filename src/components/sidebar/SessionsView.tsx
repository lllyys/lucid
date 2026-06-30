import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionStore, searchSessions, type Task } from '@/stores/sessionStore'
import { useViewportTier } from '@/hooks/useViewportTier'
import { loadSourceIntoWorkspace } from '@/lib/workspace/loadSource'
import { SidebarEmpty } from './SidebarEmpty'
import { TaskReadView } from './TaskReadView'

/**
 * Sessions tab (feature #3, WI-5). List view: New session + search + session rows; opening a row
 * shows its detail (rename + task list). Opening/creating a session also selects it (active →
 * receives new tasks via useRecordTask, WI-7). A task row opens a read-only task detail (feature #25,
 * WI-4) via `readTaskId` (mirrors the session-detail toggle); a sibling ↗ loads the task's source back
 * into the editor (#24 `loadSourceIntoWorkspace`). Pure store interactions — no provider/network.
 */
export function SessionsView() {
  const { t } = useTranslation()
  const sessions = useSessionStore((s) => s.sessions)
  const [openId, setOpenId] = useState<string | null>(null)
  const [readTaskId, setReadTaskId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [renameValue, setRenameValue] = useState<string | null>(null)

  const open = openId === null ? null : sessions.find((s) => s.id === openId) ?? null

  const create = () => {
    const id = useSessionStore.getState().newSession()
    setReadTaskId(null)
    setOpenId(id)
    setQuery('')
  }
  const openSession = (id: string) => {
    useSessionStore.getState().selectSession(id)
    setReadTaskId(null)
    setOpenId(id)
  }
  const commitRename = () => {
    if (open && renameValue !== null && renameValue.trim() !== '') {
      useSessionStore.getState().renameSession(open.id, renameValue.trim())
    }
    setRenameValue(null)
  }

  // Read-only task detail layer: when a task is opened, render it instead of the task list (a task that
  // no longer exists — e.g. dropped by the cap — falls through to the list).
  const readTask = open !== null && readTaskId !== null ? open.tasks.find((tk) => tk.id === readTaskId) ?? null : null
  if (open && readTask) {
    return <TaskReadView task={readTask} sessionName={open.name} onBack={() => setReadTaskId(null)} />
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
              className="w-full rounded-lg border border-[var(--accent-border)] bg-[var(--bg-color)] px-2.5 py-[7px] text-[14px] font-semibold text-[var(--text-color)] outline-none focus:border-[var(--accent-ink)]"
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
            [...open.tasks].reverse().map((task) => <TaskRow key={task.id} task={task} onOpen={setReadTaskId} />)
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
        <div className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 focus-within:border-[var(--accent-ink)]">
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

/**
 * A task row (feature #25, WI-4): a relative wrapper holding TWO SIBLING buttons (never nested — an
 * invalid button-in-button) — a body button covering the row that opens the read view, and a separate
 * ↗ button that loads the task's source into the editor (stopPropagation so a ↗ tap never reads). The ↗
 * is hover/focus-revealed on desktop and ALWAYS visible on phone (touch — a ≥44px transparent hit pad).
 */
function TaskRow({ task, onOpen }: { task: Task; onOpen: (taskId: string) => void }) {
  const { t } = useTranslation()
  const isTranslate = task.kind === 'translate'
  const isPhone = useViewportTier() === 'phone'
  return (
    <div className="group relative flex items-center rounded-lg hover:bg-[var(--hover-bg)]">
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 pr-11 text-left"
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
          style={{
            background: isTranslate ? 'var(--accent-bg)' : 'var(--success-bg)',
            color: isTranslate ? 'var(--accent-ink)' : 'var(--success)',
          }}
        >
          {isTranslate ? '⇄' : '✦'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[12.5px] font-medium text-[var(--text-color)]">{task.title}</span>
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t(`${isTranslate ? 'translate' : 'polish'}.label`)}</span>
        </span>
        <span aria-hidden className="shrink-0 text-[14px] text-[var(--text-disabled)]">›</span>
      </button>
      <button
        type="button"
        aria-label={t('task.read.loadIntoWorkspace')}
        title={t('task.read.loadIntoWorkspace')}
        onClick={(e) => {
          e.stopPropagation()
          loadSourceIntoWorkspace(task.sourceText)
        }}
        className={`absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg bg-transparent text-[13px] text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] ${
          isPhone ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        ↗
      </button>
    </div>
  )
}
