// Purpose: record a completed translate/polish run as a task in the active session. The single
// decoupling point between the translate/polish flows and the session store (per the feature-3 Gate-2
// audit). Originally called from the panels' accept handlers (feature #3, WI-7); since feature #14 it is
// invoked by `recordRunIfNew` (`./autoRecord.ts`) on a run's `done` transition — Accept now only commits
// to the editor. If no session is active, one is created so a completed result is never silently
// dropped. Session text is the user's own, stored locally (rule 65 §6).

import { useSessionStore, type Task } from '@/stores/sessionStore'

/** First non-empty line of the source, trimmed to ≤40 chars (with an ellipsis) — the task title. */
function deriveTitle(sourceText: string): string {
  const line = sourceText.trim().split('\n', 1)[0] || '' // '' for empty/whitespace-only source
  return line.length > 40 ? `${line.slice(0, 40)}…` : line
}

export function recordTask(kind: Task['kind'], sourceText: string, resultText: string): void {
  const store = useSessionStore.getState()
  if (store.activeSessionId === null) store.newSession() // ensure a destination for the task
  useSessionStore.getState().addTask({ kind, title: deriveTitle(sourceText), sourceText, resultText })
}
