import { useTranslation } from 'react-i18next'
import type { Task } from '@/stores/sessionStore'
import { resolveBidiDirection } from '@/lib/translation/bidi'
import { loadSourceIntoWorkspace } from '@/lib/workspace/loadSource'

/**
 * Read-only task detail (feature #25, WI-3 — designed bundle `lucid-session-task-read`). A layer inside
 * the Sessions sidebar mirroring the Starred detail (#22): a back link, a pinned header (kind badge +
 * direction + latency + age), the full Source/Result (translate) or Original/Polished + Keywords-kept
 * (polish) text, and a sticky action row (Copy result + Open in workspace). RENDER-ONLY — no edit
 * affordances on the text; editing happens after Open-in-workspace (#24, translate-target). The base
 * direction is resolved from the source text via `resolveBidiDirection` (UAX#9 first-strong, RTL-aware),
 * NOT from the translation route — so an Arabic source renders rtl even when no `sourceLang` is stored.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// Endonym/short code for the direction line; falls back to the uppercased code for any non-mapped lang.
const LANG: Record<string, string> = { en: 'EN', zh: '中', ja: '日', ko: '한', ar: 'AR', he: 'HE', fr: 'FR', es: 'ES', de: 'DE' }
const langLabel = (code: string): string => LANG[code] ?? code.toUpperCase()

/** Compact age token: "20m" / "2h" / "3d" (floored; <1min reads "0m"). Pure data, never prose. */
function formatAge(ageMs: number): string {
  const ms = Math.max(0, ageMs) // clamp a future createdAt (clock skew) to "now"
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`
  return `${Math.floor(ms / DAY)}d`
}

/** Run latency in seconds, one decimal: "1.5s". */
const formatLatency = (durationMs: number): string => `${(durationMs / 1000).toFixed(1)}s`

function Block({ label, dir, children }: { label: string; dir?: 'ltr' | 'rtl'; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</span>
      <p dir={dir} className="m-0 whitespace-pre-wrap break-words font-serif text-[15px] leading-[1.6] text-[var(--text-color)]">
        {children}
      </p>
    </div>
  )
}

export function TaskReadView({ task, sessionName, onBack }: { task: Task; sessionName: string; onBack: () => void }) {
  const { t } = useTranslation()
  const isTranslate = task.kind === 'translate'
  const hasResult = task.resultText !== ''
  const sourceDir = resolveBidiDirection(task.sourceText, 'auto')
  const resultDir = resolveBidiDirection(task.resultText, 'auto')
  // Guard the clipboard for SSR/jsdom + the missing-result edge (an interrupted run saved no result).
  const canCopy = hasResult && typeof navigator !== 'undefined' && !!navigator.clipboard

  const metaParts = [
    task.sourceLang && task.targetLang ? `${langLabel(task.sourceLang)} → ${langLabel(task.targetLang)}` : null,
    task.durationMs !== undefined ? formatLatency(task.durationMs) : null,
    t('task.read.ago', { value: formatAge(Date.now() - task.createdAt) }),
  ].filter((part): part is string => part !== null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-0 flex-col gap-2.5 px-3 pb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-color)]"
        >
          ‹ {sessionName}
        </button>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold"
            style={{
              background: isTranslate ? 'var(--accent-bg)' : 'var(--success-bg)',
              color: isTranslate ? 'var(--accent-ink)' : 'var(--success)',
            }}
          >
            {isTranslate ? '⇄' : '✦'}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13.5px] font-semibold text-[var(--text-color)]">
              {isTranslate ? t('task.read.translation') : t('task.read.polish')}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
              {metaParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>·</span>}
                  <span>{part}</span>
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pb-3">
        <Block label={isTranslate ? t('task.read.source') : t('task.read.original')} dir={sourceDir}>
          {task.sourceText}
        </Block>
        {hasResult ? (
          <Block label={isTranslate ? t('task.read.result') : t('task.read.polished')} dir={resultDir}>
            {task.resultText}
          </Block>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              {isTranslate ? t('task.read.result') : t('task.read.polished')}
            </span>
            <p className="m-0 rounded-[9px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-tertiary)] px-3 py-3 text-[12.5px] text-[var(--text-disabled)]">
              {t('task.read.noResult')}
            </p>
          </div>
        )}
        {!isTranslate && task.keywords && task.keywords.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              {t('task.read.keywords')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {task.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-md bg-[var(--accent-bg)] px-2 py-0.5 text-[11px] text-[var(--accent-ink)]"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-0 gap-2 border-t px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(task.resultText)}
          disabled={!canCopy}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden className="text-[13px]">
            ⧉
          </span>
          {t('task.read.copy')}
        </button>
        <button
          type="button"
          onClick={() => loadSourceIntoWorkspace(task.sourceText)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-2 text-[12px] font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('task.read.openInWorkspace')}
        </button>
      </div>
    </div>
  )
}
