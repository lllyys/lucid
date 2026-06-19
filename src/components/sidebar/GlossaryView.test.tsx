import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '@/i18n'
import { GlossaryView } from './GlossaryView'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { useSessionStore, __resetSessionIds } from '@/stores/sessionStore'
import { usePolishKeywordsStore } from '@/stores/polishKeywordsStore'

beforeEach(() => {
  useGlossaryStore.getState().reset()
  usePolishKeywordsStore.getState().reset()
  __resetSessionIds()
  useSessionStore.getState().reset()
})

describe('GlossaryView (WI-6)', () => {
  it('shows the empty state with no terms', () => {
    render(<GlossaryView />)
    expect(screen.getByText(/saved domain terms live here/i)).toBeInTheDocument()
  })

  it('adds a term via Enter and shows the count', async () => {
    const user = userEvent.setup()
    render(<GlossaryView />)
    await user.type(screen.getByLabelText(/add a domain term/i), 'inference{Enter}')
    expect(useGlossaryStore.getState().terms.map((t) => t.label)).toEqual(['inference'])
    expect(screen.getByText('1 domain terms')).toBeInTheDocument()
  })

  it('removes a term via ×', async () => {
    useGlossaryStore.getState().addTerm('alpha')
    const user = userEvent.setup()
    render(<GlossaryView />)
    await user.click(screen.getByRole('button', { name: /remove alpha/i }))
    expect(useGlossaryStore.getState().terms).toHaveLength(0)
  })

  it('"use" injects the term into the Polish keywords store', async () => {
    useGlossaryStore.getState().addTerm('neural net')
    const user = userEvent.setup()
    render(<GlossaryView />)
    await user.click(screen.getByRole('button', { name: /use neural net/i }))
    expect(usePolishKeywordsStore.getState().keywords.map((k) => k.value)).toContain('neural net')
  })

  it('extracts candidate terms from the active session and adds a suggestion', async () => {
    useSessionStore.getState().newSession()
    useSessionStore.getState().addTask({
      kind: 'translate',
      title: 'note',
      sourceText: 'Quantum Computing is here. Quantum Computing wins.',
      resultText: '',
    })
    const user = userEvent.setup()
    render(<GlossaryView />)
    await user.click(screen.getByRole('button', { name: /extract from this session/i }))
    const suggestion = screen.getByRole('button', { name: /Quantum Computing ＋/i })
    await user.click(suggestion)
    expect(useGlossaryStore.getState().terms.map((t) => t.label)).toContain('Quantum Computing')
  })
})
