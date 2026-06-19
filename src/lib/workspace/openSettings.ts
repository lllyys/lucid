// Purpose: a tiny window-event bridge so disconnected surfaces (the auto-run disabled/paused notices,
// feature #11) can ask the workspace to open the Settings dialog without prop-drilling or coupling to
// SettingsDialog's internal open state. SettingsDialog subscribes via onOpenSettings; any surface
// fires openSettings(). No payload — it just opens Settings on the active provider.

export const OPEN_SETTINGS_EVENT = 'lucid:open-settings'

/** Ask the workspace to open the Settings dialog. */
export function openSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))
}

/** Subscribe to open-settings requests; returns an unsubscribe fn. */
export function onOpenSettings(handler: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, handler)
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler)
}
