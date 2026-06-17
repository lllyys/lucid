// Purpose: the Settings · Sync conflict card (#9, WI-9c, design surface E). v1 surfaces a single
// superseded-edit signal (the design's "review deferred" — no side-by-side restore yet): the item that
// lost the merge, the superseded/kept rows, the deferred-review note, and Dismiss / Copy-my-version
// actions. Pure presentation — Dismiss calls onDismiss (the panel clears the store conflict). Tokens only
// (rule 30/31); every string via t() (rule 66 §5).

import { useTranslation } from 'react-i18next'
import type { SyncConflictInfo } from '@/stores/syncStore'
import type { EntityType } from '@/lib/sync/types'

const ENTITY_LABEL_KEY: Record<EntityType, string> = {
  session: 'sync.conflict.entitySession',
  task: 'sync.conflict.entityTask',
  term: 'sync.conflict.entityTerm',
  keyword: 'sync.conflict.entityKeyword',
}

export interface ConflictCardProps {
  conflict: SyncConflictInfo
  onDismiss: () => void
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-[10px] bg-[var(--bg-canvas)] p-[11px_14px]">
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">{label}</span>
      <span className={`${mono ? 'font-mono text-[11px]' : 'text-[12.5px] font-medium'} text-[var(--text-color)]`}>
        {value}
      </span>
    </div>
  )
}

export function ConflictCard({ conflict, onDismiss }: ConflictCardProps) {
  const { t } = useTranslation()
  const entityLabel = t(ENTITY_LABEL_KEY[conflict.type])

  return (
    <div className="w-[440px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--shadow-tab)]">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-[var(--border-color)] bg-[var(--warning-bg)] p-[18px_20px]">
        <span
          aria-hidden
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--warning-border)] bg-[var(--bg-color)] text-[14px] text-[var(--warning)]"
        >
          ⚠
        </span>
        <div className="flex flex-col gap-[3px]">
          <span className="text-[15px] font-semibold text-[var(--warning)]">{t('sync.conflict.title')}</span>
          <span className="font-mono text-[10.5px] text-[var(--warning)]">{t('sync.conflict.subtitle')}</span>
        </div>
      </div>

      <div className="flex flex-col gap-[14px] p-[18px_20px]">
        <p className="m-0 text-[12.5px] leading-[1.65] text-[var(--text-secondary)]">{t('sync.conflict.body')}</p>

        <div className="flex flex-col gap-px overflow-hidden rounded-[11px] border border-[var(--border-color)] bg-[var(--border-color)]">
          <MetaRow label={t('sync.conflict.itemLabel')} value={`${entityLabel} · ${conflict.id}`} />
          <MetaRow label={t('sync.conflict.supersededLabel')} value={t('sync.conflict.supersededValue')} mono />
          <MetaRow label={t('sync.conflict.keptLabel')} value={t('sync.conflict.keptValue')} mono />
        </div>

        <div className="flex items-start gap-[9px] rounded-[11px] border border-dashed border-[var(--border-dashed)] bg-[var(--bg-canvas)] p-[11px_13px]">
          <span aria-hidden className="mt-px shrink-0 font-mono text-[11px] text-[var(--accent-ink)]">
            i
          </span>
          <span className="font-mono text-[10px] leading-[1.65] text-[var(--text-tertiary)]">
            {t('sync.conflict.reviewDeferred')}
          </span>
        </div>

        <div className="flex gap-[10px]">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[10px] font-sans text-[12.5px] font-semibold text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('sync.conflict.dismiss')}
          </button>
          <button
            type="button"
            disabled
            title={t('sync.conflict.copyDeferred')}
            className="flex-1 cursor-not-allowed rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[10px] font-sans text-[12.5px] font-medium text-[var(--text-secondary)] opacity-50"
          >
            {t('sync.conflict.copyMine')}
          </button>
        </div>
      </div>
    </div>
  )
}
