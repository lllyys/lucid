import { useTranslation } from 'react-i18next'

/**
 * Phone-only Translate / Polish pane switcher (feature #16, WI-3 — designed Sections A/B/C). A
 * full-width segmented control that replaces the desktop stacked panels with a single active pane
 * (the Workspace keeps BOTH panels mounted and toggles visibility — this only reports the choice).
 *
 * a11y: `role="radiogroup"` + two `role="radio"` chips with `aria-checked` (the GoalChips #18 /
 * single-active precedent), roving tabindex (only the active chip is tabbable), and a visible
 * focus-visible ring (rule 33). The chips are ~36px tall visually but pad out to a ≥44px hit area.
 * Tokens only (rule 30/31): `--bg-tertiary` track, active = `--bg-color` + `var(--shadow-tab)`.
 */
export type WorkspacePane = 'translate' | 'polish'

const PANES: { value: WorkspacePane; labelKey: string }[] = [
  { value: 'translate', labelKey: 'workspace.paneTranslate' },
  { value: 'polish', labelKey: 'workspace.panePolish' },
]

export interface PaneSwitcherProps {
  value: WorkspacePane
  onChange: (pane: WorkspacePane) => void
}

export function PaneSwitcher({ value, onChange }: PaneSwitcherProps) {
  const { t } = useTranslation()
  return (
    <div className="shrink-0 border-b bg-[var(--bg-color)] px-3 py-[9px]">
      <div role="radiogroup" aria-label={t('workspace.paneSwitcher')} className="flex gap-0.5 rounded-[9px] bg-[var(--bg-tertiary)] p-[3px]">
        {PANES.map((pane) => {
          const active = pane.value === value
          return (
            <button
              key={pane.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(pane.value)}
              className={`flex-1 rounded-[7px] py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] ${
                active
                  ? 'bg-[var(--bg-color)] font-semibold text-[var(--text-color)] shadow-[var(--shadow-tab)]'
                  : 'font-medium text-[var(--text-tertiary)]'
              }`}
            >
              {t(pane.labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
