import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProviderStore } from '@/stores/providerStore'
import { implementedPresentations } from '@/lib/providers/providerPresentation'
import { resolveModel } from '@/providers/modelRegistry'

/**
 * Provider switcher (feature #2, WI-8) — shadcn DropdownMenu listing only IMPLEMENTED
 * vendors (rule 51 — no silent no-op rows for unimplemented providers; the menu grows as
 * feature #1 implements more). Selecting one calls useProviderStore.setVendor.
 */
export function ProviderSwitcher() {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const providers = implementedPresentations()
  const active = providers.find((p) => p.vendor === vendor) ?? providers[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[9px] border bg-[var(--bg-color)] px-[11px] py-[7px] text-[13px] font-medium hover:bg-[var(--hover-bg)]"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: `var(${active.dotToken})` }} />
          {t(active.labelKey)}
          <ChevronDown className="size-3 text-[var(--text-tertiary)]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[260px]">
        {providers.map((p) => (
          <DropdownMenuItem
            key={p.vendor}
            className="gap-2.5"
            onSelect={() => useProviderStore.getState().setVendor(p.vendor)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${p.dotToken})` }} />
            <span className="flex flex-1 flex-col">
              <span className="text-[13.5px] font-medium">{t(p.labelKey)}</span>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">{resolveModel(p.vendor)}</span>
            </span>
            {p.isLocal && (
              <span className="rounded-[5px] bg-[var(--success-bg)] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--success)]">
                {t('provider.private')}
              </span>
            )}
            {p.vendor === vendor && <Check className="size-3.5 text-[var(--accent-ink)]" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
