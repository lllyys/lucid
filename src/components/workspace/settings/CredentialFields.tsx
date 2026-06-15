// Purpose: the Settings credential variants for the VIEWED provider (feature #5 WI-6a — #29 design).
// Three shapes: local Ollama → a "no key needed" card; custom → a base-URL field + an OPTIONAL key
// (user decision #5/#7/#29 — keyless self-hosted OR a keyed proxy); a named remote vendor → a required
// API-key panel. The key is held in memory only, never logged (rule 65 §5); the copy says exactly
// that. Validation is a SHAPE typo-guard (apiKey.ts), not auth.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { maskKey, validateKeyShape, keyPrefixHint } from '@/lib/providers/apiKey'
import { presentationFor } from '@/lib/providers/providerPresentation'
import type { Vendor } from '@/providers/types'

interface CredentialFieldsProps {
  vendor: Vendor
  savedKey: string
  baseUrl: string
  /** The active provider's live key was rejected at request time (a 401 op) — shows a "rejected" hint. */
  rejected: boolean
  /** Persist a key for the viewed vendor ('' clears). The parent routes active-vendor changes through applyKeyChange. */
  onSaveKey: (key: string) => void
  onSaveUrl: (url: string) => void
}

function KeyPanel({
  vendor,
  savedKey,
  optional,
  rejected,
  onSaveKey,
}: {
  vendor: Vendor
  savedKey: string
  optional: boolean
  rejected: boolean
  onSaveKey: (key: string) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [errorKey, setErrorKey] = useState('')
  const masked = maskKey(savedKey)
  const hasKey = savedKey.trim() !== ''
  const prefix = keyPrefixHint(vendor)
  const label = t(presentationFor(vendor).labelKey)
  // A runtime 401 is the authoritative "invalid key"; show it unless the user is mid-edit with a shape error.
  const alertMsg = errorKey ? t(errorKey, { provider: label }) : rejected ? t('settings.keyRejected') : ''

  const save = () => {
    if (!optional) {
      const res = validateKeyShape(vendor, draft)
      if (!res.ok) {
        setErrorKey(res.messageKey ?? 'settings.keyRequired')
        return
      }
    }
    setErrorKey('')
    onSaveKey(draft.trim())
    setDraft('')
    setReveal(false)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {hasKey && (
        <div className="flex items-center gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
          <span className="flex-1 font-mono text-[12.5px] tracking-[0.02em] text-[var(--text-color)]">{masked}</span>
          <span className="rounded-md bg-[var(--success-bg)] px-1.5 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--success)]">
            {t('settings.savedBadge')}
          </span>
          <button
            type="button"
            onClick={() => onSaveKey('')}
            className="rounded-lg border bg-[var(--bg-color)] px-2.5 py-[5px] text-[11.5px] text-[var(--error-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('settings.clear')}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
          {t('settings.keyLabel')}{' '}
          <span className="text-[var(--text-disabled)]">
            · {optional ? t('settings.keyOptional') : t('settings.keyPrefixHint', { prefix: prefix || '…' })}
          </span>
        </span>
        <div className="flex items-center gap-2 rounded-[11px] border bg-[var(--bg-color)] py-1 pl-3 pr-1 focus-within:border-[var(--accent-primary)]">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setErrorKey('')
            }}
            placeholder={t('settings.keyPlaceholder')}
            aria-label={t('settings.keyLabel')}
            spellCheck={false}
            className="flex-1 border-none bg-transparent py-1.5 font-mono text-[13px] text-[var(--text-color)] outline-none"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="rounded-md px-2 py-1.5 font-mono text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {reveal ? t('settings.hide') : t('settings.reveal')}
          </button>
          <button
            type="button"
            onClick={save}
            aria-label={t('settings.save') + ' ' + label}
            className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-[7px] text-[12.5px] font-semibold text-[var(--on-accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('settings.save')}
          </button>
        </div>
        {alertMsg && (
          <span role="alert" className="text-[11.5px] text-[var(--error-color)]">
            {alertMsg}
          </span>
        )}
      </div>
    </div>
  )
}

export function CredentialFields({ vendor, savedKey, baseUrl, rejected, onSaveKey, onSaveUrl }: CredentialFieldsProps) {
  const { t } = useTranslation()
  const isLocal = presentationFor(vendor).isLocal // ollama
  const isCustom = vendor === 'custom'

  if (isLocal) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-start gap-2.5 rounded-[13px] border border-[var(--border-color)] bg-[var(--success-bg)] p-3.5">
          <span className="mt-1 text-[7px] text-[var(--success)]">⬤</span>
          <span className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-[var(--text-color)]">{t('settings.noKeyTitle')}</span>
            <span className="text-[12px] leading-[1.55] text-[var(--text-secondary)]">{t('settings.noKeyBody')}</span>
          </span>
        </div>
        <div className="flex items-start gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
          <span className="text-[13px] text-[var(--success)]">🔒</span>
          <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">{t('settings.privacyLocal')}</span>
        </div>
      </div>
    )
  }

  const label = t(presentationFor(vendor).labelKey)
  return (
    <div className="flex flex-col gap-3.5">
      {isCustom && <CustomBaseUrl baseUrl={baseUrl} onSaveUrl={onSaveUrl} />}
      <KeyPanel vendor={vendor} savedKey={savedKey} optional={isCustom} rejected={rejected} onSaveKey={onSaveKey} />
      <div className="flex items-start gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
        <span className="text-[13px] text-[var(--text-tertiary)]">🔒</span>
        <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
          {t('settings.memoryNote', { provider: label })}
        </span>
      </div>
    </div>
  )
}

function CustomBaseUrl({ baseUrl, onSaveUrl }: { baseUrl: string; onSaveUrl: (url: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(baseUrl)
  const saved = baseUrl.trim() !== ''
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        {t('settings.baseUrlLabel')} <span className="text-[var(--text-disabled)]">· {t('settings.baseUrlCompat')}</span>
      </span>
      <div className="flex items-center gap-2 rounded-[11px] border bg-[var(--bg-color)] py-1 pl-3 pr-1 focus-within:border-[var(--accent-primary)]">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('settings.baseUrlPlaceholder')}
          aria-label={t('settings.baseUrlLabel')}
          spellCheck={false}
          className="flex-1 border-none bg-transparent py-1.5 font-mono text-[13px] text-[var(--text-color)] outline-none"
        />
        <button
          type="button"
          onClick={() => onSaveUrl(draft.trim())}
          aria-label={t('settings.save') + ' ' + t('settings.baseUrlLabel')}
          className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-[7px] text-[12.5px] font-semibold text-[var(--on-accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('settings.save')}
        </button>
      </div>
      {saved && (
        <span className="font-mono text-[10.5px] text-[var(--success)]">{t('settings.baseUrlSaved', { url: baseUrl })}</span>
      )}
    </div>
  )
}
