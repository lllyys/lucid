// Purpose: the auto-on eligibility probe for #21 (workspace sync on by default for a token-free
// single-origin self-hosted server). `detectAutoSyncEligibility` awaits the injected `pull(0)` — in
// production `backend.pull` bound to `window.location.origin` with an empty token — and decides whether
// the served origin is a token-free single-origin sync server we may auto-connect to.
//
// The probe keys on the validated `backend.pull(0)` result, NOT a bare status, to kill both failure
// modes the Gate-2 audit found: a token-free server returns 200 + a real PullResult to `?since=0` (so a
// status check would false-negative on the handler's 400-without-since), and a generic SPA-fallback
// static host re-serving dist/ returns 200 + index.html for any path (HTML fails `isPullResult` →
// `badRequest`, so it does NOT false-positive). Pure logic over the injected `pull`; side-effect-free.

import type { SyncBackend } from './backend'

export interface AutoSyncEligibilityDeps {
  /** The token-free single-origin probe — `backend.pull` bound to the served origin (empty token). */
  pull: SyncBackend['pull']
}

/**
 * Eligible ⇔ `pull(0)` resolved to a real `PullResult` (`ok: true`) — a token-free single-origin server
 * answered the read-only `?since=0` cursor. Every error is ineligible: `auth` (a tokened server — stays
 * opt-in, no forced token drop), `badRequest` (an HTML/garbage body — a re-hosted dist/ with no real
 * backend), `unreachable`, or any other mapped status. The caller never auto-connects on an error.
 */
export async function detectAutoSyncEligibility(deps: AutoSyncEligibilityDeps): Promise<boolean> {
  const result = await deps.pull(0)
  return result.ok
}
