// Purpose: the returning-device unlock card (#15 WI-6, design Sections A + C). Default: passphrase +
// Show + "Unlock & load workspace" → unlock(pass) + "Forgot passphrase?" + the ciphertext-only note.
// When the BLOCKING `error` is set: `wrongPassphraseOrCorrupt` swaps an inline red status on the same
// card; `configUnreachable`/`configRequestFailed` swap the reachable-but-failed card variants with
// Retry → retry() + Work local-only → workLocalOnly(). SECURITY: the passphrase is local React state
// handed to the controller verbatim (rule 65 §5). Tokens + t() only (rules 30/31/66 §5).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigSyncController, ConfigSyncErrorCode } from '@/lib/config/configSyncController'
import { PassphraseField } from './PassphraseField'

// The unlock card is the modal over the dimmed workspace → the deepest lucid shadow token (rule 30/34).
const CARD = 'w-[404px] max-w-full overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-color)] shadow-[var(--shadow-toast)]'

/** The reachable-but-failed variants (unreachable / request-failed): a message + Retry + Work local-only. */
function TransportError({
  controller,
  code,
}: {
  controller: ConfigSyncController
  code: 'configUnreachable' | 'configRequestFailed'
}) {
  const { t } = useTranslation()
  const isUnreachable = code === 'configUnreachable'
  return (
    <div className={CARD}>
      <div className="flex flex-col gap-4 p-[24px_24px_22px]">
        <div className="flex flex-col items-center gap-[11px] text-center">
          <span
            aria-hidden
            className="flex size-10 flex-none items-center justify-center rounded-[11px] border border-[var(--danger-border)] bg-[var(--error-bg)] text-[17px] text-[var(--error-color)]"
          >
            {isUnreachable ? <span className="size-2.5 rounded-full bg-[var(--error-color)]" /> : '!'}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--error-color)]">
              {t(isUnreachable ? 'configSync.error.unreachableTitle' : 'configSync.error.requestFailedTitle')}
            </span>
            <span className="font-mono text-[10.5px] text-[var(--error-color)]">
              {t(isUnreachable ? 'configSync.error.unreachableSub' : 'configSync.error.requestFailedSub')}
            </span>
          </div>
        </div>
        <p className="m-0 text-center text-[12px] leading-[1.6] text-[var(--text-secondary)]">
          {t(isUnreachable ? 'configSync.error.unreachableBody' : 'configSync.error.requestFailedBody')}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => void controller.retry()}
            className="flex-1 cursor-pointer rounded-[11px] border-none bg-[var(--accent-primary)] p-3 font-sans text-[13px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t(isUnreachable ? 'configSync.error.retryNow' : 'configSync.error.retry')}
          </button>
          <button
            type="button"
            onClick={() => controller.workLocalOnly()}
            className="flex-none cursor-pointer rounded-[11px] border border-[var(--border-strong)] bg-[var(--bg-color)] p-[12px_16px] font-sans text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('configSync.error.workLocalOnly')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function UnlockCard({
  controller,
  error,
}: {
  controller: ConfigSyncController
  /** The BLOCKING error channel (Section C). null = the default unlock card. */
  error: ConfigSyncErrorCode | null
}) {
  const { t } = useTranslation()
  const [pass, setPass] = useState('')

  if (error === 'configUnreachable' || error === 'configRequestFailed') {
    return <TransportError controller={controller} code={error} />
  }

  const wrong = error === 'wrongPassphraseOrCorrupt'
  return (
    <div className={CARD}>
      <div className="flex flex-col gap-[18px] p-[26px_26px_22px]">
        <div className="flex flex-col items-center gap-[13px] text-center">
          <span
            aria-hidden
            className="flex size-[42px] flex-none items-center justify-center rounded-[12px] border text-[18px]"
            style={
              wrong
                ? { borderColor: 'var(--danger-border)', background: 'var(--error-bg)', color: 'var(--error-color)' }
                : { borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent-ink)' }
            }
          >
            🔒
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-color)]">
              {t('configSync.unlock.title')}
            </span>
            {!wrong && (
              <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
                {t('configSync.unlock.found')}
              </span>
            )}
          </div>
        </div>
        {!wrong && (
          <p className="m-0 text-center text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            {t('configSync.unlock.body')}
          </p>
        )}

        <div className="flex flex-col gap-[7px]">
          <PassphraseField
            label={t('configSync.unlock.passphraseLabel')}
            value={pass}
            onChange={setPass}
            invalid={wrong}
            placeholder={t('configSync.unlock.passphrasePlaceholder')}
          />
          {wrong && (
            <div className="flex items-start gap-[7px] pl-0.5">
              <span aria-hidden className="mt-px flex-none text-[11px] text-[var(--error-color)]">✕</span>
              <span className="text-[11.5px] leading-[1.55] text-[var(--error-color)]">
                <strong className="font-semibold">{t('configSync.error.wrongPassphraseTitle')}</strong>{' '}
                {t('configSync.error.wrongPassphraseBody')}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void controller.unlock(pass)}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[11px] border-none bg-[var(--accent-primary)] p-[13px_16px] font-sans text-[13.5px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {wrong ? t('configSync.error.tryAgain') : t('configSync.unlock.submit')}
        </button>

        <div className="flex items-center justify-between gap-2.5">
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10.5px] text-[var(--text-tertiary)] underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('configSync.unlock.forgot')}
          </button>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--success)]" />
            {t('configSync.unlock.ciphertextNote')}
          </span>
        </div>
      </div>
    </div>
  )
}
