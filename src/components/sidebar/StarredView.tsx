import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStarredStore, searchStarred, type StarredItem } from '@/stores/starredStore'

/**
 * Starred review tab (feature #22, WI-4 — designed Section C/D). A searchable list of starred
 * word- and sentence-translations (the personal review list; NOT the Glossary), each opening a
 * per-item detail with an Unstar action. Mirrors SessionsView's list/search/detail/empty chrome.
 * Search matches BOTH halves (source + translation, CJK-safe via the store's `searchStarred`).
 * Pure store interactions — consumes the shipped, sync-wired starredStore via selectors; never
 * mutates it beyond star()/unstar(). RTL-aware (per-item `dir`); CJK rows ellipsize on the
 * character (`truncate`), never on a word boundary.
 */

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur'])
const LANG: Record<string, string> = { en: 'EN', zh: '中', ar: 'AR', he: 'HE', ja: '日', ko: '한', fr: 'FR', es: 'ES', de: 'DE' }
const LANG_FULL: Record<string, string> = { en: 'EN', zh: '中文', ar: 'AR', he: 'HE', ja: '日本語', ko: '한국어' }
const short = (c: string) => LANG[c] ?? (c ? c.toUpperCase() : '')
const full = (c: string) => LANG_FULL[c] ?? (c ? c.toUpperCase() : '')
const dirOf = (c: string) => (RTL_LANGS.has(c) ? 'rtl' : undefined)

export function StarredView() {
  const { t } = useTranslation()
  const items = useStarredStore((s) => s.items)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const open = openId === null ? null : items.find((i) => i.id === openId) ?? null

  if (open) return <Detail item={open} onBack={() => setOpenId(null)} />

  const visible = searchStarred(items, query)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-0 flex-col gap-2 px-3 pb-2.5">
        <div className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 focus-within:border-[var(--accent-ink)]">
          <span className="text-[12px] text-[var(--text-tertiary)]">⌕</span>
          <input
            aria-label={t('starred.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('starred.search')}
            className="flex-1 border-none bg-transparent text-[12.5px] text-[var(--text-color)] outline-none"
          />
        </div>
        {items.length > 0 && query.trim() === '' && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            {t('starred.count', { count: items.length })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-auto px-2 pb-3">
        {items.length === 0 ? (
          <Empty />
        ) : visible.length === 0 ? (
          <NoResults query={query} onClear={() => setQuery('')} />
        ) : (
          visible.map((item) => <Row key={item.id} item={item} onOpen={() => setOpenId(item.id)} />)
        )}
      </div>
    </div>
  )
}

/** A single starred row — a serif `a` badge for a word, a `¶` badge for a sentence. */
function Row({ item, onOpen }: { item: StarredItem; onOpen: () => void }) {
  const isWord = item.kind === 'word'
  const pair = `${short(item.sourceLang)}→${short(item.targetLang)}`
  const meta = isWord ? `${item.translation} · ${pair}` : `→ ${item.translation} · ${pair}`
  return (
    <button
      type="button"
      dir={dirOf(item.sourceLang)}
      onClick={onOpen}
      className="flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-start hover:bg-[var(--hover-bg)]"
    >
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] ${
          isWord
            ? 'bg-[var(--accent-bg)] font-serif italic text-[var(--accent-ink)]'
            : 'bg-[var(--accent-subtle)] text-[var(--accent-ink)]'
        }`}
      >
        {isWord ? 'a' : '¶'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate ${isWord ? 'font-serif text-[14px] font-semibold' : 'text-[12.5px] font-medium'} text-[var(--text-color)]`}>
          {item.source}
          {isWord && item.ipa ? <span className="ml-1.5 font-mono text-[10.5px] font-normal text-[var(--accent-ink)]">{item.ipa}</span> : null}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{meta}</span>
      </span>
      <span aria-hidden className="shrink-0 text-[14px] text-[var(--accent-ink)]">★</span>
    </button>
  )
}

/** Per-item detail — word: translation + meaning; sentence: source → translation. */
function Detail({ item, onBack }: { item: StarredItem; onBack: () => void }) {
  const { t } = useTranslation()
  const isWord = item.kind === 'word'
  const unstar = () => {
    useStarredStore.getState().unstar(item.id)
    onBack()
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" dir={dirOf(item.sourceLang)}>
      <div className="flex flex-0 flex-col gap-2.5 px-3 pb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-color)]"
        >
          ‹ {t('starred.allStarred')}
        </button>
        <div className="flex items-baseline gap-2">
          <span className={`min-w-0 truncate ${isWord ? 'font-serif text-[20px] font-semibold' : 'text-[13px] font-semibold'} text-[var(--text-color)]`}>
            {isWord ? item.source : t('starred.sentenceType')}
          </span>
          {isWord && item.ipa && <span className="font-mono text-[12px] text-[var(--accent-ink)]">{item.ipa}</span>}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          {full(item.sourceLang)} → {full(item.targetLang)}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pb-3">
        {!isWord && (
          <Shelf label={t('starred.sourceLabel')}>
            <p className="m-0 font-serif text-[15px] leading-[1.6] text-[var(--text-secondary)]">{item.source}</p>
          </Shelf>
        )}
        <Shelf label={t('starred.translationLabel')}>
          <p className="m-0 font-serif text-[16px] leading-[1.6] text-[var(--text-color)]">{item.translation}</p>
        </Shelf>
        {isWord && item.meaning && (
          <Shelf label={t('starred.meaningLabel')}>
            <p className="m-0 text-[12.5px] leading-[1.62] text-[var(--text-secondary)]">{item.meaning}</p>
          </Shelf>
        )}
      </div>

      <div className="flex-0 border-t px-3 py-2.5">
        <button
          type="button"
          onClick={unstar}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
        >
          <span aria-hidden className="text-[13px] text-[var(--accent-ink)]">★</span>
          {t('starred.unstar')}
        </button>
      </div>
    </div>
  )
}

function Shelf({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</span>
      {children}
    </div>
  )
}

function Empty() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <span
        aria-hidden
        className="flex size-[46px] items-center justify-center rounded-[13px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[21px] text-[var(--accent-ink)]"
      >
        ☆
      </span>
      <span className="text-[13.5px] font-semibold text-[var(--text-secondary)]">{t('starred.empty')}</span>
      <span className="max-w-[28ch] font-mono text-[10.5px] leading-[1.65] text-[var(--text-tertiary)]">{t('starred.emptyBody')}</span>
    </div>
  )
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <span aria-hidden className="flex size-[42px] items-center justify-center rounded-[12px] bg-[var(--bg-tertiary)] text-[17px] text-[var(--text-disabled)]">
        ⌕
      </span>
      <span className="text-[13px] font-semibold text-[var(--text-color)]">{t('starred.noResultsTitle', { query })}</span>
      <span className="max-w-[26ch] font-mono text-[10.5px] leading-[1.6] text-[var(--text-tertiary)]">{t('starred.noResults')}</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-color)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-color)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
      >
        {t('starred.clearSearch')}
      </button>
    </div>
  )
}
