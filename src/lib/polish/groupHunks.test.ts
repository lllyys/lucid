import { describe, it, expect } from 'vitest'
import { groupHunks, acceptedIdsForRejected } from './groupHunks'
import { applyDiff, type DiffSegment } from './wordDiff'

const s = (id: string, value: string): DiffSegment => ({ id, type: 'same', value })
const del = (id: string, value: string): DiffSegment => ({ id, type: 'del', value })
const add = (id: string, value: string): DiffSegment => ({ id, type: 'add', value })

describe('groupHunks', () => {
  it('pairs an adjacent del+add into one atomic change hunk (both ids)', () => {
    const segs = [s('s0', 'the '), del('d0', 'cat'), add('a0', 'dog'), s('s1', ' sat')]
    const hunks = groupHunks(segs)
    expect(hunks).toEqual([{ id: 'd0', kind: 'change', segmentIds: ['d0', 'a0'] }])
  })

  it('treats a standalone add as its own hunk', () => {
    const hunks = groupHunks([s('s0', 'a '), add('a0', 'big '), s('s1', 'cat')])
    expect(hunks).toEqual([{ id: 'a0', kind: 'add', segmentIds: ['a0'] }])
  })

  it('treats a standalone del as its own hunk', () => {
    const hunks = groupHunks([s('s0', 'a '), del('d0', 'big '), s('s1', 'cat')])
    expect(hunks).toEqual([{ id: 'd0', kind: 'del', segmentIds: ['d0'] }])
  })

  it('never puts a same segment in a hunk and handles multiple changes', () => {
    const segs = [del('d0', 'A'), add('a0', 'B'), s('s0', ' x '), del('d1', 'C'), add('a1', 'D')]
    expect(groupHunks(segs)).toEqual([
      { id: 'd0', kind: 'change', segmentIds: ['d0', 'a0'] },
      { id: 'd1', kind: 'change', segmentIds: ['d1', 'a1'] },
    ])
  })

  it('returns no hunks for an all-same diff', () => {
    expect(groupHunks([s('s0', 'unchanged')])).toEqual([])
  })

  it('an add not preceded by a del (add then del order) splits into two hunks', () => {
    const hunks = groupHunks([add('a0', 'new'), del('d0', 'old')])
    expect(hunks).toEqual([
      { id: 'a0', kind: 'add', segmentIds: ['a0'] },
      { id: 'd0', kind: 'del', segmentIds: ['d0'] },
    ])
  })
})

describe('acceptedIdsForRejected (round-trips through applyDiff)', () => {
  // original "the cat sat" → result "the dog sat" via one change hunk
  const segs = [s('s0', 'the '), del('d0', 'cat'), add('a0', 'dog'), s('s1', ' sat')]
  const hunks = groupHunks(segs)

  it('no rejects ⇒ full polished result', () => {
    const accepted = acceptedIdsForRejected(hunks, new Set())
    expect(applyDiff(segs, accepted)).toBe('the dog sat')
  })

  it('rejecting the change hunk ⇒ original text restored', () => {
    const accepted = acceptedIdsForRejected(hunks, new Set(['d0']))
    expect(applyDiff(segs, accepted)).toBe('the cat sat')
  })

  it('partial accept across two changes keeps one, reverts the other', () => {
    const two = [s('s0', 'the '), del('d0', 'cat'), add('a0', 'dog'), s('s1', ' and '), del('d1', 'red'), add('a1', 'blue')]
    const hs = groupHunks(two)
    // reject the second hunk only (id d1)
    const accepted = acceptedIdsForRejected(hs, new Set(['d1']))
    expect(applyDiff(two, accepted)).toBe('the dog and red')
  })

  it('a rejected standalone add is dropped; a rejected standalone del is kept', () => {
    const ins = [s('s0', 'a '), add('a0', 'big '), s('s1', 'cat')]
    const insHunks = groupHunks(ins)
    expect(applyDiff(ins, acceptedIdsForRejected(insHunks, new Set()))).toBe('a big cat')
    expect(applyDiff(ins, acceptedIdsForRejected(insHunks, new Set(['a0'])))).toBe('a cat')

    const rm = [s('s0', 'a '), del('d0', 'big '), s('s1', 'cat')]
    const rmHunks = groupHunks(rm)
    expect(applyDiff(rm, acceptedIdsForRejected(rmHunks, new Set()))).toBe('a cat')
    expect(applyDiff(rm, acceptedIdsForRejected(rmHunks, new Set(['d0'])))).toBe('a big cat')
  })
})
