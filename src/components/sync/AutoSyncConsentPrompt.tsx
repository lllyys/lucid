// Purpose: the first-run sync-consent prompt (#21 WI-3 — designed bundle dev-docs/designs/lucid-sync-consent).
// Shown the first time the load-path probe finds a reachable same-origin, token-free sync server and the user
// hasn't decided. It asks ONCE, proactively, so existing local sessions are never silently uploaded (rule 65
// §6). Two explicit outcomes only — "Sync to my server" (→ controller.acceptAutoSync) and "Keep local-only"
// (→ controller.declineAutoSync); there is no quiet dismiss: Esc / outside-click = decline (the safe default),
// and initial focus opens on the decline button so uploading is never one stray Enter away.
//
// Surface: a centred shadcn Dialog on desktop/tablet, a bottom-sheet on phone (< 600, #16 responsive pattern).
// After accept it renders the design's connecting handoff (spinner + "Connecting… / Uploading…") while the
// SyncStatus is connecting|syncing, then auto-dismisses when it settles (idle → the #9 status pill takes over;
// error → the #9 SyncErrorBanner takes over). A `justAccepted` SESSION flag — not the durable autoSyncPrompt —
// gates the handoff so a later reload of an already-accepted user never re-shows it. Tokens only (rule 30/31),
// light + dark; every string via t() (rule 66 §5); RTL-safe via logical layout + i18n.dir(), with the server
// address pinned dir="ltr" inside an RTL row.

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useViewportTier } from '@/hooks/useViewportTier'
import { useSyncStore } from '@/stores/syncStore'
import type { SyncController } from '@/lib/sync/syncController'

type TitleCmp = ComponentType<{ className?: string; children: ReactNode }>
type DescCmp = ComponentType<{ className?: string; dir?: string; children: ReactNode }>

function ScopeRow({ on, text }: { on: boolean; text: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-[12px]" style={{ color: on ? 'var(--success)' : 'var(--text-tertiary)' }}>
        {on ? '✓' : '○'}
      </span>
      <span className="text-[12px]" style={{ color: on ? 'var(--text-color)' : 'var(--text-tertiary)' }}>
        {text}
      </span>
    </div>
  )
}

export function AutoSyncConsentPrompt({ controller }: { controller: SyncController }) {
  const { t, i18n } = useTranslation()
  const isPhone = useViewportTier() === 'phone'
  const showAutoPrompt = useSyncStore((s) => s.showAutoPrompt)
  const status = useSyncStore((s) => s.status)
  const declineRef = useRef<HTMLButtonElement>(null)
  // A SESSION-scoped flag: true only between an accept click and the status settling — so the connecting
  // handoff shows after accept WITHOUT re-appearing on a later reload (where autoSyncPrompt is 'accepted'
  // and resume() briefly drives status through connecting|syncing).
  const [justAccepted, setJustAccepted] = useState(false)

  const connecting = status === 'connecting' || status === 'syncing'
  const isConnecting = justAccepted && connecting
  const open = showAutoPrompt || isConnecting
  const dir = i18n.dir()
  const serverHost = window.location.host

  // Settle the handoff: once status leaves connecting|syncing (idle → synced, or an error → the #9 banner),
  // drop the session flag so the modal dismisses and hands off to the persistent #9 sync surfaces.
  useEffect(() => {
    if (justAccepted && !connecting) setJustAccepted(false)
  }, [justAccepted, connecting])

  const onAccept = () => {
    setJustAccepted(true)
    controller.acceptAutoSync()
  }

  const onOpenChange = (next: boolean) => {
    if (next || isConnecting) return // a half-finished connect is not a decision — it auto-dismisses on settle
    controller.declineAutoSync() // Esc / outside-click = Keep local-only (the safe default)
  }

  const consent = (Title: TitleCmp, Description: DescCmp) => (
    <>
      <div className="flex items-start gap-[14px] p-[20px_22px_14px]">
        <span
          aria-hidden
          className="relative flex size-[42px] shrink-0 items-center justify-center rounded-[12px] border"
          style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)' }}
        >
          <span className="flex size-[13px] items-center justify-center rounded-full border-[1.5px]" style={{ borderColor: 'var(--accent-primary)' }}>
            <span className="size-[5px] rounded-full" style={{ background: 'var(--accent-primary)' }} />
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[5px] pt-px">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--accent-ink)' }}>
            {t('sync.autoPrompt.detected')}
          </span>
          <Title className="text-[18px] font-semibold leading-[1.25] tracking-[-0.015em]">
            {t('sync.autoPrompt.title')}
          </Title>
        </div>
      </div>

      <div className="flex flex-col gap-[14px] px-[22px] pb-1">
        <Description className="m-0 text-[13px] leading-[1.65]" >
          {t('sync.autoPrompt.body')}
        </Description>

        <div
          className="flex items-center gap-[11px] rounded-[12px] border p-[11px_13px]"
          style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-canvas)' }}
        >
          <span aria-hidden className="size-[9px] shrink-0 rounded-full" style={{ background: 'var(--success)' }} />
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span dir="ltr" className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px]" style={{ color: 'var(--text-color)' }}>
              {serverHost}
            </span>
            <span className="font-mono text-[9.5px]" style={{ color: 'var(--text-tertiary)' }}>
              {t('sync.autoPrompt.serverMeta')}
            </span>
          </div>
          <span
            className="shrink-0 rounded-[7px] border p-[4px_8px] font-mono text-[9px] uppercase tracking-[0.05em]"
            style={{ color: 'var(--accent-ink)', background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)' }}
          >
            {t('sync.autoPrompt.serverBadge')}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.07em]" style={{ color: 'var(--text-tertiary)' }}>
            {t('sync.autoPrompt.scopeTitle')}
          </span>
          <div className="flex flex-col gap-[7px]">
            <ScopeRow on text={t('sync.autoPrompt.scopeSessions')} />
            <ScopeRow on text={t('sync.autoPrompt.scopeGlossary')} />
            <ScopeRow on text={t('sync.autoPrompt.scopeKeywords')} />
            <ScopeRow on={false} text={t('sync.autoPrompt.apiKeysNever')} />
          </div>
        </div>

        <div
          className="flex items-start gap-[9px] rounded-[12px] border border-dashed p-[11px_13px]"
          style={{ borderColor: 'var(--accent-dash)', background: 'var(--accent-subtle)' }}
        >
          <span aria-hidden className="mt-px shrink-0 text-[13px] leading-none" style={{ color: 'var(--accent-ink)' }}>
            🔒
          </span>
          <span className="text-[11.5px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
            {t('sync.autoPrompt.footnote')}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-[9px] p-[18px_22px_22px]">
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center justify-center rounded-[12px] border-none p-[13px_16px] font-sans text-[14px] font-semibold focus-visible:outline-2"
          style={{ background: 'var(--accent-primary)', color: 'var(--on-accent)', outlineColor: 'var(--accent-ink)' }}
        >
          {t('sync.autoPrompt.accept')}
        </button>
        <button
          ref={declineRef}
          type="button"
          onClick={() => controller.declineAutoSync()}
          className="flex items-center justify-center rounded-[12px] border p-[12px_16px] font-sans text-[13.5px] font-semibold focus-visible:outline-2"
          style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-color)', color: 'var(--text-secondary)', outlineColor: 'var(--accent-ink)' }}
        >
          {t('sync.autoPrompt.decline')}
        </button>
        <span className="pt-[2px] text-center font-mono text-[9.5px]" style={{ color: 'var(--text-tertiary)' }}>
          {t('sync.autoPrompt.askedOnce')}
        </span>
      </div>
    </>
  )

  const handoff = (Title: TitleCmp, Description: DescCmp) => (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-[13px] p-[28px_24px_18px] text-center">
        <span
          aria-hidden
          className="inline-block size-[44px] animate-spin rounded-full border-[2.4px] [border-top-color:transparent]"
          style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
        />
        <div className="flex flex-col gap-[5px]">
          <Title className="text-[16px] font-semibold tracking-[-0.01em]">{t('sync.autoPrompt.connecting')}</Title>
          <Description dir="ltr" className="font-mono text-[11px]" >{serverHost}</Description>
        </div>
      </div>
      <div
        className="m-[0_24px] flex flex-col gap-px overflow-hidden rounded-[12px] border"
        style={{ borderColor: 'var(--border-color)', background: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-[10px] p-[11px_14px]" style={{ background: 'var(--bg-canvas)' }}>
          <span aria-hidden className="text-[12px]" style={{ color: 'var(--success)' }}>✓</span>
          <span className="text-[12px]" style={{ color: 'var(--text-color)' }}>{t('sync.autoPrompt.reached')}</span>
        </div>
        <div className="flex items-center gap-[10px] p-[11px_14px]" style={{ background: 'var(--bg-canvas)' }}>
          <span
            aria-hidden
            className="inline-block size-[11px] animate-spin rounded-full border-[1.5px] [border-top-color:transparent]"
            style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
          />
          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{t('sync.autoPrompt.uploading')}</span>
        </div>
      </div>
      <div className="p-[18px_24px_22px]" />
    </div>
  )

  const sharedSurface = 'gap-0 overflow-hidden border-[var(--border-strong)] bg-[var(--bg-color)] p-0 text-[var(--text-color)] [box-shadow:var(--shadow-menu)]'

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          dir={dir}
          showCloseButton={false}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            declineRef.current?.focus()
          }}
          className={`rounded-t-[22px] ${sharedSurface}`}
        >
          <div className="flex justify-center pb-1 pt-2.5">
            <span aria-hidden className="h-1 w-[38px] rounded-[3px]" style={{ background: 'var(--border-dashed)' }} />
          </div>
          {isConnecting ? handoff(SheetTitle, SheetDescription) : consent(SheetTitle, SheetDescription)}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          declineRef.current?.focus()
        }}
        className={`sm:max-w-[460px] ${sharedSurface}`}
      >
        {isConnecting ? handoff(DialogTitle, DialogDescription) : consent(DialogTitle, DialogDescription)}
      </DialogContent>
    </Dialog>
  )
}
