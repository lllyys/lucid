// Purpose: group a word-level diff into ATOMIC hunks for per-hunk accept/reject (feature #4,
// WI-6 — #15a). A replacement is a `del` immediately followed by an `add`; toggling only the
// `add` would leave the `del` in place and produce incoherent "oldnew" text (plan v4 §3). So a
// del+add pair is ONE hunk whose two segment ids accept/reject together. `same` segments are
// context and never belong to a hunk. Pure logic, unit-tested against applyDiff (rule 66 §2).

import type { DiffSegment } from './wordDiff'

export type HunkKind = 'change' | 'add' | 'del'

export interface Hunk {
  /** Stable id for the hunk (the first segment's id) — keys the reject toggle. */
  id: string
  kind: HunkKind
  /** Segment ids that must accept/reject together (del+add for a change). */
  segmentIds: string[]
}

/** Group a diff into atomic hunks, pairing each adjacent del→add into one `change`. */
export function groupHunks(segments: DiffSegment[]): Hunk[] {
  const hunks: Hunk[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'same') continue
    if (seg.type === 'del') {
      const next = segments[i + 1]
      if (next && next.type === 'add') {
        hunks.push({ id: seg.id, kind: 'change', segmentIds: [seg.id, next.id] })
        i++ // consume the paired add
      } else {
        hunks.push({ id: seg.id, kind: 'del', segmentIds: [seg.id] })
      }
    } else {
      // a standalone add (a del+add pair is consumed above)
      hunks.push({ id: seg.id, kind: 'add', segmentIds: [seg.id] })
    }
  }
  return hunks
}

/**
 * The acceptedIds set for `applyDiff`, given which hunks the user REJECTED. A hunk's changes
 * apply unless it is rejected — so the default (no rejects) yields the full polished result, and
 * rejecting a hunk reverts exactly that change. Rejected hunks contribute no ids (their `add`s
 * are excluded and their `del`s kept, restoring the original for that span).
 */
export function acceptedIdsForRejected(hunks: Hunk[], rejectedHunkIds: ReadonlySet<string>): Set<string> {
  const accepted = new Set<string>()
  for (const hunk of hunks) {
    if (rejectedHunkIds.has(hunk.id)) continue
    for (const id of hunk.segmentIds) accepted.add(id)
  }
  return accepted
}
