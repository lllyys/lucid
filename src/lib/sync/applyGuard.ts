// Purpose: a synchronous suppression flag — the "echo guard" (#9 WI-7b-vi-d). The sync orchestrator
// commits pulled server changes by writing to the domain stores; the edit-tracking subscription
// (WI-7b-vi-d) must NOT mistake those writes for new local edits and re-enqueue them. zustand fires
// subscribers SYNCHRONOUSLY during setState, so wrapping the commit's store writes in `runSuppressed`
// lets the subscription skip them (`isApplyingSync()` is true) with no async coordination — JS is
// single-threaded and the writes are synchronous, so there is no race. Nestable: each call restores the
// prior flag (not a hard false), so an outer suppression survives an inner one.

let applying = false

export function isApplyingSync(): boolean {
  return applying
}

export function runSuppressed<T>(fn: () => T): T {
  const prev = applying
  applying = true
  try {
    return fn()
  } finally {
    applying = prev
  }
}
