import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useSessionStore } from '@/stores/sessionStore'
import { openSettings } from '@/lib/workspace/openSettings'
import { Sidebar } from './Sidebar'

/**
 * Off-canvas sidebar drawer (feature #16, WI-2 — designed Section D). Built on shadcn `Sheet`
 * (Radix Dialog), which owns focus-trap, Esc, scrim, scroll-lock, and restore-focus-to-trigger on
 * close. The hamburger IS the Sheet trigger. A controlled `open` lets the workspace drive the
 * drawer state; opening/creating a session (activeSessionId changes) closes the drawer and returns
 * to the work area. The 312px panel reuses the desktop Sidebar verbatim (`variant="drawer"`) and
 * adds a brand header (mark + wordmark + × close) and a Settings footer (the gear stays in the
 * header too). Tokens only (rule 30/31), localized via t().
 */
export interface SidebarDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The header hamburger; when omitted, the drawer renders its own default ☰ trigger. */
  trigger?: ReactNode
}

export function SidebarDrawer({ open, onOpenChange, trigger }: SidebarDrawerProps) {
  const { t } = useTranslation()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  // Opening or creating a session changes activeSessionId — close the drawer + return to the work
  // area (design Section D). Only acts while the drawer is open so a desktop selection is unaffected.
  useEffect(() => {
    if (open) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={t('header.openMenu')}
            className="flex size-[34px] flex-col items-center justify-center gap-[3px] rounded-[9px] border bg-[var(--bg-color)]"
          >
            <span aria-hidden className="h-[1.6px] w-[15px] rounded-sm bg-[var(--text-secondary)]" />
            <span aria-hidden className="h-[1.6px] w-[15px] rounded-sm bg-[var(--text-secondary)]" />
            <span aria-hidden className="h-[1.6px] w-[15px] rounded-sm bg-[var(--text-secondary)]" />
          </button>
        )}
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[312px] max-w-[85vw] gap-0 border-r bg-[var(--bg-color)] p-0 shadow-[var(--shadow-toast)]"
      >
        <SheetTitle className="sr-only">{t('sidebar.sessions')}</SheetTitle>
        <div className="flex items-center justify-between px-[14px] pb-2.5 pt-[13px]">
          <span className="flex items-center gap-2">
            <span className="relative inline-flex size-4 items-center justify-center rounded-full border-[1.5px] border-[var(--accent-primary)]">
              <span className="size-[6px] rounded-full bg-[var(--accent-primary)]" />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">{t('common.appName')}</span>
          </span>
          <button
            type="button"
            aria-label={t('header.closeMenu')}
            onClick={() => onOpenChange(false)}
            className="flex size-[30px] items-center justify-center rounded-lg border bg-[var(--bg-color)] text-[14px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Sidebar variant="drawer" />
        </div>
        <div className="border-t border-[var(--border-color)] px-[14px] py-[11px]">
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[12.5px] text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            <span aria-hidden className="size-[13px] shrink-0 rounded-full border-[1.5px] border-[var(--text-tertiary)]" />
            {t('sidebar.settings')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
