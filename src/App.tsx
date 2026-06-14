import { useTranslation } from 'react-i18next'
import { useProviderStore } from '@/stores/providerStore'

// WI-7 app shell: PLUMBING ONLY (rule 51). It wires i18n + the provider config
// store into the minimal shell — brand wordmark, localized tagline, and a
// store-driven readiness hint. It deliberately builds NO translation/polish
// product surface (editor, diff/accept-reject pane, language/goal pickers,
// settings) — those are feature #3 and require a committed design bundle.
export default function App() {
  const { t } = useTranslation()
  const vendor = useProviderStore((s) => s.vendor)
  const ready = useProviderStore((s) => s.isReady())
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('common.appName')}</h1>
      <p className="text-sm opacity-70">{t('common.tagline')}</p>
      <p className="text-xs opacity-60">
        {ready ? t('common.providerReady', { vendor }) : t('common.providerNotConfigured')}
      </p>
    </main>
  )
}
