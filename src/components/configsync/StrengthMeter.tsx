// Purpose: the 4-segment passphrase-strength meter (#15 WI-6, design Section B). Pure presentation —
// takes a 0..4 level + a label and fills that many of 4 segments. Tokens only (rule 30/31): filled
// segments use the success fill, empties use the strong border; the caption tints success at level 4.

import { useTranslation } from 'react-i18next'
import { passphraseStrength } from '@/lib/config/passphraseStrength'

export function StrengthMeter({ passphrase }: { passphrase: string }) {
  const { t } = useTranslation()
  const { level, labelKey } = passphraseStrength(passphrase)
  return (
    <div className="mt-0.5 flex items-center gap-[9px]" aria-label={t('configSync.strength.label')}>
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-1 flex-1 rounded-[2px]"
            style={{ background: i < level ? 'var(--success-solid)' : 'var(--border-strong)' }}
          />
        ))}
      </div>
      <span
        className="font-mono text-[10px]"
        style={{ color: level >= 3 ? 'var(--success-hover)' : 'var(--text-tertiary)' }}
      >
        {t(labelKey)}
      </span>
    </div>
  )
}
