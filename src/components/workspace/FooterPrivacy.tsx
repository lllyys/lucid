import { useTranslation } from 'react-i18next'
import { useProviderStore } from '@/stores/providerStore'
import { presentationFor } from '@/lib/providers/providerPresentation'

/**
 * Footer privacy line (feature #2, WI-8) — provider-aware transparency (rule 65 §6): a
 * hosted provider shows an amber dot + "sent to <provider>"; a local provider shows a green
 * dot + "stays on this device". The design's "switch to a local model" CTA is omitted: no
 * local provider is implemented yet (it returns when one ships).
 */
export function FooterPrivacy() {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const pres = presentationFor(vendor)
  return (
    <footer className="flex shrink-0 items-center gap-[9px] border-t bg-[var(--bg-color)] px-[22px] py-[9px]">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: pres.isLocal ? 'var(--success)' : 'var(--warning)' }}
        aria-hidden
      />
      <span className="font-mono text-[11.5px] text-[var(--text-secondary)]">
        {pres.isLocal ? t('privacy.local') : t('privacy.hosted', { provider: t(pres.labelKey) })}
      </span>
    </footer>
  )
}
