// WI-1 — detectAutoSyncEligibility: token-free single-origin probe over the injected backend.pull(0).
import { describe, it, expect, vi } from 'vitest'
import { detectAutoSyncEligibility } from './singleOriginAuto'
import type { BackendResult } from './backend'
import type { PullResult, SyncError } from './types'

const okPull = (): Promise<BackendResult<PullResult>> =>
  Promise.resolve({ ok: true, value: { changes: [], maxRev: 0 } })

describe('detectAutoSyncEligibility', () => {
  it('is eligible when pull(0) answers with a real PullResult (token-free single-origin server)', async () => {
    const pull = vi.fn(okPull)
    expect(await detectAutoSyncEligibility({ pull })).toBe(true)
    // probes the initial cursor — `?since=0` is what the REST backend's pull(0) sends + validates.
    expect(pull).toHaveBeenCalledWith(0)
  })

  // Every transport/auth/shape failure → ineligible. `auth` = a tokened server (stays opt-in);
  // `badRequest` = an HTML/garbage body failing isPullResult (e.g. a re-hosted dist/ with no backend);
  // `unreachable` = network down / 5xx; a non-auth HTTP status maps to one of these too.
  it.each<{ desc: string; error: SyncError }>([
    { desc: 'auth (401/403 — a tokened server)', error: { kind: 'auth' } },
    { desc: 'badRequest (HTML/garbage body fails isPullResult — a re-hosted dist/)', error: { kind: 'badRequest' } },
    { desc: 'unreachable (network down — no server)', error: { kind: 'unreachable' } },
    { desc: 'a non-auth HTTP status the backend mapped (e.g. 500 → unreachable)', error: { kind: 'unreachable', detail: 'HTTP 500' } },
  ])('is ineligible when pull(0) fails with $desc', async ({ error }) => {
    const pull = vi.fn(() => Promise.resolve<BackendResult<PullResult>>({ ok: false, error }))
    expect(await detectAutoSyncEligibility({ pull })).toBe(false)
  })
})
