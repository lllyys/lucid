import { useTranslation } from 'react-i18next'
import { useProviderStore } from '@/stores/providerStore'
import { presentationFor } from '@/lib/providers/providerPresentation'
import { openSettings } from '@/lib/workspace/openSettings'

/**
 * The auto-run header switch (feature #11, design Section A/D). On → the panel's primary button steps
 * back to "Run now" (the panel owns that label). When the provider isn't ready the switch is disabled
 * with a reason + an "Open Settings" link (Section D, "toggle disabled"). Tokens + t() only.
 */
export function AutoRunToggle({
  enabled,
  canEnable,
  onToggle,
}: {
  enabled: boolean
  canEnable: boolean
  onToggle: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const providerLabel = t(presentationFor(vendor).labelKey)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? t('autorun.toggleOn') : t('autorun.toggleOff')}
        disabled={!canEnable}
        onClick={() => onToggle(!enabled)}
        className="flex items-center gap-2 bg-transparent p-0 disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
      >
        <span
          aria-hidden
          className="relative h-[21px] w-9 flex-none rounded-full border transition-colors"
          style={{
            background: enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            borderColor: enabled ? 'var(--accent-primary)' : 'var(--border-strong)',
          }}
        >
          <span
            className="absolute top-0.5 size-[15px] rounded-full bg-white shadow-sm transition-[left]"
            style={{ left: enabled ? 17 : 2 }}
          />
        </span>
        <span
          className="text-[12.5px] font-medium"
          style={{ color: enabled ? 'var(--accent-ink)' : 'var(--text-tertiary)', fontWeight: enabled ? 600 : 500 }}
        >
          {t('autorun.toggle')}
        </span>
      </button>
      {!canEnable && (
        <span className="text-[11px] text-[var(--text-tertiary)]">
          {t('autorun.disabledReason', { provider: providerLabel })}{' '}
          <button
            type="button"
            onClick={() => openSettings()}
            className="font-semibold text-[var(--accent-ink)] underline hover:text-[var(--accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('autorun.openSettings')}
          </button>
        </span>
      )}
    </div>
  )
}
