// Purpose: the Settings model control (feature #5 WI-6a — #29 design). For a named vendor it is a
// dropdown of the registry's `modelChain(vendor)` (the offered models); for `custom` (no catalog,
// user-defined model) it is a free-text input. Selecting/typing writes the VIEWED vendor's model via
// the parent (which calls providerStore.setModel(model, vendor)). No model-ID literal here (rule 65 §2).

import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { modelChain, capabilityOf } from '@/providers/modelRegistry'
import type { Vendor } from '@/providers/types'

interface ModelControlProps {
  vendor: Vendor
  model: string
  onPick: (model: string) => void
}

/** Compact context-window: 1_000_000 → "1M", 200_000 → "200K". */
function formatContext(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return `${n}`
}

export function ModelControl({ vendor, model, onPick }: ModelControlProps) {
  const { t } = useTranslation()
  const modelLabel = (
    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
      {t('settings.model')}
    </span>
  )

  if (vendor === 'custom') {
    // No fixed catalog — the model is whatever the user's OpenAI-compatible endpoint serves.
    return (
      <div className="flex flex-col gap-1.5">
        {modelLabel}
        <input
          type="text"
          value={model}
          onChange={(e) => onPick(e.target.value)}
          placeholder="gpt-4o-mini"
          aria-label={t('settings.model')}
          spellCheck={false}
          className="rounded-[11px] border bg-[var(--bg-color)] px-3 py-2.5 font-mono text-[13px] text-[var(--text-color)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>
    )
  }

  const options = modelChain(vendor)
  // Context window comes from the registry only where we have real capability data (anthropic);
  // allowAnyModel vendors have no catalog, so we don't fabricate a number (rule 60 §4).
  const ctx = capabilityOf(vendor, model)?.contextWindow
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        {modelLabel}
        {ctx !== undefined && (
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{formatContext(ctx)} context</span>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('settings.model')}
            className="flex items-center justify-between gap-2.5 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-2.5 text-left text-[13.5px] font-medium text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            <span>{model || '—'}</span>
            <span className="text-[11px] text-[var(--text-disabled)]">▾</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          {options.map((m) => (
            <DropdownMenuItem key={m} onSelect={() => onPick(m)} className="justify-between font-mono text-[12.5px]">
              <span>{m}</span>
              {m === model && <span className="text-[var(--accent-ink)]">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
