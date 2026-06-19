// Purpose: a tiny platform probe (feature #11) so the Run-now shortcut can use ⌘ on macOS and Ctrl
// elsewhere. Read once at the call site. Defensive against a missing navigator (SSR / odd hosts).

/** True iff the current platform is macOS (so ⌘ is the Run-now modifier; Ctrl otherwise). */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}
