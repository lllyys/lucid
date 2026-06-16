// Purpose: tiny, dependency-free runtime type guards shared across the store migrations and the sync
// layer (#9). `isRecord` is the "is this a non-null object?" primitive that every never-throwing
// migration and every untrusted-server-response parser needs. Kept neutral (not under any feature
// dir) so the stores and `src/lib/sync` both import it without a cross-feature dependency.

/**
 * True iff `v` is a non-null object — a value we can safely index as `Record<string, unknown>`.
 * Narrows `unknown`. Arrays are objects too (this returns true for them), matching the prior inline
 * guards: callers that want a non-array record pair this with an `Array.isArray` check.
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
