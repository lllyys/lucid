// Purpose: the Settings left rail (#10 WI-3, design Section A). A Built-in group (the implemented named
// vendors) above a Custom-providers group below. The custom group is empty-state (a "+ Add custom
// provider" CTA + blurb) until the user adds one, then shows a `Custom · N` header, one row per custom
// (dot/label/status·model from the WI-2 presentation + the rail status helper), and the CTA. The
// ACTIVE provider (built-in OR custom) is marked "In use" independently of which row is being edited.
// Selecting a row sets the parent's viewed selection; the CTA opens the add form.

import { useTranslation } from 'react-i18next'
import type { Vendor } from '@/providers/types'
import { implementedPresentations, customDotToken } from '@/lib/providers/providerPresentation'
import { customRailStatusKey } from '@/lib/providers/customProviderForm'
import { resolveModel } from '@/providers/modelRegistry'
import type { CustomProvider } from '@/stores/providerStore'

export type RailSelection =
  | { kind: 'builtin'; vendor: Vendor }
  | { kind: 'custom'; id: string }
  | { kind: 'add' }

interface ProviderRailProps {
  /** The active workspace vendor (built-in marker). */
  activeVendor: Vendor
  /** The active custom id when a custom is active (vendor==='custom'), else null. */
  activeCustomId: string | null
  /** The currently viewed/edited selection. */
  selection: RailSelection
  /** Per-vendor selected models (built-in sub-labels). */
  models: Record<Vendor, string>
  /** Built-in status line per vendor (key-set / ready / etc.). */
  builtinStatus: (v: Vendor) => string
  /** The custom providers map. */
  customProviders: Record<string, CustomProvider>
  onSelect: (selection: RailSelection) => void
}

function selectedRow(selection: RailSelection, kind: 'builtin', vendor: Vendor): boolean
function selectedRow(selection: RailSelection, kind: 'custom', id: string): boolean
function selectedRow(selection: RailSelection, kind: 'builtin' | 'custom', key: string): boolean {
  if (kind === 'builtin') return selection.kind === 'builtin' && selection.vendor === key
  return selection.kind === 'custom' && selection.id === key
}

export function ProviderRail({
  activeVendor,
  activeCustomId,
  selection,
  models,
  builtinStatus,
  customProviders,
  onSelect,
}: ProviderRailProps) {
  const { t } = useTranslation()
  const builtins = implementedPresentations()
  const customs = Object.values(customProviders)
  const customActive = activeVendor === 'custom'

  const inUseBadge = (
    <span className="rounded-[5px] bg-[var(--accent-bg)] px-1.5 py-[3px] font-mono text-[8px] font-semibold uppercase tracking-[0.05em] text-[var(--accent-ink)]">
      {t('settings.inUse')}
    </span>
  )
  const rowClass =
    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]'

  return (
    <div className="flex w-[252px] shrink-0 flex-col gap-1 overflow-auto border-r border-[var(--border-color)] bg-[var(--bg-canvas)] p-3">
      <span className="px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
        {t('settings.providersHeading')}
      </span>

      {builtins.map((p) => {
        const selected = selectedRow(selection, 'builtin', p.vendor)
        const active = p.vendor === activeVendor && !customActive
        return (
          <button
            key={p.vendor}
            type="button"
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelect({ kind: 'builtin', vendor: p.vendor })}
            className={rowClass}
            style={
              selected
                ? { background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1px var(--accent-border)' }
                : undefined
            }
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${p.dotToken})` }} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] font-semibold text-[var(--text-color)]">{t(p.labelKey)}</span>
              <span className="truncate font-mono text-[9.5px] text-[var(--text-tertiary)]">
                {builtinStatus(p.vendor)} · {models[p.vendor] || resolveModel(p.vendor) || '—'}
              </span>
            </span>
            {active && inUseBadge}
          </button>
        )
      })}

      {/* Custom providers group (design Section A) */}
      <div className="flex items-center justify-between px-2 pb-1.5 pt-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          {customs.length > 0 ? t('settings.customCount', { n: customs.length }) : t('settings.customGroup')}
        </span>
      </div>

      {customs.length === 0 && (
        <p className="px-2 pb-2 font-mono text-[10px] leading-[1.6] text-[var(--text-tertiary)]">
          {t('settings.customEmptyBlurb')}
        </p>
      )}

      {customs.map((c) => {
        const selected = selectedRow(selection, 'custom', c.id)
        const active = customActive && activeCustomId === c.id
        return (
          <button
            key={c.id}
            type="button"
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelect({ kind: 'custom', id: c.id })}
            className={rowClass}
            style={
              selected
                ? { background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1px var(--accent-border)' }
                : undefined
            }
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${customDotToken(c.testResult.status)})` }} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] font-semibold text-[var(--text-color)]">{c.label}</span>
              <span className="truncate font-mono text-[9.5px] text-[var(--text-tertiary)]">
                {t(customRailStatusKey(c.testResult, c.key))} · {c.model || '—'}
              </span>
            </span>
            {active && inUseBadge}
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => onSelect({ kind: 'add' })}
        className="mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--accent-dash)] bg-[var(--accent-subtle)] px-3 py-2.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
      >
        + {t('settings.addCustom')}
      </button>

      <span className="mt-auto px-2 pt-3 font-mono text-[11px] leading-[1.5] text-[var(--text-tertiary)]">
        {t('settings.keysMemoryFooter')}
      </span>
    </div>
  )
}
