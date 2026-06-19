import { useEffect, useState } from 'react'
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
import { presentationFor } from '@/lib/providers/providerPresentation'
import { customFormValid } from '@/lib/providers/customProviderForm'
import { applyKeyChange } from '@/lib/providers/keyChange'
import type { Vendor } from '@/providers/types'
import { useTestConnection } from '@/hooks/useTestConnection'
import { onOpenSettings } from '@/lib/workspace/openSettings'
import { ProviderRail, type RailSelection } from './settings/ProviderRail'
import { BuiltinDetail } from './settings/BuiltinDetail'
import { CustomDetail } from './settings/CustomDetail'
import { CustomProviderForm, type CustomFormValues } from './settings/CustomProviderForm'

/**
 * Provider Settings — the 880px provider surface. A left rail (ProviderRail) lists the built-in vendors
 * and a Custom-providers group; the right pane configures the VIEWED selection — a built-in vendor
 * (BuiltinDetail), one of the N user-defined custom providers (CustomDetail), or the add form
 * (CustomProviderForm). The active workspace provider is separate from the viewed one (switch with
 * "Use for this workspace"; a custom activates via setVendor({type:'custom',id}) — #10 WI-3). Keys are
 * in memory only, never persisted/logged (rule 65 §5); an active-vendor key change routes through
 * applyKeyChange (aborts in-flight runs, clears a stale invalidKey).
 */

export function SettingsDialog() {
  const { t } = useTranslation()
  const activeVendor = useProviderStore((s) => s.vendor)
  const activeCustomId = useProviderStore((s) => s.activeCustomId)
  const apiKeys = useProviderStore((s) => s.apiKeys)
  const models = useProviderStore((s) => s.models)
  const testResults = useProviderStore((s) => s.testResults)
  const customProviders = useProviderStore((s) => s.customProviders)
  const { test } = useTestConnection()
  const translate = useOperationStore((s) => s.translate)
  const polish = useOperationStore((s) => s.polish)
  const draftTranslate = useOperationStore((s) => s.draftTranslate)

  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<RailSelection>({ kind: 'builtin', vendor: activeVendor })
  // The add form's staged optional key — there is no custom id until the provider is created, so the
  // draft key lives here and is passed to addCustomProvider on submit (kept in memory only — §5).
  const [addKey, setAddKey] = useState('')

  // Reset to the active provider's selection when (re)opening.
  const openOnActive = () => {
    const s = useProviderStore.getState()
    setSelection(s.vendor === 'custom' && s.activeCustomId ? { kind: 'custom', id: s.activeCustomId } : { kind: 'builtin', vendor: s.vendor })
    setAddKey('')
  }

  // Other surfaces (the auto-run disabled / paused notices, feature #11) can request Settings via the
  // openSettings() event bridge — open on the active provider, matching the trigger button's behavior.
  useEffect(
    () =>
      onOpenSettings(() => {
        openOnActive()
        setOpen(true)
      }),
    [],
  )

  // A runtime 401 on the active provider (any panel op left in invalidKey) is the authoritative
  // "key rejected" signal — surfaced only on the active vendor's credential panel.
  const runtimeInvalid = [translate, polish, draftTranslate].some(
    (op) => op.status === 'error' && op.error.kind === 'invalidKey',
  )

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) openOnActive() // open on the active provider
  }

  // Built-in rail status line (key-set / ready / no-key).
  const builtinStatus = (v: Vendor): string => {
    if (presentationFor(v).isLocal) return t('settings.statusReady')
    return apiKeys[v].trim() !== '' ? t('settings.statusKeySet') : t('settings.statusNoKey')
  }

  const onSaveBuiltinKey = (vendor: Vendor) => (key: string) => {
    if (vendor === useProviderStore.getState().vendor) applyKeyChange(key) // active: abort/reset + set/clear
    else if (key === '') useProviderStore.getState().clearKey(vendor)
    else useProviderStore.getState().setApiKey(key, vendor)
  }

  // Add-mode submit: mint the custom (with the staged key), then view it for editing/testing.
  const onAddSubmit = (values: CustomFormValues) => {
    const id = useProviderStore.getState().addCustomProvider({ ...values, key: addKey })
    setAddKey('')
    setSelection({ kind: 'custom', id })
  }
  // Add-mode Test materializes the custom (the per-custom probe is keyed by id), then views it. Because
  // it creates a real persisted record, it must pass the SAME validity as Add (label-unique + URL +
  // model) — the form's Test button is gated on `valid`; this guard is defense-in-depth so a non-unique
  // / incomplete draft can never mint a row that violates the uniqueness invariant.
  const onAddTest = (values: CustomFormValues) => {
    if (!customFormValid(values, (l) => useProviderStore.getState().uniqueLabel(l))) return
    const id = useProviderStore.getState().addCustomProvider({ ...values, key: addKey })
    setAddKey('')
    setSelection({ kind: 'custom', id })
    void test('custom', id)
  }

  const activeFallbackLabel = t(presentationFor('anthropic').labelKey)
  // The viewed custom (if any) — re-read from the live store map so edits/tests reflect immediately.
  const viewedCustom = selection.kind === 'custom' ? customProviders[selection.id] : undefined

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
        className="sm:max-w-[880px] gap-0 overflow-hidden border-[var(--border-color)] bg-[var(--bg-color)] p-0"
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
          <ProviderRail
            activeVendor={activeVendor}
            activeCustomId={activeCustomId}
            selection={selection}
            models={models}
            builtinStatus={builtinStatus}
            customProviders={customProviders}
            onSelect={setSelection}
          />

          {/* RIGHT DETAIL */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-5">
            {selection.kind === 'builtin' && (
              <BuiltinDetail
                vendor={selection.vendor}
                isActive={selection.vendor === activeVendor && activeCustomId === null}
                apiKey={apiKeys[selection.vendor]}
                model={models[selection.vendor]}
                testResult={testResults[selection.vendor]}
                rejected={selection.vendor === activeVendor && activeCustomId === null && runtimeInvalid}
                onTest={() => void test(selection.vendor)}
                onActivate={() => useProviderStore.getState().setVendor(selection.vendor)}
                onSaveKey={onSaveBuiltinKey(selection.vendor)}
              />
            )}

            {selection.kind === 'custom' && viewedCustom !== undefined && (
              <CustomDetail
                custom={viewedCustom}
                isActive={activeVendor === 'custom' && activeCustomId === viewedCustom.id}
                fallbackLabel={activeFallbackLabel}
                onRemoved={() => setSelection({ kind: 'builtin', vendor: useProviderStore.getState().vendor })}
              />
            )}

            {selection.kind === 'add' && (
              <CustomProviderForm
                mode="add"
                uniqueLabel={(label, exceptId) => useProviderStore.getState().uniqueLabel(label, exceptId)}
                onSubmit={onAddSubmit}
                onCancel={() => setSelection({ kind: 'builtin', vendor: useProviderStore.getState().vendor })}
                onTest={onAddTest}
                testResult={{ status: 'idle' }}
                keyValue={addKey}
                onSetKey={setAddKey}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
