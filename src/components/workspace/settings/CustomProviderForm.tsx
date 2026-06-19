// Purpose: the Settings add/edit form for ONE custom OpenAI-compatible provider (#10 WI-3, design
// Section B). Label / Base URL / Model / optional API key (Show toggle + the in-memory-only note).
// Validation is the pure `customProviderForm` logic: a duplicate label (via the store's `uniqueLabel`
// predicate, injected) or a scheme-less URL is flagged; Add/Save stays disabled until the form is
// valid. Add-mode Test MATERIALIZES the custom (the per-custom probe is keyed by id), so it requires
// the SAME full validity as Add (label-unique + URL + model) — not just a valid URL. On submit the
// parent calls addCustomProvider / updateCustomProvider. The key is held in memory only (rule 65 §5).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestResult } from '@/stores/providerStore'
import { isValidBaseUrl, customFormValid } from '@/lib/providers/customProviderForm'
import { ConnectionPanel } from './ConnectionPanel'

export interface CustomFormValues {
  label: string
  baseUrl: string
  model: string
}

interface CustomProviderFormProps {
  mode: 'add' | 'edit'
  /** The custom provider's id when editing — used by `uniqueLabel` to exclude this row. */
  editId?: string
  /** Prefilled values when editing. */
  initial?: CustomFormValues
  /** Trim + case-insensitive label uniqueness across the OTHER customs (the store's `uniqueLabel`). */
  uniqueLabel: (label: string, exceptId?: string) => boolean
  /** Submit the trimmed values (parent → addCustomProvider / updateCustomProvider). */
  onSubmit: (values: CustomFormValues) => void
  onCancel: () => void
  /** Run a connection test against the CURRENT draft URL/model/key (allowed once the URL is valid). */
  onTest: (draft: CustomFormValues) => void
  /** The connection-test outcome to show in the inline card (the active/edited custom's testResult). */
  testResult: TestResult
  /** The current in-memory key value (edit shows the saved one; add starts empty). */
  keyValue: string
  /** Persist the draft key as the user types it (parent → setApiKey on the custom / a staged add key). */
  onSetKey: (key: string) => void
}

const FIELD =
  'w-full border-none bg-transparent p-0 font-mono text-[12.5px] text-[var(--text-color)] outline-none'
const FIELD_BOX =
  'rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-2.5 focus-within:border-[var(--accent-primary)]'

export function CustomProviderForm({
  mode,
  editId,
  initial,
  uniqueLabel,
  onSubmit,
  onCancel,
  onTest,
  testResult,
  keyValue,
  onSetKey,
}: CustomProviderFormProps) {
  const { t } = useTranslation()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [reveal, setReveal] = useState(false)

  const labelOk = uniqueLabel(label, editId)
  const urlOk = isValidBaseUrl(baseUrl)
  const valid = customFormValid({ label, baseUrl, model }, (l) => uniqueLabel(l, editId))
  // Errors show only once the field is non-empty (no error on a pristine blank form).
  const labelError = label.trim() !== '' && !labelOk
  const urlError = baseUrl.trim() !== '' && !urlOk

  const draft = (): CustomFormValues => ({ label: label.trim(), baseUrl: baseUrl.trim(), model: model.trim() })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">
          {mode === 'add' ? t('settings.newCustomTitle') : t('settings.editCustomTitle', { label: initial?.label ?? '' })}
        </span>
        <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">{t('settings.customCompat')}</span>
      </div>

      {mode === 'edit' && <ConnectionPanel result={testResult} onTest={() => onTest(draft())} />}

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {t('settings.customLabel')}
        </span>
        <div className={FIELD_BOX} style={labelError ? { borderColor: 'var(--error-color)' } : undefined}>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('settings.customLabelPlaceholder')}
            aria-label={t('settings.customLabel')}
            spellCheck={false}
            className={FIELD.replace('font-mono', 'font-sans text-[13.5px]')}
          />
        </div>
        {labelError && (
          <span role="alert" className="text-[11.5px] text-[var(--error-color)]">
            {t('error.duplicateLabel', { label: label.trim() })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {t('settings.baseUrlLabel')}
        </span>
        <div className={FIELD_BOX} style={urlError ? { borderColor: 'var(--error-color)' } : undefined}>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t('settings.baseUrlPlaceholder')}
            aria-label={t('settings.baseUrlLabel')}
            spellCheck={false}
            className={FIELD}
          />
        </div>
        {urlError && (
          <span role="alert" className="text-[11.5px] text-[var(--error-color)]">
            {t('error.badBaseUrl')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[170px] flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('settings.model')}
          </span>
          <div className={FIELD_BOX}>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t('settings.customModelPlaceholder')}
              aria-label={t('settings.model')}
              spellCheck={false}
              className={FIELD}
            />
          </div>
        </div>
        <div className="flex min-w-[170px] flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('settings.keyLabel')} <span className="text-[var(--text-disabled)]">· {t('settings.keyOptional')}</span>
          </span>
          <div className="flex items-center gap-1.5 rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] py-1 pl-3 pr-1.5 focus-within:border-[var(--accent-primary)]">
            <input
              type={reveal ? 'text' : 'password'}
              value={keyValue}
              onChange={(e) => onSetKey(e.target.value)}
              aria-label={t('settings.keyLabel')}
              spellCheck={false}
              className="flex-1 border-none bg-transparent py-1.5 font-mono text-[12.5px] tracking-[0.05em] text-[var(--text-color)] outline-none"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="rounded-md px-2 py-1.5 font-mono text-[10.5px] text-[var(--text-tertiary)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {reveal ? t('settings.hide') : t('settings.reveal')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-[10px] border border-dashed border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
        <span className="mt-px text-[12px] text-[var(--text-tertiary)]">🔒</span>
        <span className="font-mono text-[10px] leading-[1.6] text-[var(--text-tertiary)]">
          {t('settings.customKeyMemoryNote')}
        </span>
      </div>

      <div className="flex items-center gap-2.5 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('settings.cancel')}
        </button>
        {mode === 'add' && (
          <button
            type="button"
            onClick={() => onTest(draft())}
            disabled={!valid}
            className="flex-1 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-2.5 text-[13px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('settings.testConnection')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSubmit(draft())}
          disabled={!valid}
          className="flex-1 rounded-[10px] bg-[var(--accent-primary)] px-3 py-2.5 text-[13px] font-semibold text-[var(--on-accent)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {mode === 'add' ? t('settings.addProvider') : t('settings.saveProvider')}
        </button>
      </div>
    </div>
  )
}
