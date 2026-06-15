import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { resolveBidiDirection, type BidiOverride } from '@/lib/translation/bidi'

/**
 * Source direction override (feature #4, WI-4 — designed #17b). Lets the user force LTR/RTL
 * layout of the source editor, or leave it Auto (content-detected). This is VISUAL ONLY — it
 * never changes the translation route / request language (plan v4 §3). The chip shows the
 * detected direction in Auto mode so the user sees what bidi resolved to.
 */
const OPTIONS: { value: BidiOverride; labelKey: string; subKey: string }[] = [
  { value: 'auto', labelKey: 'translate.dirAuto', subKey: 'translate.dirAutoSub' },
  { value: 'ltr', labelKey: 'translate.dirForceLtr', subKey: 'translate.dirForceLtrSub' },
  { value: 'rtl', labelKey: 'translate.dirForceRtl', subKey: 'translate.dirForceRtlSub' },
]

export function DirectionOverride({
  value,
  onChange,
  sampleText,
}: {
  value: BidiOverride
  onChange: (v: BidiOverride) => void
  sampleText: string
}) {
  const { t } = useTranslation()
  const detected = resolveBidiDirection(sampleText, 'auto')
  const chipLabel =
    value === 'auto'
      ? `${t('translate.dirAuto')} · ${detected === 'rtl' ? t('translate.dirRtl') : t('translate.dirLtr')}`
      : value === 'rtl'
        ? t('translate.dirForceRtl')
        : t('translate.dirForceLtr')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('translate.dirOverride')}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)]"
        >
          {chipLabel}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {t('translate.dirHeading')}
        </DropdownMenuLabel>
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} className="gap-2" onSelect={() => onChange(o.value)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-medium">{t(o.labelKey)}</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">{t(o.subKey)}</span>
            </span>
            {o.value === value && <Check className="size-3 text-[var(--accent-ink)]" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
