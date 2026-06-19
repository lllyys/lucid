// Purpose: the Settings detail pane for a BUILT-IN provider (#5/#6 — unchanged behavior, extracted in
// #10 WI-3 so SettingsDialog can switch between the built-in pane and the custom add/edit form). Header
// (label · endpoint · "Use for this workspace" / "In use"), the test-connection card, the model
// control, the credential fields, the stat tiles, and the privacy posture. Per-vendor keys are in
// memory only (rule 65 §5); an active-vendor key change routes through applyKeyChange in the parent.

import { useTranslation } from 'react-i18next'
import { useProviderStore, type TestResult } from '@/stores/providerStore'
import { presentationFor } from '@/lib/providers/providerPresentation'
import type { Vendor } from '@/providers/types'
import { ModelControl } from './ModelControl'
import { CredentialFields } from './CredentialFields'
import { ConnectionPanel, StatTiles } from './ConnectionPanel'

// Display-only endpoint host per vendor (cosmetic header label — not the factory URL).
const HOST: Record<Vendor, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  gemini: 'generativelanguage.googleapis.com',
  ollama: 'localhost:11434',
  custom: '',
}

interface BuiltinDetailProps {
  vendor: Vendor
  isActive: boolean
  apiKey: string
  model: string
  testResult: TestResult
  rejected: boolean
  onTest: () => void
  onActivate: () => void
  onSaveKey: (key: string) => void
}

export function BuiltinDetail({
  vendor,
  isActive,
  apiKey,
  model,
  testResult,
  rejected,
  onTest,
  onActivate,
  onSaveKey,
}: BuiltinDetailProps) {
  const { t } = useTranslation()
  const pres = presentationFor(vendor)
  const label = t(pres.labelKey)

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[20px] font-semibold tracking-[-0.015em] text-[var(--text-color)]">{label}</span>
          <span className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">{HOST[vendor]}</span>
        </div>
        {isActive ? (
          <span className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-[7px]">
            <span className="size-[7px] rounded-full bg-[var(--accent-primary)]" />
            <span className="text-[12px] font-semibold text-[var(--accent-ink)]">{t('settings.workspaceDefault')}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onActivate}
            className="shrink-0 rounded-[9px] border border-[var(--accent-border)] bg-[var(--bg-color)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
          >
            {t('settings.useForWorkspace')}
          </button>
        )}
      </div>

      <ConnectionPanel result={testResult} onTest={onTest} />

      <ModelControl
        key={`model-${vendor}`}
        vendor={vendor}
        model={model}
        onPick={(m) => useProviderStore.getState().setModel(m, vendor)}
      />

      <CredentialFields key={`cred-${vendor}`} vendor={vendor} savedKey={apiKey} rejected={rejected} onSaveKey={onSaveKey} />

      <StatTiles result={testResult} />

      <div className="flex items-start gap-2.5 rounded-[11px] border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2.5">
        <span className="text-[13px]" style={{ color: pres.isLocal ? 'var(--success)' : 'var(--text-tertiary)' }}>
          🔒
        </span>
        <span className="text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
          {pres.isLocal ? t('settings.privacyLocal') : t('settings.memoryNote', { provider: label })}
        </span>
      </div>
    </>
  )
}
