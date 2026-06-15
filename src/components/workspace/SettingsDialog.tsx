import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useProviderStore } from '@/stores/providerStore'
import { useOperationStore } from '@/stores/operationStore'
import { configurablePresentations, presentationFor } from '@/lib/providers/providerPresentation'
import { applyKeyChange } from '@/lib/providers/keyChange'
import { resolveModel } from '@/providers/modelRegistry'
import type { Vendor } from '@/providers/types'
import { ModelControl } from './settings/ModelControl'
import { CredentialFields } from './settings/CredentialFields'

/**
 * Provider Settings — the redesigned 880px provider surface (feature #5 WI-6a — design #29). A left
 * rail lists every CONFIGURABLE provider (incl. custom); the right pane configures the VIEWED one
 * (separate from the active workspace vendor — switch with "Use for this workspace"). Per-vendor keys
 * are held in memory only, never persisted/logged (rule 65 §5). Changing the ACTIVE vendor's key
 * routes through `applyKeyChange` (aborts in-flight runs, clears a stale `invalidKey`). The
 * test-connection panel + stat tiles land in WI-6b.
 */

// Display-only endpoint host per vendor (cosmetic header label — not the factory URL).
const HOST: Record<Vendor, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  gemini: 'generativelanguage.googleapis.com',
  ollama: 'localhost:11434',
  custom: '',
}

export function SettingsDialog() {
  const { t } = useTranslation()
  const activeVendor = useProviderStore((s) => s.vendor)
  const apiKeys = useProviderStore((s) => s.apiKeys)
  const models = useProviderStore((s) => s.models)
  const baseUrl = useProviderStore((s) => s.baseUrl)
  const translate = useOperationStore((s) => s.translate)
  const polish = useOperationStore((s) => s.polish)
  const draftTranslate = useOperationStore((s) => s.draftTranslate)

  const [open, setOpen] = useState(false)
  const [viewVendor, setViewVendor] = useState<Vendor>(activeVendor)

  // A runtime 401 on the active provider (any panel op left in invalidKey) is the authoritative
  // "key rejected" signal — surfaced only on the active vendor's credential panel.
  const runtimeInvalid = [translate, polish, draftTranslate].some(
    (op) => op.status === 'error' && op.error.kind === 'invalidKey',
  )

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setViewVendor(useProviderStore.getState().vendor) // open on the active provider
  }

  const rows = configurablePresentations()
  const viewPres = presentationFor(viewVendor)
  const viewLabel = t(viewPres.labelKey)
  const isActive = viewVendor === activeVendor
  const endpoint = viewVendor === 'custom' ? baseUrl.trim() || '—' : HOST[viewVendor]

  const statusFor = (v: Vendor): string => {
    if (presentationFor(v).isLocal) return t('settings.statusReady')
    if (v === 'custom') return baseUrl.trim() !== '' ? t('settings.statusEndpointSet') : t('settings.statusNoEndpoint')
    return apiKeys[v].trim() !== '' ? t('settings.statusKeySet') : t('settings.statusNoKey')
  }
  // Design colors the rail status: local providers read "Ready" in green; remote/custom are
  // idle grey until the test-connection card (WI-6b) lights them up.
  const statusColor = (v: Vendor): string => (presentationFor(v).isLocal ? 'var(--success)' : 'var(--text-tertiary)')

  const onSaveKey = (key: string) => {
    if (viewVendor === useProviderStore.getState().vendor) applyKeyChange(key) // active: abort/reset + set/clear
    else if (key === '') useProviderStore.getState().clearKey(viewVendor)
    else useProviderStore.getState().setApiKey(key, viewVendor)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-[7px] rounded-md border bg-[var(--bg-color)] px-[10px] py-1.5 font-sans text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          <span className="h-[13px] w-[13px] rounded-full border-[1.5px] border-[var(--text-tertiary)]" />
          {t('header.settings')}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-w-[880px] gap-0 overflow-hidden border-[var(--border-color)] bg-[var(--bg-color)] p-0"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-[var(--border-color)] p-4 text-left">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-[16px] font-semibold text-[var(--text-color)]">
              {t('settings.title')}
            </DialogTitle>
            <DialogDescription className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              {t('settings.subtitle')}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t('settings.close')}
            className="flex size-[31px] items-center justify-center rounded-[9px] border bg-[var(--bg-color)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            ✕
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-[440px]">
          {/* LEFT RAIL */}
          <div className="flex w-[252px] shrink-0 flex-col gap-1 overflow-auto border-r border-[var(--border-color)] bg-[var(--bg-canvas)] p-3">
            <span className="px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
              {t('settings.providersHeading')}
            </span>
            {rows.map((p) => {
              const selected = p.vendor === viewVendor
              return (
                <button
                  key={p.vendor}
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => setViewVendor(p.vendor)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
                  style={
                    selected
                      ? { background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1px var(--accent-border)' }
                      : undefined
                  }
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: `var(${p.dotToken})` }} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-semibold text-[var(--text-color)]">{t(p.labelKey)}</span>
                    <span className="truncate font-mono text-[9.5px]" style={{ color: statusColor(p.vendor) }}>
                      {statusFor(p.vendor)} · {models[p.vendor] || resolveModel(p.vendor) || '—'}
                    </span>
                  </span>
                  {p.vendor === activeVendor && (
                    <span className="rounded-[5px] bg-[var(--accent-bg)] px-1.5 py-[3px] font-mono text-[8px] font-semibold uppercase tracking-[0.05em] text-[var(--accent-ink)]">
                      {t('settings.inUse')}
                    </span>
                  )}
                </button>
              )
            })}
            <span className="mt-auto px-2 pt-3 font-mono text-[11px] leading-[1.5] text-[var(--text-tertiary)]">
              {t('settings.keysMemoryFooter')}
            </span>
          </div>

          {/* RIGHT DETAIL */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[20px] font-semibold tracking-[-0.015em] text-[var(--text-color)]">
                  {viewLabel}
                </span>
                <span className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">{endpoint}</span>
              </div>
              {isActive ? (
                <span className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-[7px]">
                  <span className="size-[7px] rounded-full bg-[var(--accent-primary)]" />
                  <span className="text-[12px] font-semibold text-[var(--accent-ink)]">{t('settings.workspaceDefault')}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => useProviderStore.getState().setVendor(viewVendor)}
                  className="shrink-0 rounded-[9px] border border-[var(--accent-border)] bg-[var(--bg-color)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
                >
                  {t('settings.useForWorkspace')}
                </button>
              )}
            </div>

            <ModelControl
              key={`model-${viewVendor}`}
              vendor={viewVendor}
              model={models[viewVendor]}
              onPick={(m) => useProviderStore.getState().setModel(m, viewVendor)}
            />

            <CredentialFields
              key={`cred-${viewVendor}`}
              vendor={viewVendor}
              savedKey={apiKeys[viewVendor]}
              baseUrl={baseUrl}
              rejected={isActive && runtimeInvalid}
              onSaveKey={onSaveKey}
              onSaveUrl={(u) => useProviderStore.getState().setBaseUrl(u)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
