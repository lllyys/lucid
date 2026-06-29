import { useTranslation } from 'react-i18next'
import type { ProviderError } from '@/providers/types'
import type { DefineSense } from '@/lib/lookup/parseDefine'

/** The word's display language pair label, e.g. "EN → 中文" (design header sub-line). */
const NATIVE: Record<string, string> = { en: 'EN', zh: '中文', ar: 'AR', he: 'HE' }
function langLabel(code?: string): string {
  if (!code) return ''
  return NATIVE[code] ?? code.toUpperCase()
}

export interface LookupCardData {
  word: string
  ipa: string
  partOfSpeech: string
  translations: string[]
  meaning: string
  senses: DefineSense[]
  status: 'idle' | 'streaming' | 'done' | 'error'
  error?: ProviderError
  sentence: string
  sourceLang?: string
  targetLang?: string
}

export interface PlayState {
  /** 'play' = enabled, 'stop' = currently speaking, 'loading' = transient (voices not ready),
   *  'novoice' = permanently unavailable, 'hidden' = no audio control (error state). */
  kind: 'play' | 'stop' | 'loading' | 'novoice' | 'hidden'
  onToggle: () => void
}

/** Shared mono-uppercase shelf label. */
function ShelfLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
      {children}
    </span>
  )
}

/** The play / stop / no-voice control in the header (design Section A · §2, §F). */
function PlayButton({ play, lang }: { play: PlayState; lang?: string }) {
  const { t } = useTranslation()
  if (play.kind === 'hidden') return null
  const base =
    'flex size-[30px] items-center justify-center rounded-[9px] border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]'
  if (play.kind === 'stop') {
    return (
      <span className="relative inline-flex size-[30px] shrink-0">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[9px] border border-[var(--accent-primary)] [animation:lucid-speak-ring_1.1s_ease-out_infinite]"
        />
        <button
          type="button"
          aria-label={t('lookup.stop')}
          onClick={play.onToggle}
          className={`${base} relative gap-[2px] border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--on-accent)]`}
        >
          {[0, 0.15, 0.3].map((d, i) => (
            <span
              key={i}
              aria-hidden
              className="w-[2px] rounded-[1px] bg-current [animation:lucid-eq-bars_0.6s_ease-in-out_infinite]"
              style={{ height: [8, 13, 9][i], animationDelay: `${d}s` }}
            />
          ))}
        </button>
      </span>
    )
  }
  const disabled = play.kind === 'loading' || play.kind === 'novoice'
  const label = play.kind === 'novoice' ? t('lookup.noVoiceLabel', { lang: langLabel(lang) }) : t('lookup.speak')
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={play.onToggle}
      className={`${base} ${
        disabled
          ? 'cursor-not-allowed border-[var(--border-strong)] bg-[var(--bg-tertiary)] text-[var(--text-disabled)]'
          : 'border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]'
      }`}
    >
      <span
        aria-hidden
        className="ml-[2px] size-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-current"
      />
    </button>
  )
}

/**
 * The inner lookup surface (feature #20, WI-7) — shared by the desktop popover and the phone
 * bottom-sheet. Renders all six states from the lookup store fields: loading (streaming),
 * loaded, playing, no-audio, error, and long/multi-sense. Token-driven (rule 30/34); the meaning
 * is an aria-live=polite region so the definition is announced once settled, not per token.
 * `showContext` adds the design's context line (desktop only).
 */
export function LookupCard({
  data,
  play,
  onClose,
  onRetry,
  onProviders,
  showContext,
  voicesReady,
  hasVoice,
  star,
}: {
  data: LookupCardData
  play: PlayState
  onClose: () => void
  onRetry: () => void
  onProviders: () => void
  showContext: boolean
  voicesReady: boolean
  hasVoice: boolean
  /** The star toggle slot (feature #22, WI-3 — design Section B). The host fills it with a
   *  StarButton built from the lookup fields, only at `done`; absent while loading/error. */
  star?: React.ReactNode
}) {
  const { t } = useTranslation()
  const pair = `${langLabel(data.sourceLang)} → ${langLabel(data.targetLang)}`
  const isError = data.status === 'error'
  const isLoading = data.status === 'streaming'

  const CloseBtn = (
    <button
      type="button"
      aria-label={t('lookup.close')}
      onClick={onClose}
      className="flex size-[30px] items-center justify-center rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] text-[15px] leading-none text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
    >
      ×
    </button>
  )

  if (isError) {
    return (
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-2.5 p-[14px_14px_11px]">
          <div className="flex min-w-0 flex-col gap-[5px]">
            <span className="font-serif text-[23px] font-semibold leading-tight text-[var(--text-color)]">{data.word}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">{pair}</span>
          </div>
          {CloseBtn}
        </div>
        <div className="flex flex-col items-center gap-2.5 border-t border-[var(--border-color)] bg-[var(--bg-canvas)] px-4 pb-[18px] pt-[18px] text-center">
          <span
            aria-hidden
            className="flex size-[34px] items-center justify-center rounded-[10px] border border-[var(--danger-border)] bg-[var(--error-bg)] text-[17px] font-semibold text-[var(--error-color)]"
          >
            !
          </span>
          <span className="text-[13.5px] font-semibold text-[var(--text-color)]">{t('lookup.noDefinition')}</span>
          <span className="max-w-[30ch] font-mono text-[11px] leading-[1.55] text-[var(--text-tertiary)]">
            {t(data.error?.messageKey ?? 'lookup.errorBody')}
          </span>
          <div className="mt-0.5 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-[15px] py-2 text-[12.5px] font-medium text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('lookup.retry')}
            </button>
            <button
              type="button"
              onClick={onProviders}
              className="rounded-[9px] px-2.5 py-2 text-[12.5px] text-[var(--text-tertiary)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t('lookup.providers')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* header: word + IPA + part-of-speech/status, play + close */}
      <div className="flex items-start justify-between gap-2.5 p-[14px_14px_11px]">
        <div className="flex min-w-0 flex-col gap-[5px]">
          <div className="flex flex-wrap items-baseline gap-[9px]">
            <span className="font-serif text-[23px] font-semibold leading-tight text-[var(--text-color)]">{data.word}</span>
            {data.ipa && <span className="font-mono text-[12.5px] text-[var(--accent-ink)]">{data.ipa}</span>}
          </div>
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--accent-ink)]">
              <span aria-hidden className="size-[6px] rounded-full bg-[var(--accent-primary)] [animation:lucid-pulse_1.2s_ease-in-out_infinite]" />
              {t('lookup.lookingUp')}
            </span>
          ) : play.kind === 'stop' ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--accent-ink)]">
              <span aria-hidden className="size-[6px] rounded-full bg-[var(--accent-primary)]" />
              {t('lookup.speaking')}
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
              {[data.partOfSpeech, data.senses.length > 1 ? t('lookup.senses', { count: data.senses.length }) : '', pair]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {star}
          <PlayButton play={play} lang={data.sourceLang} />
          {CloseBtn}
        </div>
      </div>

      {/* translation shelf */}
      <div className="flex flex-col gap-1 px-[14px] pb-3">
        <ShelfLabel>{t('lookup.translation')}</ShelfLabel>
        {data.translations.length > 0 ? (
          <span className="font-serif text-[17px] text-[var(--text-color)]">{data.translations.join(' · ')}</span>
        ) : (
          <span aria-hidden className="h-[14px] w-3/4 rounded-[5px] bg-[var(--bg-tertiary)] [animation:lucid-skel_1.4s_ease-in-out_infinite]" />
        )}
      </div>

      {/* meaning (aria-live) — or the multi-sense list */}
      {data.senses.length > 1 ? (
        <div className="flex flex-col gap-[11px] border-t border-[var(--border-color)] bg-[var(--bg-canvas)] px-[14px] pb-4 pt-3" aria-live="polite">
          {data.senses.map((s, i) => (
            <div
              key={i}
              className={
                i === 0
                  ? 'flex flex-col gap-[5px] rounded-[11px] border border-[var(--accent-border)] bg-[var(--bg-color)] p-[11px_12px]'
                  : 'flex flex-col gap-1 p-0.5'
              }
            >
              <div className="flex items-center gap-2">
                <span className="rounded-[5px] bg-[var(--accent-subtle)] px-1.5 py-px font-mono text-[10px] text-[var(--accent-ink)]">
                  {i === 0 ? t('lookup.senseInContext', { n: i + 1 }) : t('lookup.sense', { n: i + 1 })}
                </span>
                <span className="font-serif text-[15px] text-[var(--text-color)]">{s.gloss}</span>
              </div>
              <p className={`m-0 text-[12.5px] leading-[1.6] ${i === 0 ? 'text-[var(--text-color)]' : 'text-[var(--text-secondary)]'}`}>
                {s.meaning}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 border-t border-[var(--border-color)] bg-[var(--bg-canvas)] px-[14px] pb-3 pt-[11px]" aria-live="polite">
          <ShelfLabel>{t('lookup.inThisSentence')}</ShelfLabel>
          {data.meaning ? (
            <p className="m-0 text-[13px] leading-[1.62] text-[var(--text-color)]">{data.meaning}</p>
          ) : (
            <span aria-hidden className="h-[9px] w-[78%] rounded-[5px] bg-[var(--bg-tertiary)] [animation:lucid-skel_1.4s_ease-in-out_infinite]" />
          )}
        </div>
      )}

      {/* no-voice note (design Section B · no-audio) */}
      {voicesReady && !hasVoice && (
        <div className="flex items-center gap-2 border-t border-[var(--border-color)] px-[14px] py-[9px]">
          <span aria-hidden className="flex size-[14px] shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-[9px] text-[var(--text-tertiary)]">
            i
          </span>
          <span className="text-[11px] leading-[1.5] text-[var(--text-secondary)]">
            {t('lookup.noVoice', { lang: langLabel(data.sourceLang) })}
          </span>
        </div>
      )}

      {/* context line (desktop only) */}
      {showContext && data.sentence && (
        <div className="flex items-center gap-2 border-t border-[var(--border-color)] px-[14px] py-2.5">
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">{t('lookup.context')}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-serif text-[12.5px] text-[var(--text-tertiary)]">
            {data.sentence}
          </span>
        </div>
      )}
    </div>
  )
}
