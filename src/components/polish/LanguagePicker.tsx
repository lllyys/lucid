import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The four languages the Polish pickers expose (feature #2) — the design's set. Codes are
 * accepted by resolveLanguage (lib/prompts), so a request built from them validates.
 */
export const POLISH_LANGS = [
  { code: 'zh', native: '中文' },
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'ja', native: '日本語' },
] as const

export function LanguagePicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (code: string) => void
  label: string
}) {
  const current = POLISH_LANGS.find((l) => l.code === value) ?? POLISH_LANGS[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex items-center gap-1.5 rounded-md border bg-[var(--bg-color)] px-2.5 py-[5px] text-[12.5px] font-medium hover:bg-[var(--hover-bg)]"
        >
          {current.native}
          <ChevronDown className="size-3 text-[var(--text-tertiary)]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {POLISH_LANGS.map((l) => (
          <DropdownMenuItem key={l.code} className="gap-2" onSelect={() => onChange(l.code)}>
            <span className="flex-1">{l.native}</span>
            {l.code === value && <Check className="size-3 text-[var(--accent-primary)]" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
