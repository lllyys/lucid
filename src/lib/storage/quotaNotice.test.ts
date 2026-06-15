import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/components/workspace/notify', () => ({ notify: vi.fn() }))
import { notify } from '@/components/workspace/notify'
import { notifyStorageFull, __resetStorageNotice } from './quotaNotice'

const mockNotify = vi.mocked(notify)

beforeEach(() => {
  mockNotify.mockReset()
  __resetStorageNotice()
})

describe('notifyStorageFull', () => {
  it('notifies once, then is silent until reset', () => {
    notifyStorageFull()
    notifyStorageFull()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    __resetStorageNotice()
    notifyStorageFull()
    expect(mockNotify).toHaveBeenCalledTimes(2)
  })
})
