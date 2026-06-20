// Purpose: the polish-goal selector (feature #18) — a single-select radiogroup of pill chips
// (Clarity / Grammar / Tone / Concise, design order). Presentational only: PolishPanel owns the goal
// state + wiring (buildPolishRequest override, resetPolish, auto-run). Arrow keys move + select with
// wrap (roving tabindex, radiogroup pattern). Tokens + t() only (rules 30/31/33/66 §5).
import { useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PolishGoal } from '@/providers/types'

// The committed lucid-workspace design's chip order — NOT POLISH_GOALS (clarity, tone, grammar, concise),
// which would swap the middle two.
const GOAL_ORDER: readonly PolishGoal[] = ['clarity', 'grammar', 'tone', 'concise']

export interface GoalChipsProps {
  value: PolishGoal
  onChange: (goal: PolishGoal) => void
  disabled?: boolean
}

export function GoalChips({ value, onChange, disabled = false }: GoalChipsProps) {
  const { t } = useTranslation()
  const btns = useRef<Partial<Record<PolishGoal, HTMLButtonElement | null>>>({})

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = GOAL_ORDER.indexOf(value)
    const n = GOAL_ORDER.length
    const next = e.key === 'ArrowRight' ? GOAL_ORDER[(i + 1) % n] : GOAL_ORDER[(i - 1 + n) % n]
    onChange(next)
    btns.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={t('polish.goal.label')} className="flex items-center gap-1.5" onKeyDown={onKeyDown}>
      {GOAL_ORDER.map((g) => {
        const active = g === value
        return (
          <button
            key={g}
            ref={(el) => {
              btns.current[g] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(g)}
            className={`rounded-full border px-[13px] py-1.5 font-sans text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)] ${
              active
                ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]'
                : 'border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
            }`}
          >
            {t(`polish.goal.${g}`)}
          </button>
        )
      })}
    </div>
  )
}
