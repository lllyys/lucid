import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProviderStore } from '@/stores/providerStore'
import { activePresentation, configurablePresentations } from '@/lib/providers/providerPresentation'
import { customRailStatusKey } from '@/lib/providers/customProviderForm'
import { resolveModel } from '@/providers/modelRegistry'
import { openSettings } from '@/lib/workspace/openSettings'
import type { Vendor } from '@/providers/types'

/**
 * Provider switcher (feature #2 WI-8; rewired in #10 WI-4, design Section E) — a shadcn DropdownMenu
 * grouped into a Built-in section (the implemented named vendors) and a Custom section listing the N
 * user-defined OpenAI-compatible providers (#10), with a "+ Add custom provider…" item that opens
 * Settings. The collapsed TRIGGER resolves the active target via `activePresentation(state)`: an active
 * custom shows ITS OWN label + dot (not the generic "Custom" — subsumes bug #3), plus a status chip
 * when that custom isn't connected. Selecting a built-in → `setVendor('vendor')`; selecting a custom →
 * `setVendor({ type:'custom', id })` (NEVER the bare `setVendor('custom')` string, which would strand
 * `activeCustomId` and leave `isReady()` false — the WI-1 audit regression). The list comes from the
 * state-aware `configurablePresentations(state)` so the customs stay in sync with the store.
 */
export function ProviderSwitcher() {
  const { t } = useTranslation()
  // Subscribe to the slices that drive presentation so the trigger + list re-render on any change.
  const vendor = useProviderStore((s) => s.vendor)
  const models = useProviderStore((s) => s.models)
  const activeCustomId = useProviderStore((s) => s.activeCustomId)
  const customProviders = useProviderStore((s) => s.customProviders)

  const presentationState = { vendor, activeCustomId, customProviders }
  const active = activePresentation(presentationState)
  const rows = configurablePresentations(presentationState)
  const builtins = rows.filter((p) => p.customId === undefined)
  const customs = rows.filter((p) => p.customId !== undefined)

  // The active-custom record (for the trigger status chip); undefined for a built-in or dangling id.
  const activeCustom = vendor === 'custom' && activeCustomId ? customProviders[activeCustomId] : undefined
  // design Section E: surface a status chip on the collapsed trigger when the active custom isn't
  // connected, so the warning is visible without opening the menu.
  const triggerChipKey =
    activeCustom && activeCustom.testResult.status !== 'ok'
      ? customRailStatusKey(activeCustom.testResult, activeCustom.key)
      : null

  const selectBuiltin = (v: Vendor) => useProviderStore.getState().setVendor(v)
  const selectCustom = (id: string) =>
    useProviderStore.getState().setVendor({ type: 'custom', id })

  const triggerLabel = active.label ?? t(active.labelKey)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[9px] border bg-[var(--bg-color)] px-[11px] py-[7px] text-[13px] font-medium hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: `var(${active.dotToken})` }} />
          <span className="max-w-[160px] truncate">{triggerLabel}</span>
          {triggerChipKey && (
            <span className="rounded-[5px] border border-[var(--warning)] bg-[var(--warning-bg)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--warning)]">
              {t(triggerChipKey)}
            </span>
          )}
          <ChevronDown className="size-3 text-[var(--text-tertiary)]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[280px]">
        <DropdownMenuLabel className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {t('switcher.builtinGroup')}
        </DropdownMenuLabel>
        {builtins.map((p) => (
          <ProviderRow
            key={p.vendor}
            label={t(p.labelKey)}
            dotToken={p.dotToken}
            model={models[p.vendor] || resolveModel(p.vendor)}
            isLocal={p.isLocal}
            privateLabel={t('provider.private')}
            active={vendor === p.vendor && activeCustomId === null}
            onSelect={() => selectBuiltin(p.vendor)}
          />
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          <span>{t('switcher.customGroup')}</span>
          <span>{customs.length}</span>
        </DropdownMenuLabel>
        {/* Scrolls past ~6 rows (design Section E). */}
        <div className="max-h-[228px] overflow-y-auto">
          {customs.map((p) => (
            <ProviderRow
              key={p.customId}
              label={p.label ?? ''}
              dotToken={p.dotToken}
              model={p.model ?? ''}
              active={vendor === 'custom' && activeCustomId === p.customId}
              onSelect={() => selectCustom(p.customId as string)}
            />
          ))}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-[var(--accent-ink)]"
          onSelect={() => openSettings()}
        >
          <Plus className="size-3.5" aria-hidden />
          <span className="text-[12.5px] font-semibold">{t('switcher.addCustom')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ProviderRowProps {
  label: string
  dotToken: string
  model: string
  active: boolean
  onSelect: () => void
  isLocal?: boolean
  privateLabel?: string
}

/** One selectable row in the switcher (a built-in or a custom) — shared anatomy: dot · label · model. */
function ProviderRow({
  label,
  dotToken,
  model,
  active,
  onSelect,
  isLocal,
  privateLabel,
}: ProviderRowProps) {
  return (
    <DropdownMenuItem
      className="gap-2.5 data-[active=true]:bg-[var(--accent-subtle)]"
      data-active={active ? 'true' : undefined}
      onSelect={onSelect}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${dotToken})` }} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] font-medium">{label}</span>
        <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">{model}</span>
      </span>
      {isLocal && privateLabel && (
        <span className="rounded-[5px] bg-[var(--success-bg)] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--success)]">
          {privateLabel}
        </span>
      )}
      {active && <Check className="size-3.5 text-[var(--accent-ink)]" aria-hidden />}
    </DropdownMenuItem>
  )
}
