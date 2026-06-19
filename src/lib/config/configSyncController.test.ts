// WI-7 — headless config-sync controller: state machine, passphrase/unlock, sync-on-change, security invariants.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConfigSync, ConfigSyncErrorKind, ConfigSyncResult, SaveOutcome } from './configSync'
import type { SyncableConfig } from './providerConfigCodec'
import {
  createConfigSyncController,
  defaultProviderConfigAdapter,
  useConfigSyncStore,
  type ConfigSyncController,
  type ProviderConfigAdapter,
} from './configSyncController'
import { useProviderStore } from '@/stores/providerStore'

const CONFIG_A: SyncableConfig = {
  vendor: 'custom',
  models: { custom: 'gpt-4o-mini' },
  baseUrl: 'https://api.example.com/v1',
  apiKeys: { custom: 'sk-LOCAL-DONOTLEAK' },
  customProviders: {},
  activeCustomId: null,
}
const CONFIG_B: SyncableConfig = {
  vendor: 'anthropic',
  models: { anthropic: 'claude-fable-5' },
  baseUrl: '',
  apiKeys: { anthropic: 'sk-SERVER-SECRET' },
  customProviders: {},
  activeCustomId: null,
}

const ok = <T>(value: T): ConfigSyncResult<T> => ({ ok: true, value })
const err = <T>(error: ConfigSyncErrorKind): ConfigSyncResult<T> => ({ ok: false, error })

/** A fully-stubbed ConfigSync the controller wraps. Every method is a spy with a default. */
function stubSync(over: Partial<ConfigSync> = {}): ConfigSync & {
  loadAndDecrypt: ReturnType<typeof vi.fn>
  encryptAndSave: ReturnType<typeof vi.fn>
  readSyncedRev: ReturnType<typeof vi.fn>
  writeSyncedRev: ReturnType<typeof vi.fn>
} {
  let rev = 0
  return {
    loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
    encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 1 } as SaveOutcome)),
    readSyncedRev: vi.fn(() => rev),
    writeSyncedRev: vi.fn((r: number) => void (rev = r)),
    ...over,
  } as never
}

/** A fake provider-config adapter, decoupled from the real providerStore. Mirrors the real store: an
 *  `apply` (hydrate) ALSO notifies subscribers — so the controller's own writes must not re-arm a save
 *  (re-entrancy guard, security invariant 6). `emit` simulates a user edit. */
function fakeAdapter(initial: SyncableConfig): ProviderConfigAdapter & {
  apply: ReturnType<typeof vi.fn<(config: SyncableConfig) => void>>
  current: SyncableConfig
  emit: () => void
} {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const state = {
    current: { ...initial },
    read: () => state.current,
    apply: vi.fn<(config: SyncableConfig) => void>((c) => {
      state.current = c
      notify() // the real providerStore fires its subscribers when hydrated — exercise the guard
    }),
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    emit: notify,
  }
  return state
}

function make(opts: {
  sync?: ConfigSync
  adapter?: ProviderConfigAdapter
  secure?: boolean
  debounceMs?: number
} = {}): ConfigSyncController {
  return createConfigSyncController({
    sync: opts.sync ?? stubSync(),
    providerConfig: opts.adapter ?? fakeAdapter(CONFIG_A),
    hasSecureContext: () => opts.secure ?? true,
    debounceMs: opts.debounceMs ?? 800,
  })
}

beforeEach(() => {
  useConfigSyncStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('configSyncController — initial state', () => {
  it('starts in checking with no error and not dirty', () => {
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('checking')
    expect(s.error).toBeNull()
    expect(s.dirty).toBe(false)
  })
})

describe('configSyncController — init()', () => {
  it('insecure context → status insecure, error insecureContext, NO network call', async () => {
    const sync = stubSync()
    const c = make({ sync, secure: false })
    await c.init()
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('insecure')
    expect(s.error).toBe('insecureContext')
    expect(sync.loadAndDecrypt).not.toHaveBeenCalled()
  })

  it('no blob stored → status noConfig', async () => {
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)) })
    const c = make({ sync })
    await c.init()
    expect(useConfigSyncStore.getState().status).toBe('noConfig')
  })

  it('blob present (empty-probe decrypt FAILS → blob exists) → status locked (awaiting passphrase)', async () => {
    // The realistic probe: a real blob can't be decrypted with the empty probe passphrase → the failure
    // tells us a blob EXISTS, so we surface `locked`.
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(err('wrongPassphraseOrCorrupt')) })
    const c = make({ sync })
    await c.init()
    expect(useConfigSyncStore.getState().status).toBe('locked')
    expect(useConfigSyncStore.getState().error).toBeNull()
  })

  it('blob present whose empty-passphrase probe DECRYPTS → still locked (never adopt without unlock)', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok({ config: CONFIG_B, rev: 4 })) })
    const c = make({ sync, adapter })
    await c.init()
    expect(useConfigSyncStore.getState().status).toBe('locked')
    expect(adapter.apply).not.toHaveBeenCalled() // never adopt on the probe
  })

  it('unreachable on init → status error, error configUnreachable', async () => {
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(err('unreachable')) })
    const c = make({ sync })
    await c.init()
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('configUnreachable')
  })

  it('requestFailed on init → status error, error configRequestFailed', async () => {
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(err('requestFailed')) })
    const c = make({ sync })
    await c.init()
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('configRequestFailed')
  })

  it('init uses an empty-string probe passphrase only to detect blob presence', async () => {
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)) })
    const c = make({ sync })
    await c.init()
    expect(sync.loadAndDecrypt).toHaveBeenCalledTimes(1)
  })
})

describe('configSyncController — setPassphrase() first use', () => {
  it('from noConfig: encrypts current config, PUT applied → unlocked + records syncedRev', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 3 })),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase('correct horse battery')
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('unlocked')
    expect(sync.encryptAndSave).toHaveBeenCalledWith('correct horse battery', CONFIG_A, expect.any(Number))
    expect(sync.writeSyncedRev).toHaveBeenCalledWith(3)
  })

  it('setPassphrase encrypts the CURRENT live config (read at save time), never a stale snapshot', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)) })
    const c = make({ sync, adapter })
    await c.init()
    adapter.current = CONFIG_B // user changed config after init
    await c.setPassphrase('pw')
    expect(sync.encryptAndSave).toHaveBeenCalledWith('pw', CONFIG_B, expect.any(Number))
  })

  it('PUT 409 on first save → re-pull + adopt server config + unlocked', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'conflict', config: CONFIG_B, rev: 7 })),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase('pw')
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('unlocked')
    expect(adapter.apply).toHaveBeenCalledWith(CONFIG_B)
    expect(sync.writeSyncedRev).toHaveBeenLastCalledWith(7)
  })

  it('PUT unreachable on first save → error configUnreachable, stays out of unlocked', async () => {
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(err('unreachable')),
    })
    const c = make({ sync })
    await c.init()
    await c.setPassphrase('pw')
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('configUnreachable')
  })

  it('setPassphrase in an insecure context → insecure (encrypt rejects)', async () => {
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(err('insecureContext')),
    })
    const c = make({ sync })
    await c.init()
    await c.setPassphrase('pw')
    expect(useConfigSyncStore.getState().status).toBe('insecure')
  })
})

describe('configSyncController — unlock() returning device', () => {
  it('wrong passphrase / corrupt → error wrongPassphraseOrCorrupt, STAYS locked, providerStore UNCHANGED', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 })) // init probe sees a blob → locked
        .mockResolvedValueOnce(err('wrongPassphraseOrCorrupt')), // unlock attempt fails
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.unlock('WRONG')
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('locked')
    expect(s.error).toBe('wrongPassphraseOrCorrupt')
    expect(adapter.apply).not.toHaveBeenCalled()
  })

  it('correct passphrase, rev > syncedRev, not dirty → hydrate providerStore + unlocked + syncedRev', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 }))
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 })),
      readSyncedRev: vi.fn(() => 2),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.unlock('pw')
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('unlocked')
    expect(adapter.apply).toHaveBeenCalledWith(CONFIG_B)
    expect(sync.writeSyncedRev).toHaveBeenCalledWith(5)
  })

  it('correct passphrase but rev <= syncedRev → unlocked WITHOUT adopting (local already current)', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 }))
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 })),
      readSyncedRev: vi.fn(() => 5),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.unlock('pw')
    expect(useConfigSyncStore.getState().status).toBe('unlocked')
    expect(adapter.apply).not.toHaveBeenCalled()
  })

  it('unlock returns null blob (server cleared) → unlocked, nothing adopted', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 }))
        .mockResolvedValueOnce(ok(null)),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.unlock('pw')
    expect(useConfigSyncStore.getState().status).toBe('unlocked')
    expect(adapter.apply).not.toHaveBeenCalled()
  })

  it('unlock unreachable → error configUnreachable, stays locked', async () => {
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 }))
        .mockResolvedValueOnce(err('unreachable')),
    })
    const c = make({ sync })
    await c.init()
    await c.unlock('pw')
    const s = useConfigSyncStore.getState()
    expect(s.status).toBe('locked')
    expect(s.error).toBe('configUnreachable')
  })
})

describe('configSyncController — dirty guard (security invariant 5)', () => {
  it('a local edit during the async load window is NOT clobbered by the server adopt', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    let resolvePull: (v: ConfigSyncResult<{ config: SyncableConfig; rev: number } | null>) => void = () => {}
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 })) // init → locked
        .mockImplementationOnce(
          () => new Promise((res) => (resolvePull = res)), // unlock pull, resolved later
        ),
      readSyncedRev: vi.fn(() => 0),
    })
    const c = make({ sync, adapter })
    await c.init()
    const unlocking = c.unlock('pw')
    // user edits config WHILE the pull is in flight → dirty
    adapter.emit()
    resolvePull(ok({ config: CONFIG_B, rev: 5 }))
    await unlocking
    // dirty was set during the window → the server config must NOT be adopted
    expect(adapter.apply).not.toHaveBeenCalled()
    expect(useConfigSyncStore.getState().status).toBe('unlocked')
  })
})

describe('configSyncController — sync-on-change (after unlock)', () => {
  it('a config change sets dirty then debounced PUT applied → syncedRev advances + dirty cleared', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi
        .fn()
        .mockResolvedValueOnce(ok({ status: 'applied', rev: 1 })) // first save (setPassphrase)
        .mockResolvedValueOnce(ok({ status: 'applied', rev: 2 })), // the change-driven save
    })
    const c = make({ sync, adapter, debounceMs: 800 })
    await c.init()
    await c.setPassphrase('pw')
    sync.encryptAndSave.mockClear()
    adapter.current = CONFIG_B
    adapter.emit()
    expect(useConfigSyncStore.getState().dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(800)
    expect(sync.encryptAndSave).toHaveBeenCalledWith('pw', CONFIG_B, 1)
    expect(useConfigSyncStore.getState().dirty).toBe(false)
    expect(useConfigSyncStore.getState().syncedRev).toBe(2)
  })

  it('rapid repeated changes coalesce into a SINGLE debounced PUT', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 9 })),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase('pw')
    sync.encryptAndSave.mockClear()
    adapter.emit()
    await vi.advanceTimersByTimeAsync(100)
    adapter.emit()
    await vi.advanceTimersByTimeAsync(100)
    adapter.emit()
    await vi.advanceTimersByTimeAsync(800)
    expect(sync.encryptAndSave).toHaveBeenCalledTimes(1)
  })

  it('a 409 on a change-driven save → re-pull + adopt server config, resets syncedRev, terminates (no loop)', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi
        .fn()
        .mockResolvedValueOnce(ok({ status: 'applied', rev: 1 })) // setPassphrase
        .mockResolvedValueOnce(ok({ status: 'conflict', config: CONFIG_B, rev: 8 })), // change → 409
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase('pw')
    adapter.apply.mockClear()
    adapter.emit()
    await vi.advanceTimersByTimeAsync(800)
    expect(adapter.apply).toHaveBeenCalledWith(CONFIG_B)
    expect(useConfigSyncStore.getState().syncedRev).toBe(8)
    // terminates: the conflict adopt does NOT itself trigger another PUT
    expect(sync.encryptAndSave).toHaveBeenCalledTimes(2)
  })

  it('no sync-on-change before unlock: a change while locked does NOT save', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok({ config: CONFIG_B, rev: 5 })) })
    const c = make({ sync, adapter })
    await c.init() // locked
    adapter.emit()
    await vi.advanceTimersByTimeAsync(2000)
    expect(sync.encryptAndSave).not.toHaveBeenCalled()
  })

  it('defensive: an edit while status is unlocked but no passphrase set (never happens normally) does NOT save', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)) })
    const c = make({ sync, adapter })
    await c.init() // noConfig + subscription attached, passphrase still null
    useConfigSyncStore.getState().set({ status: 'unlocked' }) // force the impossible state
    adapter.emit()
    await vi.advanceTimersByTimeAsync(2000)
    expect(sync.encryptAndSave).not.toHaveBeenCalled() // the null-passphrase guard holds
  })
})

describe('configSyncController — retry()', () => {
  it('retry after an init error re-attempts the probe and can recover to noConfig', async () => {
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(err('unreachable')) // init fails
        .mockResolvedValueOnce(ok(null)), // retry succeeds
    })
    const c = make({ sync })
    await c.init()
    expect(useConfigSyncStore.getState().status).toBe('error')
    await c.retry()
    expect(useConfigSyncStore.getState().status).toBe('noConfig')
  })
})

describe('configSyncController — workLocalOnly()', () => {
  it('transitions to localOnly and stops sync-on-change', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok({ config: CONFIG_B, rev: 5 })) })
    const c = make({ sync, adapter })
    await c.init()
    c.workLocalOnly()
    expect(useConfigSyncStore.getState().status).toBe('localOnly')
    adapter.emit()
    await vi.advanceTimersByTimeAsync(2000)
    expect(sync.encryptAndSave).not.toHaveBeenCalled()
  })
})

describe('configSyncController — dispose()', () => {
  it('dispose unsubscribes: a later change does not save', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)) })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase('pw')
    sync.encryptAndSave.mockClear()
    c.dispose()
    adapter.emit()
    await vi.advanceTimersByTimeAsync(2000)
    expect(sync.encryptAndSave).not.toHaveBeenCalled()
  })

  it('dispose cancels an IN-FLIGHT debounce timer: a pending save never fires', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 1 })),
    })
    const c = make({ sync, adapter, debounceMs: 800 })
    await c.init()
    await c.setPassphrase('pw')
    sync.encryptAndSave.mockClear()
    adapter.emit() // schedules the debounced save (editTimer set)
    await vi.advanceTimersByTimeAsync(100) // timer pending, not yet fired
    c.dispose() // must clear the pending timer
    await vi.advanceTimersByTimeAsync(2000)
    expect(sync.encryptAndSave).not.toHaveBeenCalled()
  })
})

describe('configSyncController — security invariants', () => {
  const PASS = 'super secret passphrase'

  // Invariant 1: the passphrase/derived key are NEVER written to any persisted storage; the only thing
  // the controller persists is the non-secret syncedRev (which configSync owns via writeSyncedRev).
  it('inv1: setPassphrase/unlock persist ONLY syncedRev — never the passphrase or any plaintext', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 1 })),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase(PASS)
    // The controller's only persistence call is writeSyncedRev with a NUMBER — never the passphrase.
    for (const call of sync.writeSyncedRev.mock.calls) {
      expect(typeof call[0]).toBe('number')
    }
    // The store the UI reads must hold no secret material.
    const stateJson = JSON.stringify(useConfigSyncStore.getState())
    expect(stateJson).not.toContain(PASS)
    expect(stateJson).not.toContain('sk-LOCAL-DONOTLEAK')
  })

  // Invariant 2: no plaintext config / blob / key is ever console.* logged.
  it('inv2: no console.* call contains the passphrase, the key, or the plaintext config', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 }))
        .mockResolvedValueOnce(err('wrongPassphraseOrCorrupt')),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 1 })),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.unlock(PASS) // exercise the failure path too
    const logged = spies.flatMap((s) => s.mock.calls.flat().map((a) => JSON.stringify(a)))
    for (const line of logged) {
      expect(line).not.toContain(PASS)
      expect(line).not.toContain('sk-LOCAL-DONOTLEAK')
      expect(line).not.toContain('sk-SERVER-SECRET')
    }
  })

  // Invariant 3: the PUT body the controller sends is the ciphertext blob from configSync — never
  // plaintext. The controller delegates to encryptAndSave(passphrase, config, baseRev); it must pass the
  // SyncableConfig to encrypt, never a pre-serialized plaintext, and never bypass configSync.
  it('inv3: the controller only ever PUTs via configSync.encryptAndSave (ciphertext path), never raw', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi.fn().mockResolvedValue(ok({ status: 'applied', rev: 1 })),
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase(PASS)
    expect(sync.encryptAndSave).toHaveBeenCalledTimes(1)
    // The save goes through configSync with the passphrase + the live config — encryption is configSync's job.
    expect(sync.encryptAndSave).toHaveBeenCalledWith(PASS, CONFIG_A, expect.any(Number))
  })

  // Invariant 4: a wrong passphrase / corrupt blob leaves the providerStore UNCHANGED (no partial hydrate).
  it('inv4: wrong passphrase → providerStore adapter.apply never called, no crash', async () => {
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi
        .fn()
        .mockResolvedValueOnce(ok({ config: CONFIG_B, rev: 5 }))
        .mockResolvedValueOnce(err('wrongPassphraseOrCorrupt')),
    })
    const c = make({ sync, adapter })
    await c.init()
    await expect(c.unlock('WRONG')).resolves.not.toThrow()
    expect(adapter.apply).not.toHaveBeenCalled()
    expect(adapter.current).toEqual(CONFIG_A) // unchanged
  })

  // Invariant 6: the 409 re-pull path terminates — a single conflict adopt does not loop into more PUTs.
  it('inv6: a 409 conflict adopt does not re-trigger a save loop', async () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(CONFIG_A)
    const sync = stubSync({
      loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)),
      encryptAndSave: vi
        .fn()
        .mockResolvedValueOnce(ok({ status: 'applied', rev: 1 })) // setPassphrase
        .mockResolvedValueOnce(ok({ status: 'conflict', config: CONFIG_B, rev: 8 })), // change → 409
    })
    const c = make({ sync, adapter })
    await c.init()
    await c.setPassphrase(PASS)
    adapter.emit()
    await vi.advanceTimersByTimeAsync(800)
    // Let any (erroneous) follow-on debounce fire — it must NOT.
    await vi.advanceTimersByTimeAsync(2000)
    expect(sync.encryptAndSave).toHaveBeenCalledTimes(2) // setPassphrase + the one conflicting save; no loop
  })
})

describe('configSyncController — default providerStore adapter', () => {
  beforeEach(() => {
    useProviderStore.getState().reset()
  })

  it('read() snapshots vendor/models/baseUrl/apiKeys from the real providerStore', () => {
    const store = useProviderStore.getState()
    store.setVendor('openai')
    store.setApiKey('sk-openai-xyz', 'openai')
    store.setModel('gpt-4o', 'openai')
    const a = defaultProviderConfigAdapter()
    const config = a.read()
    expect(config.vendor).toBe('openai')
    expect(config.apiKeys.openai).toBe('sk-openai-xyz')
    expect(config.models.openai).toBe('gpt-4o')
    expect(typeof config.baseUrl).toBe('string')
  })

  it('apply() hydrates the real providerStore (vendor/model/key/baseUrl), keeping the mirrors in sync', () => {
    const a = defaultProviderConfigAdapter()
    a.apply({
      vendor: 'anthropic',
      models: { anthropic: 'claude-fable-5' },
      apiKeys: { anthropic: 'sk-ant-123' },
      baseUrl: '',
      customProviders: {},
      activeCustomId: null,
    })
    const s = useProviderStore.getState()
    expect(s.vendor).toBe('anthropic')
    expect(s.apiKey).toBe('sk-ant-123') // active-vendor mirror
    expect(s.model).toBe('claude-fable-5')
  })

  it('apply() drops an unknown vendor + a non-vendor model/key key (defensive against a hostile blob)', () => {
    const a = defaultProviderConfigAdapter()
    const before = useProviderStore.getState().vendor
    a.apply({
      vendor: 'not-a-vendor',
      models: { 'bad-key': 'x', openai: 'gpt-4o' },
      apiKeys: { 'bad-key': 'y', openai: 'sk-ok' },
      baseUrl: 'https://x',
      customProviders: {},
      activeCustomId: null,
    })
    const s = useProviderStore.getState()
    expect(s.vendor).toBe(before) // unknown vendor ignored
    expect(s.models.openai).toBe('gpt-4o') // known vendor applied
    expect(s.apiKeys.openai).toBe('sk-ok')
    expect(s.baseUrl).toBe('https://x')
  })

  it('read() snapshots the custom providers (incl. their keys) + activeCustomId from the real store', () => {
    const store = useProviderStore.getState()
    const id = store.addCustomProvider({
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      key: 'sk-DEEPSEEK-SYNC',
    })
    useProviderStore.getState().setVendor({ type: 'custom', id })
    const config = defaultProviderConfigAdapter().read()
    expect(config.activeCustomId).toBe(id)
    expect(config.customProviders[id]).toMatchObject({
      id,
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      key: 'sk-DEEPSEEK-SYNC', // the key rides into the (to-be-encrypted) config
    })
  })

  it('apply() hydrates the custom providers (with keys) + activeCustomId into the real store', () => {
    const a = defaultProviderConfigAdapter()
    a.apply({
      vendor: 'custom',
      models: {},
      apiKeys: {},
      baseUrl: '',
      customProviders: {
        c1: {
          id: 'c1',
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          key: 'sk-FROM-SERVER',
          testResult: { status: 'idle' },
        },
      },
      activeCustomId: 'c1',
    })
    const s = useProviderStore.getState()
    expect(s.customProviders.c1).toMatchObject({ id: 'c1', label: 'DeepSeek', key: 'sk-FROM-SERVER' })
    expect(s.activeCustomId).toBe('c1')
    expect(s.vendor).toBe('custom')
  })

  it('subscribe() fires the callback on a providerStore change and unsubscribes', () => {
    const a = defaultProviderConfigAdapter()
    const cb = vi.fn()
    const unsub = a.subscribe(cb)
    useProviderStore.getState().setBaseUrl('https://changed')
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    unsub()
    useProviderStore.getState().setBaseUrl('https://again')
    expect(cb).not.toHaveBeenCalled()
  })

  it('subscribe() fires on a custom-provider edit (so adding/editing a custom re-encrypts + saves)', () => {
    const a = defaultProviderConfigAdapter()
    const cb = vi.fn()
    a.subscribe(cb)
    const id = useProviderStore.getState().addCustomProvider({ label: 'DS', baseUrl: 'u', model: 'm', key: 'sk-x' })
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    useProviderStore.getState().updateCustomProvider(id, { key: 'sk-edited' })
    expect(cb).toHaveBeenCalled()
  })
})

describe('configSyncController — construction with no injected deps', () => {
  it('builds with defaults (real configSync + providerStore adapter + secure-context probe + 800ms debounce)', () => {
    const c = createConfigSyncController()
    expect(typeof c.init).toBe('function')
    expect(typeof c.setPassphrase).toBe('function')
    expect(typeof c.unlock).toBe('function')
    expect(typeof c.retry).toBe('function')
    expect(typeof c.workLocalOnly).toBe('function')
    expect(typeof c.dispose).toBe('function')
    c.dispose() // tear down cleanly (no subscription attached yet → no throw)
  })

  it('init() with the default secure-context probe reaches a terminal status (jsdom exposes crypto.subtle)', async () => {
    const c = createConfigSyncController({ sync: stubSync({ loadAndDecrypt: vi.fn().mockResolvedValue(ok(null)) }) })
    await c.init()
    // jsdom/node exposes crypto.subtle → secure; the stubbed empty probe returns null → noConfig.
    expect(useConfigSyncStore.getState().status).toBe('noConfig')
    c.dispose()
  })
})
