import { useEffect } from 'react'
import { useOperationStore, type PanelId } from '@/stores/operationStore'
import type { Task } from '@/stores/sessionStore'
import { recordRunIfNew } from '@/lib/sessions/autoRecord'

/**
 * Auto-record a completed run for `panelId` as a session task (feature #14) — fires once per completed
 * run; the decision + dedup live in `recordRunIfNew` (module-scoped, remount-safe). `cleanResult` lets
 * the polish panel store the cleaned result (feature #96). Effect deps include `sourceText` so the
 * recorded source is the value present at the `done` render; the module-map dedup makes extra re-runs
 * idempotent (records once per runId).
 */
export function useAutoRecordTask(
  panelId: PanelId,
  kind: Task['kind'],
  sourceText: string,
  cleanResult?: (raw: string) => string,
): void {
  const op = useOperationStore((s) => s[panelId])
  useEffect(() => {
    recordRunIfNew(panelId, op, kind, sourceText, cleanResult)
  }, [op, sourceText, panelId, kind, cleanResult])
}
