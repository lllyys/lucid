// Purpose: the first-device "set passphrase" card (#15 WI-6, design Section B). Passphrase + strength
// meter + confirm (must match) + the no-recovery warning + the privacy panel. "Encrypt & enable sync"
// → setPassphrase(pass) (blocked until confirm matches a non-empty passphrase); "Not now" → workLocalOnly.
// SECURITY: the passphrase lives in local React state only and is handed to the controller verbatim
// (rule 65 §5); nothing here logs or persists it. Tokens + t() only (rules 30/31/66 §5).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigSyncController } from '@/lib/config/configSyncController'
import { PassphraseField } from './PassphraseField'
import { StrengthMeter } from './StrengthMeter'

export function SetPassphraseCard({ controller }: { controller: ConfigSyncController }) {
  const { t } = useTranslation()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')

  const matches = pass.length > 0 && pass === confirm
  const onSubmit = () => {
    if (!matches) return
    void controller.setPassphrase(pass)
  }

  return (
    <div className="flex flex-wrap items-start justify-center gap-[34px]">
      {/* the set-passphrase card */}
      <div className="w-[480px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--popup-shadow)]">
        <div className="flex items-start gap-[13px] border-b border-[var(--border-color)] p-[22px_24px_18px]">
          <span
            aria-hidden
            className="flex size-9 flex-none items-center justify-center rounded-[11px] border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[15px] text-[var(--accent-ink)]"
          >
            🔐
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">
              {t('configSync.set.title')}
            </span>
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
              {t('configSync.set.subtitle')}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-[17px] p-[20px_24px_24px]">
          <p className="m-0 text-[12.5px] leading-[1.65] text-[var(--text-secondary)]">
            {t('configSync.set.body')}
          </p>

          <div className="flex flex-col gap-[7px]">
            <PassphraseField label={t('configSync.set.passphraseLabel')} value={pass} onChange={setPass} />
            <StrengthMeter passphrase={pass} />
          </div>

          <PassphraseField
            label={t('configSync.set.confirmLabel')}
            value={confirm}
            onChange={setConfirm}
            invalid={confirm.length > 0 && !matches}
            adornment={
              <span
                aria-label={matches ? t('configSync.set.confirmMatch') : t('configSync.set.confirmMismatch')}
                className="flex-none px-[9px] text-[14px]"
                style={{ color: matches ? 'var(--success)' : 'var(--text-tertiary)' }}
              >
                {matches ? '✓' : '·'}
              </span>
            }
          />

          {/* no-recovery warning */}
          <div className="flex items-start gap-[11px] rounded-[13px] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-[13px_15px]">
            <span
              aria-hidden
              className="mt-px flex size-6 flex-none items-center justify-center rounded-[7px] border border-[var(--warning-border)] bg-[var(--bg-color)] text-[13px] text-[var(--warning)]"
            >
              ⚠
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[12.5px] font-semibold text-[var(--warning)]">
                {t('configSync.set.noRecoveryTitle')}
              </span>
              <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
                {t('configSync.set.noRecoveryBody')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!matches}
              className="flex-1 cursor-pointer rounded-[11px] border-none bg-[var(--accent-primary)] p-[12px_16px] font-sans text-[13.5px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('configSync.set.submit')}
            </button>
            <button
              type="button"
              onClick={() => controller.workLocalOnly()}
              className="flex-none cursor-pointer rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[12px_16px] font-sans text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('configSync.set.notNow')}
            </button>
          </div>
        </div>
      </div>

      {/* privacy-model side panel */}
      <div className="flex w-[320px] max-w-full flex-col gap-[9px] pt-[26px]">
        <div className="overflow-hidden rounded-[13px] border border-[var(--border-color)] bg-[var(--bg-color)]">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] p-[12px_15px]">
            <span className="text-[12.5px] font-semibold text-[var(--text-color)]">
              {t('configSync.set.privacyHeading')}
            </span>
            <span className="rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-bg)] p-[3px_7px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--accent-ink)]">
              {t('configSync.set.privacyBadge')}
            </span>
          </div>
          <div className="flex items-center gap-2.5 border-b border-[var(--border-color)] p-[11px_15px]">
            <span aria-hidden className="flex-none text-[12px] text-[var(--accent-ink)]">●</span>
            <span className="text-[11.5px] text-[var(--text-secondary)]">{t('configSync.set.privacyPassphrase')}</span>
          </div>
          <div className="flex items-center gap-2.5 border-b border-[var(--border-color)] p-[11px_15px]">
            <span aria-hidden className="flex-none text-[12px] text-[var(--success)]">✓</span>
            <span className="text-[11.5px] text-[var(--text-secondary)]">{t('configSync.set.privacyConfig')}</span>
          </div>
          <div className="flex items-center gap-2.5 p-[11px_15px]">
            <span aria-hidden className="flex-none text-[12px] text-[var(--text-tertiary)]">○</span>
            <span className="text-[11.5px] text-[var(--text-tertiary)]">{t('configSync.set.privacyServer')}</span>
          </div>
        </div>
        <div className="flex items-start gap-[9px] rounded-[12px] border border-dashed border-[var(--border-dashed)] bg-[var(--bg-canvas)] p-[13px_15px]">
          <span aria-hidden className="mt-px flex-none font-mono text-[11px] text-[var(--accent-ink)]">i</span>
          <span className="font-mono text-[10px] leading-[1.65] text-[var(--text-tertiary)]">
            {t('configSync.set.privacyNote')}
          </span>
        </div>
      </div>
    </div>
  )
}
