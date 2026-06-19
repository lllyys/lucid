// Purpose: the NON-blocking config-sync error banner (#15 WI-6, design Section E). Reads the live
// `useConfigSyncStore.syncError` via a selector (AGENTS.md — never destructure) and renders ONE inline
// banner for a background save failure once unlocked; renders null when syncError is null (the
// workspace stays usable). Its retry comes from props so the app shell owns the controller wiring
// (controller.retrySync() / retry()). Tokens + t() only (rules 30/31/66 §5).

import { useTranslation } from 'react-i18next'
import { useConfigSyncStore, type ConfigSyncErrorCode } from '@/lib/config/configSyncController'

type Tone = 'danger' | 'warn'

interface BannerView {
  tone: Tone
  icon: string
  titleKey: string
  bodyKey: string
  /** The action-button label per state (design Section E: How / Re-enter / Retry / Retry). */
  actionKey: string
}

const VIEWS: Record<ConfigSyncErrorCode, BannerView> = {
  insecureContext: {
    tone: 'warn',
    icon: '⚠',
    titleKey: 'configSync.banner.insecureTitle',
    bodyKey: 'configSync.banner.insecureBody',
    actionKey: 'configSync.banner.insecureAction',
  },
  wrongPassphraseOrCorrupt: {
    tone: 'danger',
    icon: '⚿',
    titleKey: 'configSync.banner.wrongPassphraseTitle',
    bodyKey: 'configSync.banner.wrongPassphraseBody',
    actionKey: 'configSync.banner.wrongPassphraseAction',
  },
  configUnreachable: {
    tone: 'danger',
    icon: '!',
    titleKey: 'configSync.banner.unreachableTitle',
    bodyKey: 'configSync.banner.unreachableBody',
    actionKey: 'configSync.banner.retry',
  },
  configRequestFailed: {
    tone: 'danger',
    icon: '!',
    titleKey: 'configSync.banner.requestFailedTitle',
    bodyKey: 'configSync.banner.requestFailedBody',
    actionKey: 'configSync.banner.retry',
  },
}

const TONE: Record<Tone, { border: string; bg: string; fg: string }> = {
  danger: { border: 'var(--danger-border)', bg: 'var(--error-bg)', fg: 'var(--error-color)' },
  warn: { border: 'var(--warning-border)', bg: 'var(--warning-bg)', fg: 'var(--warning)' },
}

export interface ConfigSyncBannerProps {
  /** Re-attempt the failed background save (the app wires this to controller.retrySync()). */
  onRetry: () => void
}

export function ConfigSyncBanner({ onRetry }: ConfigSyncBannerProps) {
  const { t } = useTranslation()
  const syncError = useConfigSyncStore((s) => s.syncError)
  if (syncError === null) return null

  const view = VIEWS[syncError]
  const tone = TONE[view.tone]
  // Per-state action label (design Section E): insecure → "How", wrong-passphrase → "Re-enter", the
  // transport errors → "Retry". The handler is the app-wired onRetry for all.
  const actionKey = view.actionKey

  return (
    <div className="px-5 pt-3">
      <div
        className="flex items-start gap-[13px] rounded-[13px] border p-[14px_16px]"
        style={{ borderColor: tone.border, background: tone.bg }}
      >
        <span
          aria-hidden
          className="mt-px inline-flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border bg-[var(--bg-color)] text-[12px]"
          style={{ borderColor: tone.border, color: tone.fg }}
        >
          {view.icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13.5px] font-semibold" style={{ color: tone.fg }}>
            {t(view.titleKey)}
          </span>
          <span className="text-[12px] leading-[1.55] text-[var(--text-secondary)]">{t(view.bodyKey)}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-[9px] border bg-[var(--bg-color)] px-[13px] py-2 font-sans text-[12px] font-semibold focus-visible:outline-2"
          style={{ borderColor: tone.border, color: tone.fg, outlineColor: tone.fg } as React.CSSProperties}
        >
          {t(actionKey)}
        </button>
      </div>
    </div>
  )
}
