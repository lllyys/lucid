import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy / conditional values', () => {
    expect(cn('a', false, undefined, null, '', 'c')).toBe('a c')
  })

  it('de-conflicts Tailwind utilities (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })

  it('accepts arrays and objects (clsx forms)', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c')
  })
})
