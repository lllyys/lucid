// Purpose: a one-time, localized notice that a persisted-store write failed (feature #3). Wired as
// `onWriteError` for safeJSONStorage in the session, glossary + keywords stores so a full/blocked
// localStorage is surfaced once (rule 65 §4 — a failed save is not silent) rather than spamming a
// toast per write.

import { notify } from '@/components/workspace/notify'
import i18n from '@/i18n'

let notified = false

/** Surface the storage-full notice at most once per session. */
export function notifyStorageFull(): void {
  if (notified) return
  notified = true
  notify(i18n.t('error.storageFull'))
}

/** Test seam — reset the once-guard. */
export function __resetStorageNotice(): void {
  notified = false
}
