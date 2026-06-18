// Purpose: auto-record a COMPLETED translate/polish run as a session task (feature #14). The decision +
// once-per-run dedup live here — a `src/lib/sessions/` function like `recordTask`, so the 100%-coverage
// gate (`src/lib/**`) covers the load-bearing logic; the `useAutoRecordTask` hook is a thin useEffect
// wrapper. Dedup is keyed by a MODULE-scoped map so it survives a component remount / StrictMode
// double-invoke (a per-instance `useRef` would reset and double-record). No API keys are involved — only
// the user's own source/result text (rule 65 §6).

import type { PanelId, PanelOp } from '@/stores/operationStore'
import type { Task } from '@/stores/sessionStore'
import { recordTask } from './recordTask'

// Last-recorded runId per panel. runId is monotonic per panel (bumped by run/reset/abort/fail), so a
// key never repeats → this is a collision-free once-per-run guard.
const lastRecorded = new Map<PanelId, number>()

/** Test seam: clear the per-panel last-recorded-runId map. */
export function __resetAutoRecord(): void {
  lastRecorded.clear()
}

/**
 * Record a completed run once per (panel, runId). Returns true iff it recorded. Records ONLY on a `done`
 * op (the `op.status !== 'done'` early-return narrows the union so `op.text` is available); skips a
 * repeat runId, an empty/whitespace source, and an empty (optionally cleaned) result. `cleanResult` lets
 * polish store the cleaned text (feature #96) rather than the raw model output.
 */
export function recordRunIfNew(
  panelId: PanelId,
  op: PanelOp,
  kind: Task['kind'],
  sourceText: string,
  cleanResult?: (raw: string) => string,
): boolean {
  if (op.status !== 'done') return false
  if (lastRecorded.get(panelId) === op.runId) return false
  if (sourceText.trim() === '') return false
  const result = cleanResult ? cleanResult(op.text) : op.text
  if (result.trim() === '') return false
  lastRecorded.set(panelId, op.runId)
  recordTask(kind, sourceText, result)
  return true
}
