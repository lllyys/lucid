import { describe, it, expect, beforeEach } from 'vitest'
import { usePolishKeywordsStore } from './polishKeywordsStore'

beforeEach(() => {
  usePolishKeywordsStore.getState().reset()
})

describe('polishKeywordsStore', () => {
  it('starts empty', () => {
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })

  it('addKeyword trims and appends, de-duping exact repeats', () => {
    const { addKeyword } = usePolishKeywordsStore.getState()
    addKeyword('  inference  ')
    addKeyword('inference')
    addKeyword('neural net')
    expect(usePolishKeywordsStore.getState().keywords).toEqual(['inference', 'neural net'])
  })

  it('ignores an empty / whitespace-only keyword', () => {
    usePolishKeywordsStore.getState().addKeyword('   ')
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })

  it('removeKeyword removes the exact value', () => {
    const s = usePolishKeywordsStore.getState()
    s.addKeyword('alpha')
    s.addKeyword('beta')
    s.removeKeyword('alpha')
    expect(usePolishKeywordsStore.getState().keywords).toEqual(['beta'])
  })

  it('reset clears keywords', () => {
    usePolishKeywordsStore.getState().addKeyword('alpha')
    usePolishKeywordsStore.getState().reset()
    expect(usePolishKeywordsStore.getState().keywords).toEqual([])
  })
})
