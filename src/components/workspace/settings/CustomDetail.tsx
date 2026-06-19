// Purpose: the Settings detail pane for a CUSTOM provider (#10 WI-3, design Sections B/C/D). Header
// (the custom's label · endpoint · "Use for this workspace" / "In use" + a Remove button), the edit
// form (label/baseUrl/model/optional key + the per-custom connection-test card from WI-2), and the
// remove-confirm dialog. Activating a custom routes through setVendor({type:'custom',id}); the test
// uses the custom-id-aware useTestConnection. The key is in memory only (rule 65 §5).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProviderStore, type CustomProvider } from '@/stores/providerStore'
import { useTestConnection } from '@/hooks/useTestConnection'
import { CustomProviderForm, type CustomFormValues } from './CustomProviderForm'
import { RemoveCustomDialog } from './RemoveCustomDialog'

interface CustomDetailProps {
  custom: CustomProvider
  isActive: boolean
  /** The built-in the workspace falls back to if this active custom is removed (anthropic per WI-2). */
  fallbackLabel: string
  /** After a remove, the parent resets the viewed selection. */
  onRemoved: () => void
}

export function CustomDetail({ custom, isActive, fallbackLabel, onRemoved }: CustomDetailProps) {
  const { t } = useTranslation()
  const { test } = useTestConnection()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const save = (values: CustomFormValues) =>
    useProviderStore.getState().updateCustomProvider(custom.id, values)
  // Test the SAVED custom config (per-custom, custom-id-aware). The form's draft URL/model live in the
  // form; the test probes what's persisted on this custom (the design's per-custom connection card).
  const runTest = () => void test('custom', custom.id)
  const remove = () => {
    useProviderStore.getState().removeCustomProvider(custom.id)
    setConfirmOpen(false)
    onRemoved()
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[20px] font-semibold tracking-[-0.015em] text-[var(--text-color)]">
            {custom.label}
          </span>
          <span className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">{custom.baseUrl || '—'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isActive ? (
            <span className="inline-flex items-center gap-[7px] rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-[7px]">
              <span className="size-[7px] rounded-full bg-[var(--accent-primary)]" />
              <span className="text-[12px] font-semibold text-[var(--accent-ink)]">{t('settings.workspaceDefault')}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => useProviderStore.getState().setVendor({ type: 'custom', id: custom.id })}
              className="rounded-[9px] border border-[var(--accent-border)] bg-[var(--bg-color)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('settings.useForWorkspace')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-[7px] text-[12.5px] font-medium text-[var(--error-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--error-color)]"
          >
            {t('settings.remove')}
          </button>
        </div>
      </div>

      <CustomProviderForm
        key={`edit-${custom.id}`}
        mode="edit"
        editId={custom.id}
        initial={{ label: custom.label, baseUrl: custom.baseUrl, model: custom.model }}
        uniqueLabel={(label, exceptId) => useProviderStore.getState().uniqueLabel(label, exceptId)}
        onSubmit={save}
        onCancel={onRemoved}
        onTest={runTest}
        testResult={custom.testResult}
        keyValue={custom.key}
        onSetKey={(k) => useProviderStore.getState().setApiKey(k, undefined, custom.id)}
      />

      <div className="flex items-start gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
        <span className="text-[13px] text-[var(--text-tertiary)]">🔒</span>
        <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
          {t('settings.memoryNote', { provider: custom.label })}
        </span>
      </div>

      <RemoveCustomDialog
        open={confirmOpen}
        label={custom.label}
        isActive={isActive}
        fallbackLabel={fallbackLabel}
        onConfirm={remove}
        onOpenChange={setConfirmOpen}
      />
    </>
  )
}
