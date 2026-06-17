// Purpose: the inline, non-blocking sync error banner (#9, WI-9d, design surface F). Reads the live
// syncStore status via a selector (AGENTS.md — never destructure) and renders a banner ONLY for the three
// actionable failure states the design draws — unreachable / auth-error / conflict; every other state
// renders null (the pill + connected card carry the rest). Mirrors SyncStatusCard's tone→token mapping
// (rule 30/31 — tokens only, no hardcoded colors) and localizes every string via t() (rule 66 §5). Pure
// presentation: the actions come from props so the app shell owns the controller wiring.

import { useTranslation } from 'react-i18next'
import { useSyncStore, type SyncStatus } from '@/stores/syncStore'

type BannerTone = 'danger' | 'warn'

/** Tone → design tokens (mirrors SyncStatusCard.TONE; AA-safe ink tokens, lift in dark per rule 34). */
const TONE: Record<BannerTone, { border: string; bg: string; fg: string }> = {
  danger: { border: 'var(--danger-border)', bg: 'var(--error-bg)', fg: 'var(--error-color)' },
  warn: { border: 'var(--warning-border)', bg: 'var(--warning-bg)', fg: 'var(--warning)' },
}

interface BannerView {
  tone: BannerTone
  icon: string
  titleKey: string
  bodyKey: string
  /** A filled (vs. outlined) action button — the design fills the auth "Update token" CTA. */
  filled: boolean
  action: { labelKey: string; handler: 'onRetry' | 'onOpenSettings' }
}

const VIEWS: Partial<Record<SyncStatus, BannerView>> = {
  unreachable: {
    tone: 'danger',
    icon: '!',
    titleKey: 'sync.banner.unreachableTitle',
    bodyKey: 'sync.banner.unreachableBody',
    filled: false,
    action: { labelKey: 'sync.banner.retry', handler: 'onRetry' },
  },
  'auth-error': {
    tone: 'danger',
    icon: '⚿',
    titleKey: 'sync.banner.authTitle',
    bodyKey: 'sync.banner.authBody',
    filled: true,
    action: { labelKey: 'sync.banner.updateToken', handler: 'onOpenSettings' },
  },
  conflict: {
    tone: 'warn',
    icon: '⚠',
    titleKey: 'sync.banner.conflictTitle',
    bodyKey: 'sync.banner.conflictBody',
    filled: false,
    action: { labelKey: 'sync.banner.details', handler: 'onOpenSettings' },
  },
}

export interface SyncErrorBannerProps {
  /** Force an immediate sync cycle — the "Retry now" action on the unreachable banner. */
  onRetry: () => void
  /** Open Settings · Sync — the "Update token" / "Details" actions on the auth / conflict banners. */
  onOpenSettings: () => void
}

export function SyncErrorBanner({ onRetry, onOpenSettings }: SyncErrorBannerProps) {
  const { t } = useTranslation()
  const status = useSyncStore((s) => s.status)

  const view = VIEWS[status]
  if (!view) return null // every non-actionable state renders nothing (non-blocking surface)

  const tone = TONE[view.tone]
  const handlers = { onRetry, onOpenSettings }

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
          onClick={handlers[view.action.handler]}
          className="shrink-0 rounded-[9px] border px-[13px] py-2 font-sans text-[12px] font-semibold focus-visible:outline-2"
          style={
            view.filled
              ? ({ borderColor: 'transparent', background: tone.fg, color: 'var(--on-accent)', outlineColor: tone.fg } as React.CSSProperties)
              : ({ borderColor: tone.border, background: 'var(--bg-color)', color: tone.fg, outlineColor: tone.fg } as React.CSSProperties)
          }
        >
          {t(view.action.labelKey)}
        </button>
      </div>
    </div>
  )
}
