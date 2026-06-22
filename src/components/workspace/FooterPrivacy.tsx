import { useTranslation } from 'react-i18next'
import { useProviderStore } from '@/stores/providerStore'
import { presentationFor } from '@/lib/providers/providerPresentation'
import { openSettings } from '@/lib/workspace/openSettings'

/**
 * Footer privacy line (feature #2, WI-8; responsive reflow feature #16) — provider-aware
 * transparency (rule 65 §6): a hosted provider shows an amber dot + "sent to <provider>"; a local
 * provider shows a green dot + "stays on this device". The "switch to a local model" CTA is omitted
 * (no local provider ships yet); a **Details** CTA opens the Settings provider dialog — the real
 * "where your text goes" surface (audit H6) — via the openSettings bridge. On narrow viewports the
 * privacy text truncates (`min-w-0` + `truncate`) so the `shrink-0` Details CTA never wraps off
 * screen (design Section E). The footer carries `env(safe-area-inset-bottom)` padding for iOS notch.
 */
export function FooterPrivacy() {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const pres = presentationFor(vendor)
  return (
    <footer
      className="flex shrink-0 items-center justify-between gap-[9px] border-t bg-[var(--bg-color)] px-[22px] py-[9px]"
      style={{ paddingBottom: 'max(9px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex min-w-0 items-center gap-[9px]">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: pres.isLocal ? 'var(--success)' : 'var(--warning)' }}
          aria-hidden
        />
        <span className="truncate font-mono text-[11.5px] text-[var(--text-secondary)]">
          {pres.isLocal ? t('privacy.local') : t('privacy.hosted', { provider: t(pres.labelKey) })}
        </span>
      </div>
      <button
        type="button"
        onClick={openSettings}
        className="shrink-0 font-mono text-[11.5px] text-[var(--accent-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
      >
        {t('footer.details')}
      </button>
    </footer>
  )
}
