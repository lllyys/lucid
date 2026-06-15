// Purpose: record a completed (accepted) translate/polish result as a task in the active session
// (feature #3, WI-7). The single decoupling point between the translate/polish panels and the
// session store — the panels call recordTask(...) at their accept handlers instead of mutating the
// store directly (per the Gate-2 audit). If no session is active, one is created so an accepted
// result is never silently dropped. Session text is the user's own, stored locally (rule 65 §6).

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
