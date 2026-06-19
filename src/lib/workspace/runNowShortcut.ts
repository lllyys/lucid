// Purpose: the cross-platform "Run now" keyboard shortcut detector (feature #11). ⌘↵ on macOS,
// Ctrl↵ elsewhere — so a user can fire an immediate manual run (and cancel any pending auto-run)
// from the keyboard. Pure predicate (no DOM side effects) so it is fully unit-testable; the panel
// passes whether the platform is mac (derived once from navigator at the call site).

/** True iff the event is the platform's Run-now chord (Enter + the platform modifier). */
export function isRunNowShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>,
  isMac: boolean,
): boolean {
  if (e.key !== 'Enter') return false
  return isMac ? e.metaKey : e.ctrlKey
}
