// Purpose: a labelled passphrase input with a Show/Hide reveal toggle (#15 WI-6, design Sections A/B).
// SECURITY (rule 65 §5): the value lives only in the parent's React state and is handed to the
// controller verbatim — this field never logs, persists, or autocompletes it. Tokens only (rule 30/31).

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface PassphraseFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  /** Visual error framing (the wrong-passphrase / mismatch state). */
  invalid?: boolean
  placeholder?: string
  /** Right-side adornment instead of the Show/Hide toggle (e.g. the confirm ✓). */
  adornment?: React.ReactNode
}

export function PassphraseField({ label, value, onChange, invalid, placeholder, adornment }: PassphraseFieldProps) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const id = useId()
  return (
    <div className="flex flex-col gap-[7px]">
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]"
      >
        {label}
      </label>
      <div
        className="flex items-center gap-2 rounded-[11px] border bg-[var(--bg-color)] p-[4px_5px_4px_12px]"
        style={{ borderColor: invalid ? 'var(--danger-border)' : 'var(--border-strong)' }}
      >
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 border-none bg-transparent py-[9px] font-mono text-[13px] text-[var(--text-color)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        {adornment ?? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="cursor-pointer rounded-[6px] border-none bg-transparent px-[9px] py-[7px] font-mono text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-color)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {revealed ? t('configSync.unlock.hide') : t('configSync.unlock.show')}
          </button>
        )}
      </div>
    </div>
  )
}
