import { useEffect } from 'react'
import { useOperationStore, type PanelId } from '@/stores/operationStore'
import type { Task } from '@/stores/sessionStore'
import { recordRunIfNew, type AutoRecordMeta } from '@/lib/sessions/autoRecord'

/**
 * Auto-record a completed run for `panelId` as a session task (feature #14) — fires once per completed
 * run; the decision + dedup live in `recordRunIfNew` (module-scoped, remount-safe). `cleanResult` lets
 * the polish panel store the cleaned result (feature #96). `meta` carries the read-view langs/keywords
 * (feature #25) the panels pass. Effect deps include `sourceText` + the PRIMITIVE meta fields (and a
 * stable join key for the `keywords` array, which the polish panel rebuilds each render) so a fresh
 * object/array reference can't trigger a needless every-render run; the module-map dedup keeps any extra
 * re-run idempotent (records once per runId).
 */
export function useAutoRecordTask(
  panelId: PanelId,
  kind: Task['kind'],
  sourceText: string,
  cleanResult?: (raw: string) => string,
  meta?: AutoRecordMeta,
): void {
  const op = useOperationStore((s) => s[panelId])
  const sourceLang = meta?.sourceLang
  const targetLang = meta?.targetLang
  const keywords = meta?.keywords
  // Stable primitive surrogate for the `keywords` array (fresh reference each render in the polish panel).
  const keywordsKey = keywords?.join(',')
  useEffect(() => {
    recordRunIfNew(panelId, op, kind, sourceText, cleanResult, { sourceLang, targetLang, keywords })
    // keywordsKey is the value-equality surrogate for the `keywords` array referenced in the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, sourceText, panelId, kind, cleanResult, sourceLang, targetLang, keywordsKey])
}
